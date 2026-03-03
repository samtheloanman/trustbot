const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const puppeteer = require('puppeteer');

// Handlebars helpers
Handlebars.registerHelper('or', (a, b) => a || b);
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('not', (a) => !a);
Handlebars.registerHelper('add', (a, b) => a + b);
Handlebars.registerHelper('formatDate', (dateStr) => {
    if (!dateStr) return '_____________';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
});
Handlebars.registerHelper('ordinal', (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
});
Handlebars.registerHelper('totalShares', (beneficiaries) => {
    if (!Array.isArray(beneficiaries)) return 0;
    return beneficiaries.reduce((sum, b) => sum + (parseFloat(b.share) || 0), 0);
});

/**
 * Prepare and enrich form data before injecting into templates
 */
function prepareData(raw) {
    // Parse the execution date
    const dateStr = raw.execution_date || new Date().toISOString().split('T')[0];
    const execDate = new Date(dateStr + 'T12:00:00');
    const dayNum = execDate.getDate();
    const s = ['th', 'st', 'nd', 'rd'];
    const v = dayNum % 100;
    const daySuffix = s[(v - 20) % 10] || s[v] || s[0];

    // Parse beneficiaries (may come as arrays from form or JSON)
    let beneficiaries = [];
    if (raw.beneficiaries) {
        // Sent as JSON string from form
        try { beneficiaries = JSON.parse(raw.beneficiaries); } catch (e) { beneficiaries = []; }
    } else if (Array.isArray(raw.beneficiary_name)) {
        raw.beneficiary_name.forEach((name, i) => {
            if (name) beneficiaries.push({
                name,
                city: (raw.beneficiary_city || [])[i] || '',
                state: (raw.beneficiary_state || [])[i] || 'California',
                share: (raw.beneficiary_share || [])[i] || '0',
            });
        });
    }

    // Parse properties (Schedule A)
    let properties = [];
    if (raw.properties) {
        try { properties = JSON.parse(raw.properties); } catch (e) { properties = []; }
    }

    // Parse successor trustees
    const successorTrustees = [];
    for (let i = 1; i <= 3; i++) {
        const name = raw[`successor_trustee_${i}_name`];
        if (name) {
            successorTrustees.push({
                name,
                city: raw[`successor_trustee_${i}_city`] || '',
                state: raw[`successor_trustee_${i}_state`] || 'California',
            });
        }
    }

    const isMarried = raw.marital_status === 'married';

    return {
        // Grantor
        grantor_name: raw.grantor_name || '',
        grantor_city: raw.grantor_city || '',
        grantor_state: raw.grantor_state || 'California',
        // Trust
        trust_name: raw.trust_name || `The ${raw.grantor_name} Revocable Living Trust`,
        // Trustees
        grantor_is_primary_trustee: true,
        successor_trustees: successorTrustees,
        successor_trustee_list: successorTrustees.map(t => `${t.name} of ${t.city}, ${t.state}`).join(' and '),
        // Beneficiaries
        beneficiaries,
        // Properties
        properties,
        // Marital
        is_married: isMarried,
        spouse_name: raw.spouse_name || '',
        // Healthcare directive
        healthcare_agent_name: raw.healthcare_agent_name || (successorTrustees[0] ? successorTrustees[0].name : ''),
        healthcare_agent_city: raw.healthcare_agent_city || (successorTrustees[0] ? successorTrustees[0].city : ''),
        alternate_healthcare_agent: raw.alternate_healthcare_agent || (successorTrustees[1] ? successorTrustees[1].name : ''),
        life_sustaining_treatment: raw.life_sustaining_treatment || 'comfort_only',
        organ_donation: raw.organ_donation === 'yes',
        organ_donation_purpose: raw.organ_donation_purpose || 'any',
        primary_physician_name: raw.primary_physician_name || '',
        // Financial POA
        financial_agent_name: raw.financial_agent_name || (successorTrustees[0] ? successorTrustees[0].name : ''),
        financial_agent_city: raw.financial_agent_city || (successorTrustees[0] ? successorTrustees[0].city : ''),
        alternate_financial_agent: raw.alternate_financial_agent || (successorTrustees[1] ? successorTrustees[1].name : ''),
        // Date fields
        execution_date_raw: dateStr,
        execution_day: dayNum,
        execution_day_ordinal: dayNum + daySuffix,
        execution_month: execDate.toLocaleString('en-US', { month: 'long' }),
        execution_year: execDate.getFullYear(),
        execution_city: raw.execution_city || raw.grantor_city || '',
        execution_state: raw.execution_state || 'California',
        notary_county: raw.notary_county || 'San Luis Obispo',
        current_year: new Date().getFullYear(),
    };
}

/**
 * Render a single HTML template to PDF buffer
 */
async function renderToPDF(browser, templateName, data) {
    const templatePath = path.join(__dirname, 'templates', templateName);
    const templateSrc = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateSrc);
    const html = template(data);

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
        format: 'Letter',
        margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
        printBackground: true,
    });
    await page.close();
    return pdf;
}

/**
 * Main entry point: generate all docs and return PDF buffers
 */
async function generateTrustPackage(rawData) {
    const data = prepareData(rawData);
    const safeName = data.grantor_name.replace(/[^a-z0-9]/gi, '_');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const docs = [
            { template: 'living_trust.html', suffix: 'Living_Trust' },
            { template: 'healthcare_directive.html', suffix: 'Healthcare_Directive' },
            { template: 'financial_poa.html', suffix: 'Financial_POA' },
            { template: 'hipaa.html', suffix: 'HIPAA_Authorization' },
            { template: 'pour_over_will.html', suffix: 'Pour_Over_Will' },
        ];

        const pdfBuffers = [];
        const fileNames = [];

        for (const doc of docs) {
            const buf = await renderToPDF(browser, doc.template, data);
            pdfBuffers.push(buf);
            fileNames.push(`${safeName}_${doc.suffix}.pdf`);
        }

        return { pdfBuffers, fileNames };
    } finally {
        await browser.close();
    }
}

module.exports = { generateTrustPackage };
