// ================= STATE =================
const TOTAL_STEPS = 8;
let currentStep = 1;
let beneficiaryCount = 0;
let propertyCount = 0;
let trustee3Visible = false;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
    // Set today as default execution date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('execution_date').value = today;

    // Auto-populate trust name when grantor name changes
    document.getElementById('grantor_name').addEventListener('input', (e) => {
        const name = e.target.value.trim();
        if (name) {
            const tn = document.getElementById('trust_name');
            if (!tn.dataset.manuallyEdited) {
                tn.value = `The ${name} Revocable Living Trust`;
            }
            document.getElementById('primaryTrusteeDisplay').textContent = name;
        }
    });
    document.getElementById('trust_name').addEventListener('input', function () {
        this.dataset.manuallyEdited = '1';
    });

    // Show/hide spouse field
    document.querySelectorAll('[data-field="marital_status"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const isMarried = btn.dataset.value === 'married';
            document.getElementById('spouse_field').style.display = isMarried ? 'block' : 'none';
        });
    });

    // Show/hide email field
    document.querySelectorAll('[data-field="delivery_method"]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('emailField').style.display =
                btn.dataset.value === 'email' ? 'block' : 'none';
        });
    });

    // Add initial rows
    addBeneficiary();
    addProperty();

    // Build dots
    buildDots();
    updateProgress();
});

// ================= STEP NAVIGATION =================
function startForm() {
    document.querySelector('.hero').style.display = 'none';
    document.getElementById('formContainer').style.display = 'block';
    showStep(1);
}

function changeStep(dir) {
    if (dir === 1) {
        if (!validateStep(currentStep)) return;
        if (currentStep === TOTAL_STEPS) {
            submitForm();
            return;
        }
        if (currentStep === 7) populateReview();
    }
    const next = currentStep + dir;
    if (next < 1 || next > TOTAL_STEPS) return;
    showStep(next);
}

function showStep(n) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');
    currentStep = n;
    updateProgress();
    updateNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
    const pct = ((currentStep - 1) / (TOTAL_STEPS - 1)) * 100;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('stepIndicator').textContent = `Step ${currentStep} of ${TOTAL_STEPS}`;
    document.querySelectorAll('.dot').forEach((d, i) => {
        d.classList.remove('active', 'done');
        if (i + 1 === currentStep) d.classList.add('active');
        else if (i + 1 < currentStep) d.classList.add('done');
    });
}

function updateNav() {
    document.getElementById('prevBtn').style.display = currentStep > 1 ? 'inline-flex' : 'none';
    const nextBtn = document.getElementById('nextBtn');
    nextBtn.textContent = currentStep === TOTAL_STEPS ? '🏛 Generate Documents' : 'Next →';
}

function buildDots() {
    const container = document.getElementById('stepDots');
    container.innerHTML = '';
    for (let i = 1; i <= TOTAL_STEPS; i++) {
        const d = document.createElement('div');
        d.className = 'dot';
        d.title = `Step ${i}`;
        d.onclick = () => { if (i < currentStep) showStep(i); };
        container.appendChild(d);
    }
}

// ================= VALIDATION =================
function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById('grantor_name').value.trim();
        const city = document.getElementById('grantor_city').value.trim();
        if (!name) { flash('grantor_name', 'Please enter the Grantor\'s full legal name.'); return false; }
        if (!city) { flash('grantor_city', 'Please enter the city of residence.'); return false; }
    }
    if (step === 2) {
        const tn = document.getElementById('trust_name').value.trim();
        if (!tn) { flash('trust_name', 'Please enter a trust name.'); return false; }
    }
    if (step === 3) {
        const t1 = document.getElementById('successor_trustee_1_name').value.trim();
        if (!t1) { flash('successor_trustee_1_name', 'Please enter at least one Successor Trustee.'); return false; }
    }
    if (step === 4) {
        const rows = document.querySelectorAll('.beneficiary-row');
        if (rows.length === 0) { alert('Please add at least one beneficiary.'); return false; }
        const total = getBeneficiaryTotal();
        if (Math.abs(total - 100) > 0.01) {
            alert(`Beneficiary shares must total 100%. Currently: ${total}%`); return false;
        }
    }
    return true;
}

function flash(id, msg) {
    const el = document.getElementById(id);
    if (!el) { alert(msg); return; }
    el.focus();
    el.style.borderColor = 'var(--danger)';
    el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.2)';
    setTimeout(() => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
    }, 2000);
    alert(msg);
}

