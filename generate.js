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
 * Parse JSON safely (handles string or array/object input)
 */
function safeJSON(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return []; }
}

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

    // Parse beneficiaries
    let beneficiaries = safeJSON(raw.beneficiaries);
    if (!Array.isArray(beneficiaries)) beneficiaries = [];

    // Legacy format support
    if (beneficiaries.length === 0 && Array.isArray(raw.beneficiary_name)) {
        raw.beneficiary_name.forEach((name, i) => {
            if (name) beneficiaries.push({
                name,
                city: (raw.beneficiary_city || [])[i] || '',
                state: (raw.beneficiary_state || [])[i] || 'California',
                share: (raw.beneficiary_share || [])[i] || '0',
                relationship: '',
                alternate: '',
                rank: 'A',
            });
        });
    }

    // Parse properties (Schedule A)
    let properties = safeJSON(raw.properties);

    // Parse children
    let children = safeJSON(raw.children);

    // Parse gifts
    let gifts = safeJSON(raw.gifts);

    // Parse successor trustees
    const successorTrustees = [];
    for (let i = 1; i <= 3; i++) {
        const name = raw[`successor_trustee_${i}_name`];
        if (name) {
            successorTrustees.push({
                name,
                address: raw[`successor_trustee_${i}_address`] || '',
                city: raw[`successor_trustee_${i}_city`] || '',
                state: raw[`successor_trustee_${i}_state`] || 'California',
                zip: raw[`successor_trustee_${i}_zip`] || '',
                phone: raw[`successor_trustee_${i}_phone`] || '',
            });
        }
    }

    // Parse guardians
    const guardians = [];
    for (let i = 1; i <= 2; i++) {
        const name = raw[`guardian_${i}_name`];
        if (name) {
            guardians.push({
                name,
                address: raw[`guardian_${i}_address`] || '',
                city: raw[`guardian_${i}_city`] || '',
                state: raw[`guardian_${i}_state`] || 'California',
                zip: raw[`guardian_${i}_zip`] || '',
                phone: raw[`guardian_${i}_phone`] || '',
            });
        }
    }

    // Parse custodians
    const custodians = [];
    for (let i = 1; i <= 2; i++) {
        const name = raw[`custodian_${i}_name`];
        if (name) {
            custodians.push({
                name,
                address: raw[`custodian_${i}_address`] || '',
                city: raw[`custodian_${i}_city`] || '',
                state: raw[`custodian_${i}_state`] || 'California',
                zip: raw[`custodian_${i}_zip`] || '',
                phone: raw[`custodian_${i}_phone`] || '',
            });
        }
    }

    // Parse healthcare agents
    const healthcareAgents = [];
    const haNames = [raw.healthcare_agent_name, raw.alternate_healthcare_agent, raw.healthcare_agent_3_name];
    for (let i = 0; i < 3; i++) {
        if (haNames[i]) {
            const prefix = i === 0 ? 'healthcare_agent_1' : i === 1 ? 'healthcare_agent_2' : 'healthcare_agent_3';
            healthcareAgents.push({
                name: haNames[i],
                gender: raw[`${prefix}_gender`] || '',
                address: raw[`${prefix}_address`] || '',
                city: raw[`${prefix}_city`] || (i === 0 ? raw.healthcare_agent_city || '' : ''),
                state: raw[`${prefix}_state`] || 'California',
                zip: raw[`${prefix}_zip`] || '',
                phone: raw[`${prefix}_phone`] || '',
            });
        }
    }

    // Parse financial agents
    const financialAgents = [];
    const faNames = [raw.financial_agent_name, raw.alternate_financial_agent, raw.financial_agent_3_name];
    for (let i = 0; i < 3; i++) {
        if (faNames[i]) {
            const prefix = i === 0 ? 'financial_agent_1' : i === 1 ? 'financial_agent_2' : 'financial_agent_3';
            financialAgents.push({
                name: faNames[i],
                gender: raw[`${prefix}_gender`] || '',
                address: raw[`${prefix}_address`] || '',
                city: raw[`${prefix}_city`] || (i === 0 ? raw.financial_agent_city || '' : ''),
                state: raw[`${prefix}_state`] || 'California',
                zip: raw[`${prefix}_zip`] || '',
                phone: raw[`${prefix}_phone`] || '',
            });
        }
    }

    const isMarried = raw.marital_status === 'married' || raw.marital_status === 'legally_separated';

    return {
        // Grantor (expanded)
        grantor_name: raw.grantor_name || '',
        grantor_gender: raw.grantor_gender || '',
        grantor_address: raw.grantor_address || '',
        grantor_city: raw.grantor_city || '',
        grantor_state: raw.grantor_state || 'California',
        grantor_zip: raw.grantor_zip || '',
        grantor_area_code: raw.grantor_area_code || '',
        grantor_phone: raw.grantor_phone || '',
        grantor_email: raw.grantor_email || '',
        grantor_full_address: [raw.grantor_address, raw.grantor_city, raw.grantor_state, raw.grantor_zip].filter(Boolean).join(', '),

        // Trust
        trust_name: raw.trust_name || `The ${raw.grantor_name} Revocable Living Trust`,

        // Trustees
        grantor_is_primary_trustee: true,
        successor_trustees: successorTrustees,
        successor_trustee_list: successorTrustees.map(t => `${t.name} of ${t.city}, ${t.state}`).join(' and '),

        // Children
        children,
        has_children: children.length > 0,
        has_minor_children: children.some(c => c.is_minor),

        // Guardians
        guardians,
        has_guardians: raw.has_guardians === 'yes' && guardians.length > 0,

        // Beneficiaries (expanded)
        beneficiaries,

        // Specific gifts
        gifts,
        has_gifts: gifts.length > 0,

        // Custodians
        custodians,
        has_custodians: custodians.length > 0,
        custodian_legal_age: raw.custodian_legal_age || '18',

        // Properties
        properties,

        // Marital
        is_married: isMarried,
        marital_status: raw.marital_status || 'single',
        spouse_name: raw.spouse_name || '',

        // Healthcare directive (expanded agents)
        healthcare_agents: healthcareAgents,
        healthcare_agent_name: raw.healthcare_agent_name || (successorTrustees[0] ? successorTrustees[0].name : ''),
        healthcare_agent_city: healthcareAgents[0]?.city || (successorTrustees[0] ? successorTrustees[0].city : ''),
        alternate_healthcare_agent: raw.alternate_healthcare_agent || (successorTrustees[1] ? successorTrustees[1].name : ''),
        life_sustaining_treatment: raw.life_sustaining_treatment || 'comfort_only',
        organ_donation: raw.organ_donation === 'yes',
        organ_donation_purpose: raw.organ_donation_purpose || 'any',
        primary_physician_name: raw.primary_physician_name || '',

        // Financial POA (expanded agents)
        financial_agents: financialAgents,
        financial_agent_name: raw.financial_agent_name || (successorTrustees[0] ? successorTrustees[0].name : ''),
        financial_agent_city: raw.financial_agent_city || (successorTrustees[0] ? successorTrustees[0].city : ''),
        alternate_financial_agent: raw.alternate_financial_agent || (successorTrustees[1] ? successorTrustees[1].name : ''),
        financial_poa_effective: raw.financial_poa_effective || 'now',
        financial_poa_effective_now: (raw.financial_poa_effective || 'now') === 'now',
        financial_poa_upon_disability: raw.financial_poa_effective === 'upon_disability',

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
