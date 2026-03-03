#!/usr/bin/env node
// save_pdfs.js — generates and saves PDFs directly to disk without going through HTTP
require('dotenv').config();
const { generateTrustPackage } = require('./generate');
const fs = require('fs');
const path = require('path');

const data = {
    grantor_name: 'Farshid Valizadeh',
    grantor_city: 'Tarzana',
    grantor_state: 'California',
    trust_name: 'The 6238 Calvin Revocable Living Trust',
    execution_date: '2026-03-03',
    execution_city: 'Tarzana',
    notary_county: 'Los Angeles',
    marital_status: 'single',
    successor_trustee_1_name: 'Nasrin Aziziyan',
    successor_trustee_1_city: 'Tarzana',
    beneficiaries: JSON.stringify([
        { name: 'Baran Valizadeh', city: 'Tarzana', state: 'California', share: '50' },
        { name: 'Benyamin Valizadeh', city: 'Tarzana', state: 'California', share: '50' },
    ]),
    properties: JSON.stringify([
        { type: 'real_estate', description: '6238 Calvin Ave, Tarzana, CA 91335', apn: '', value: '' },
    ]),
    healthcare_agent_name: 'Nasrin Aziziyan',
    alternate_healthcare_agent: '',
    life_sustaining_treatment: 'comfort_only',
    organ_donation: 'yes',
    financial_agent_name: 'Nasrin Aziziyan',
    financial_agent_city: 'Tarzana',
    alternate_financial_agent: '',
    delivery_method: 'download',
};

const outDir = path.join(__dirname, 'output', 'Farshid_Valizadeh');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
    console.log('Generating trust package for:', data.grantor_name);
    const { pdfBuffers, fileNames } = await generateTrustPackage(data);
    fileNames.forEach((name, i) => {
        const outPath = path.join(outDir, name);
        fs.writeFileSync(outPath, pdfBuffers[i]);
        console.log(`✅ Saved: ${outPath} (${Math.round(pdfBuffers[i].length / 1024)} KB)`);
    });
    console.log('\nAll documents saved to:', outDir);
})();