// ================= TOGGLE BUTTONS =================
function selectToggle(btn) {
    const field = btn.dataset.field;
    const value = btn.dataset.value;
    document.querySelectorAll(`[data-field="${field}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const hidden = document.getElementById(field);
    if (hidden) hidden.value = value;
    btn.dispatchEvent(new Event('click', { bubbles: true }));
}

// ================= BENEFICIARIES =================
function addBeneficiary() {
    beneficiaryCount++;
    const id = beneficiaryCount;
    const div = document.createElement('div');
    div.className = 'beneficiary-row';
    div.id = `ben-row-${id}`;
    div.innerHTML = `
    <div class="row-label">Beneficiary #${id}</div>
    <div class="field-grid">
      <div class="field">
        <label>Full Name <span class="req">*</span></label>
        <input type="text" class="ben-name" placeholder="e.g. Consuelo Gamboa">
      </div>
      <div class="field">
        <label>City</label>
        <input type="text" class="ben-city" placeholder="e.g. Nipomo">
      </div>
      <div class="field">
        <label>State</label>
        <input type="text" class="ben-state" value="California">
      </div>
      <div class="field">
        <label>Share % <span class="req">*</span></label>
        <input type="number" class="ben-share" min="0" max="100" step="0.01" placeholder="100" oninput="updateShareTotal()">
      </div>
    </div>
    <div class="row-actions">
      ${id > 1 ? `<button type="button" class="btn-remove" onclick="removeBeneficiary(${id})">✕ Remove</button>` : ''}
    </div>
  `;
    document.getElementById('beneficiariesList').appendChild(div);
    if (id === 1) {
        div.querySelector('.ben-share').value = '100';
        updateShareTotal();
    }
}

function removeBeneficiary(id) {
    document.getElementById(`ben-row-${id}`).remove();
    updateShareTotal();
}

function getBeneficiaryTotal() {
    let total = 0;
    document.querySelectorAll('.ben-share').forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });
    return Math.round(total * 100) / 100;
}

function updateShareTotal() {
    const total = getBeneficiaryTotal();
    const el = document.getElementById('shareTotal');
    const warn = document.getElementById('shareWarning');
    el.textContent = total + '%';
    const isOk = Math.abs(total - 100) < 0.01;
    el.style.color = isOk ? 'var(--success)' : 'var(--warning)';
    warn.style.display = isOk ? 'none' : 'inline';
}

function collectBeneficiaries() {
    const rows = document.querySelectorAll('.beneficiary-row');
    return Array.from(rows).map(row => ({
        name: row.querySelector('.ben-name').value.trim(),
        city: row.querySelector('.ben-city').value.trim(),
        state: row.querySelector('.ben-state').value.trim() || 'California',
        share: row.querySelector('.ben-share').value.trim(),
    })).filter(b => b.name);
}

// ================= PROPERTIES =================
const PROPERTY_TYPES = [
    { value: 'real_estate', label: '🏠 Real Estate' },
    { value: 'bank_account', label: '🏦 Bank Account' },
    { value: 'investment', label: '📈 Investment / Brokerage' },
    { value: 'vehicle', label: '🚗 Vehicle' },
    { value: 'business', label: '🏢 Business Interest' },
    { value: 'personal', label: '💎 Personal Property' },
    { value: 'digital', label: '💻 Digital Assets' },
    { value: 'other', label: '📦 Other' },
];

function addProperty() {
    propertyCount++;
    const id = propertyCount;
    const typeOptions = PROPERTY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
    const div = document.createElement('div');
    div.className = 'property-row';
    div.id = `prop-row-${id}`;
    div.innerHTML = `
    <div class="row-label">Asset / Property #${id}</div>
    <div class="field-grid">
      <div class="field">
        <label>Type</label>
        <select class="prop-type" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:12px 16px;border-radius:8px;font-size:14px;width:100%;font-family:var(--font);">
          ${typeOptions}
        </select>
      </div>
      <div class="field">
        <label>APN / Account # <em>(optional)</em></label>
        <input type="text" class="prop-apn" placeholder="e.g. 091-123-456">
      </div>
      <div class="field full">
        <label>Description <span class="req">*</span></label>
        <input type="text" class="prop-desc" placeholder="e.g. 652 Shady Ln, Santa Maria, CA 93455 or Chase Checking #xxxx">
      </div>
      <div class="field">
        <label>Estimated Value <em>(optional)</em></label>
        <input type="text" class="prop-value" placeholder="e.g. $500,000">
      </div>
    </div>
    <div class="row-actions">
      ${id > 1 ? `<button type="button" class="btn-remove" onclick="removeProperty(${id})">✕ Remove</button>` : ''}
    </div>
  `;
    document.getElementById('propertiesList').appendChild(div);
}

function removeProperty(id) {
    document.getElementById(`prop-row-${id}`).remove();
}

function collectProperties() {
    const rows = document.querySelectorAll('.property-row');
    return Array.from(rows).map(row => ({
        type: row.querySelector('.prop-type').value,
        description: row.querySelector('.prop-desc').value.trim(),
        apn: row.querySelector('.prop-apn').value.trim(),
        value: row.querySelector('.prop-value').value.trim(),
    })).filter(p => p.description);
}

// ================= TRUSTEE 3 TOGGLE =================
function toggleTrustee3() {
    trustee3Visible = !trustee3Visible;
    document.getElementById('trustee-row-3').style.display = trustee3Visible ? 'block' : 'none';
}

// ================= REVIEW SUMMARY =================
function populateReview() {
    const fields = {
        'Grantor': document.getElementById('grantor_name').value,
        'Trust Name': document.getElementById('trust_name').value,
        'City': document.getElementById('grantor_city').value,
        'Execution Date': document.getElementById('execution_date').value,
        'Successor Trustee #1': document.getElementById('successor_trustee_1_name').value,
        'Successor Trustee #2': document.getElementById('successor_trustee_2_name').value || '—',
        'Beneficiaries': collectBeneficiaries().map(b => `${b.name} (${b.share}%)`).join(', '),
        'Properties': collectProperties().length + ' item(s)',
        'Healthcare Agent': document.getElementById('healthcare_agent_name').value || 'Successor Trustee #1',
        'Financial Agent': document.getElementById('financial_agent_name').value || 'Successor Trustee #1',
    };
    const container = document.getElementById('reviewSummary');
    container.innerHTML = Object.entries(fields).map(([k, v]) =>
        `<div class="review-line"><span class="rl">${k}</span><span class="rv">${v || '—'}</span></div>`
    ).join('');
}

// ================= FORM COLLECTION =================
function collectFormData() {
    const data = {};
    // Simple fields
    ['grantor_name', 'grantor_city', 'grantor_state', 'trust_name', 'execution_date', 'execution_city',
        'notary_county', 'marital_status', 'spouse_name', 'healthcare_agent_name', 'alternate_healthcare_agent',
        'primary_physician_name', 'life_sustaining_treatment', 'organ_donation', 'financial_agent_name',
        'financial_agent_city', 'alternate_financial_agent', 'delivery_method', 'recipient_email',
        'successor_trustee_1_name', 'successor_trustee_1_city',
        'successor_trustee_2_name', 'successor_trustee_2_city',
        'successor_trustee_3_name', 'successor_trustee_3_city',
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });
    // Complex fields as JSON
    data.beneficiaries = JSON.stringify(collectBeneficiaries());
    data.properties = JSON.stringify(collectProperties());
    return data;
}

// ================= SUBMIT =================
async function submitForm() {
    const data = collectFormData();
    document.getElementById('loadingOverlay').style.display = 'flex';

    try {
        const resp = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await resp.json();
        document.getElementById('loadingOverlay').style.display = 'none';

        if (!result.success) {
            alert('Error: ' + result.error);
            return;
        }

        document.getElementById('formContainer').style.display = 'none';
        showSuccessPanel(result, data);

    } catch (err) {
        document.getElementById('loadingOverlay').style.display = 'none';
        alert('Failed to generate documents: ' + err.message);
    }
}

// ================= SUCCESS =================
const FILE_ICONS = {
    'Living_Trust': '📜',
    'Healthcare_Directive': '🏥',
    'Financial_POA': '💼',
    'HIPAA': '🔒',
    'Pour_Over_Will': '📋',
};

function showSuccessPanel(result, data) {
    const panel = document.getElementById('successPanel');
    panel.style.display = 'block';

    const deliveryMethod = data.delivery_method;
    if (deliveryMethod === 'email') {
        document.getElementById('successMessage').textContent =
            `Your complete estate planning package has been emailed to ${data.recipient_email}. Check your inbox!`;
        document.getElementById('downloadList').innerHTML = '';
    } else {
        document.getElementById('successMessage').textContent =
            'Click each document below to download your estate planning package.';

        const list = document.getElementById('downloadList');
        list.innerHTML = '';
        (result.files || []).forEach(file => {
            const iconKey = Object.keys(FILE_ICONS).find(k => file.name.includes(k)) || 'default';
            const icon = FILE_ICONS[iconKey] || '📄';
            const a = document.createElement('a');
            a.className = 'dl-btn';
            a.href = file.url;        // real server URL — works in Safari and all browsers
            a.download = file.name;
            a.target = '_blank';      // open in new tab as fallback
            a.innerHTML = `<span class="dl-icon">${icon}</span><span class="dl-name">${file.name.replace(/_/g, ' ').replace('.pdf', '')}</span>`;
            list.appendChild(a);
        });
    }

    panel.scrollIntoView({ behavior: 'smooth' });
}

function startOver() {
    location.reload();
}
