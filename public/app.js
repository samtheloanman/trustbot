// ================= STATE =================
const TOTAL_STEPS = 12;
let currentStep = 1;
let beneficiaryCount = 0;
let propertyCount = 0;
let childCount = 0;
let giftCount = 0;
let trustee3Visible = false;
let healthcareAgent3Visible = false;
let financialAgent3Visible = false;
let isLoggedIn = false;
let currentUser = null;

// ================= AUTH CHECK =================
(async function checkAuth() {
    const token = localStorage.getItem('trustbot_token');
    if (!token) return; // allow anonymous access
    try {
        const resp = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await resp.json();
        if (data.user) {
            isLoggedIn = true;
            currentUser = data.user;
            if (data.user.role === 'admin') {
                window.location.href = '/admin';
                return;
            }
            document.getElementById('headerUser').textContent = data.user.name;
            document.getElementById('logoutBtn').style.display = 'inline-flex';
        }
    } catch (e) { /* anonymous is fine */ }
})();

function logout() {
    localStorage.removeItem('trustbot_token');
    localStorage.removeItem('trustbot_user');
    window.location.href = '/login';
}

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
            const show = btn.dataset.value === 'married' || btn.dataset.value === 'legally_separated';
            document.getElementById('spouse_field').style.display = show ? 'block' : 'none';
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
    document.getElementById('heroSection').style.display = 'none';
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
        if (currentStep === TOTAL_STEPS - 1) populateReview();
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
    nextBtn.textContent = currentStep === TOTAL_STEPS ? '🏛 Submit Application' : 'Next →';
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
        const addr = document.getElementById('grantor_address').value.trim();
        const zip = document.getElementById('grantor_zip').value.trim();
        if (!name) { flash('grantor_name', 'Please enter the Grantor\'s full legal name.'); return false; }
        if (!addr) { flash('grantor_address', 'Please enter the Grantor\'s street address.'); return false; }
        if (!city) { flash('grantor_city', 'Please enter the city of residence.'); return false; }
        if (!zip) { flash('grantor_zip', 'Please enter the ZIP code.'); return false; }
    }
    if (step === 2) {
        const tn = document.getElementById('trust_name').value.trim();
        if (!tn) { flash('trust_name', 'Please enter a trust name.'); return false; }
    }
    if (step === 4) {
        const t1 = document.getElementById('successor_trustee_1_name').value.trim();
        if (!t1) { flash('successor_trustee_1_name', 'Please enter at least one Successor Trustee.'); return false; }
    }
    if (step === 5) {
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
}

// ================= CHILDREN =================
function addChild() {
    childCount++;
    const id = childCount;
    if (id > 5) { alert('Maximum 5 children supported.'); return; }
    const div = document.createElement('div');
    div.className = 'trustee-row';
    div.id = `child-row-${id}`;
    div.innerHTML = `
    <div class="row-label">Child #${id}
      ${id > 0 ? `<button type="button" class="btn-remove" style="float:right;" onclick="removeChild(${id})">✕ Remove</button>` : ''}
    </div>
    <div class="field-grid">
      <div class="field full">
        <label>Full Name</label>
        <input type="text" class="child-name" placeholder="e.g. Ashley Gamboa">
      </div>
      <div class="field">
        <label>Birth Month</label>
        <input type="text" class="child-birth-mo" placeholder="e.g. 03" maxlength="2">
      </div>
      <div class="field">
        <label>Birth Day</label>
        <input type="text" class="child-birth-day" placeholder="e.g. 15" maxlength="2">
      </div>
      <div class="field">
        <label>Birth Year</label>
        <input type="text" class="child-birth-year" placeholder="e.g. 2005" maxlength="4">
      </div>
      <div class="field">
        <label>Gender</label>
        <div class="toggle-group">
          <button type="button" class="toggle" data-field="child_${id}_gender" data-value="male" onclick="selectToggle(this)">♂ Male</button>
          <button type="button" class="toggle" data-field="child_${id}_gender" data-value="female" onclick="selectToggle(this)">♀ Female</button>
        </div>
        <input type="hidden" id="child_${id}_gender" value="">
      </div>
      <div class="field">
        <label>Minor?</label>
        <div class="toggle-group">
          <button type="button" class="toggle" data-field="child_${id}_minor" data-value="yes" onclick="selectToggle(this)">Yes</button>
          <button type="button" class="toggle" data-field="child_${id}_minor" data-value="no" onclick="selectToggle(this)">No</button>
        </div>
        <input type="hidden" id="child_${id}_minor" value="">
      </div>
    </div>
  `;
    document.getElementById('childrenList').appendChild(div);
}

function removeChild(id) {
    const el = document.getElementById(`child-row-${id}`);
    if (el) el.remove();
}

function collectChildren() {
    const rows = document.querySelectorAll('[id^="child-row-"]');
    return Array.from(rows).map(row => {
        const id = row.id.replace('child-row-', '');
        return {
            name: row.querySelector('.child-name')?.value?.trim() || '',
            birth_mo: row.querySelector('.child-birth-mo')?.value?.trim() || '',
            birth_day: row.querySelector('.child-birth-day')?.value?.trim() || '',
            birth_year: row.querySelector('.child-birth-year')?.value?.trim() || '',
            gender: document.getElementById(`child_${id}_gender`)?.value || '',
            is_minor: document.getElementById(`child_${id}_minor`)?.value === 'yes',
        };
    }).filter(c => c.name);
}

function toggleGuardians(show) {
    document.getElementById('guardiansSection').style.display = show ? 'block' : 'none';
}

// ================= BENEFICIARIES (expanded) =================
function addBeneficiary() {
    beneficiaryCount++;
    const id = beneficiaryCount;
    if (id > 8) { alert('Maximum 8 beneficiaries supported.'); return; }
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
        <label>Relationship</label>
        <input type="text" class="ben-relationship" placeholder="e.g. Daughter">
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
      <div class="field">
        <label>Priority Rank</label>
        <div class="toggle-group">
          <button type="button" class="toggle ben-rank active" data-ben="${id}" data-rank="A" onclick="setRank(this)">A</button>
          <button type="button" class="toggle ben-rank" data-ben="${id}" data-rank="B" onclick="setRank(this)">B</button>
          <button type="button" class="toggle ben-rank" data-ben="${id}" data-rank="C" onclick="setRank(this)">C</button>
        </div>
        <input type="hidden" class="ben-rank-val" value="A">
      </div>
      <div class="field full">
        <label>Alternate Beneficiary <em>(if this beneficiary predeceases you)</em></label>
        <input type="text" class="ben-alternate" placeholder="e.g. Their children in equal shares">
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

function setRank(btn) {
    const benId = btn.dataset.ben;
    document.querySelectorAll(`.ben-rank[data-ben="${benId}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const row = btn.closest('.beneficiary-row');
    row.querySelector('.ben-rank-val').value = btn.dataset.rank;
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
        relationship: row.querySelector('.ben-relationship')?.value?.trim() || '',
        alternate: row.querySelector('.ben-alternate')?.value?.trim() || '',
        rank: row.querySelector('.ben-rank-val')?.value || 'A',
    })).filter(b => b.name);
}

// ================= SPECIFIC GIFTS =================
function addGift() {
    giftCount++;
    const id = giftCount;
    if (id > 4) { alert('Maximum 4 specific gifts supported.'); return; }
    const div = document.createElement('div');
    div.className = 'trustee-row';
    div.id = `gift-row-${id}`;
    div.innerHTML = `
    <div class="row-label">Gift #${id}
      <button type="button" class="btn-remove" style="float:right;" onclick="removeGift(${id})">✕ Remove</button>
    </div>
    <div class="field-grid">
      <div class="field full">
        <label>Gift Description <span class="req">*</span></label>
        <input type="text" class="gift-desc" placeholder="e.g. My grandmother's diamond ring">
      </div>
      <div class="field">
        <label>To (Recipient)</label>
        <input type="text" class="gift-to" placeholder="e.g. Ashley Gamboa">
      </div>
      <div class="field">
        <label>Relationship</label>
        <input type="text" class="gift-rel" placeholder="e.g. Granddaughter">
      </div>
      <div class="field full">
        <label>Distribution Instructions <em>(optional)</em></label>
        <input type="text" class="gift-dist" placeholder="e.g. To be given on her 21st birthday">
      </div>
    </div>
  `;
    document.getElementById('giftsList').appendChild(div);
}

function removeGift(id) {
    const el = document.getElementById(`gift-row-${id}`);
    if (el) el.remove();
}

function collectGifts() {
    const rows = document.querySelectorAll('[id^="gift-row-"]');
    return Array.from(rows).map(row => ({
        gift: row.querySelector('.gift-desc')?.value?.trim() || '',
        to: row.querySelector('.gift-to')?.value?.trim() || '',
        relationship: row.querySelector('.gift-rel')?.value?.trim() || '',
        distribution: row.querySelector('.gift-dist')?.value?.trim() || '',
    })).filter(g => g.gift);
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

// ================= TOGGLES =================
function toggleTrustee3() {
    trustee3Visible = !trustee3Visible;
    document.getElementById('trustee-row-3').style.display = trustee3Visible ? 'block' : 'none';
}

function toggleHealthcareAgent3() {
    healthcareAgent3Visible = !healthcareAgent3Visible;
    document.getElementById('healthcare-agent-3').style.display = healthcareAgent3Visible ? 'block' : 'none';
}

function toggleFinancialAgent3() {
    financialAgent3Visible = !financialAgent3Visible;
    document.getElementById('financial-agent-3').style.display = financialAgent3Visible ? 'block' : 'none';
}

// ================= COPY TRUSTEES =================
function copyTrusteesToHealthcare() {
    const map = [
        ['successor_trustee_1_name', 'healthcare_agent_name'],
        ['successor_trustee_1_city', 'healthcare_agent_1_city'],
        ['successor_trustee_1_state', 'healthcare_agent_1_state'],
        ['successor_trustee_1_zip', 'healthcare_agent_1_zip'],
        ['successor_trustee_1_phone', 'healthcare_agent_1_phone'],
        ['successor_trustee_1_address', 'healthcare_agent_1_address'],
        ['successor_trustee_2_name', 'alternate_healthcare_agent'],
        ['successor_trustee_2_city', 'healthcare_agent_2_city'],
        ['successor_trustee_2_state', 'healthcare_agent_2_state'],
        ['successor_trustee_2_zip', 'healthcare_agent_2_zip'],
        ['successor_trustee_2_phone', 'healthcare_agent_2_phone'],
        ['successor_trustee_2_address', 'healthcare_agent_2_address'],
    ];
    map.forEach(([from, to]) => {
        const src = document.getElementById(from);
        const dst = document.getElementById(to);
        if (src && dst) dst.value = src.value;
    });
}

function copyTrusteesToFinancial() {
    const map = [
        ['successor_trustee_1_name', 'financial_agent_name'],
        ['successor_trustee_1_city', 'financial_agent_city'],
        ['successor_trustee_1_state', 'financial_agent_1_state'],
        ['successor_trustee_1_zip', 'financial_agent_1_zip'],
        ['successor_trustee_1_phone', 'financial_agent_1_phone'],
        ['successor_trustee_1_address', 'financial_agent_1_address'],
        ['successor_trustee_2_name', 'alternate_financial_agent'],
        ['successor_trustee_2_city', 'financial_agent_2_city'],
        ['successor_trustee_2_state', 'financial_agent_2_state'],
        ['successor_trustee_2_zip', 'financial_agent_2_zip'],
        ['successor_trustee_2_phone', 'financial_agent_2_phone'],
        ['successor_trustee_2_address', 'financial_agent_2_address'],
    ];
    map.forEach(([from, to]) => {
        const src = document.getElementById(from);
        const dst = document.getElementById(to);
        if (src && dst) dst.value = src.value;
    });
}

// ================= REVIEW SUMMARY =================
function populateReview() {
    const fields = {
        'Grantor': document.getElementById('grantor_name').value,
        'Address': `${document.getElementById('grantor_address').value}, ${document.getElementById('grantor_city').value}, ${document.getElementById('grantor_state').value} ${document.getElementById('grantor_zip').value}`,
        'Email': document.getElementById('grantor_email').value || '—',
        'Phone': formatPhone(document.getElementById('grantor_area_code').value, document.getElementById('grantor_phone').value),
        'Trust Name': document.getElementById('trust_name').value,
        'Execution Date': document.getElementById('execution_date').value,
        'Children': collectChildren().length ? collectChildren().map(c => c.name).join(', ') : 'None listed',
        'Successor Trustee #1': document.getElementById('successor_trustee_1_name').value,
        'Successor Trustee #2': document.getElementById('successor_trustee_2_name').value || '—',
        'Beneficiaries': collectBeneficiaries().map(b => `${b.name} (${b.share}%)`).join(', '),
        'Specific Gifts': collectGifts().length ? collectGifts().map(g => `"${g.gift}" → ${g.to}`).join(', ') : 'None',
        'Properties': collectProperties().length + ' item(s)',
        'Healthcare Agent': document.getElementById('healthcare_agent_name').value || 'Successor Trustee #1',
        'Financial Agent': document.getElementById('financial_agent_name').value || 'Successor Trustee #1',
        'Financial POA Effective': document.getElementById('financial_poa_effective').value === 'now' ? 'Immediately' : 'Upon Disability',
        'Delivery': document.getElementById('delivery_method').value === 'email' ? 'Email' : 'Download',
    };
    const container = document.getElementById('reviewSummary');
    container.innerHTML = Object.entries(fields).map(([k, v]) =>
        `<div class="review-line"><span class="rl">${k}</span><span class="rv">${v || '—'}</span></div>`
    ).join('');
}

function formatPhone(area, phone) {
    if (!phone) return '—';
    return area ? `(${area}) ${phone}` : phone;
}

// ================= FORM COLLECTION =================
function collectFormData() {
    const data = {};
    // Simple fields — all IDs from the form
    const simpleFields = [
        'grantor_name', 'grantor_gender', 'grantor_address', 'grantor_city', 'grantor_state', 'grantor_zip',
        'grantor_area_code', 'grantor_phone', 'grantor_email',
        'marital_status', 'spouse_name',
        'trust_name', 'execution_date', 'execution_city', 'notary_county',
        // Guardians
        'has_guardians',
        'guardian_1_name', 'guardian_1_address', 'guardian_1_city', 'guardian_1_state', 'guardian_1_zip', 'guardian_1_phone',
        'guardian_2_name', 'guardian_2_address', 'guardian_2_city', 'guardian_2_state', 'guardian_2_zip', 'guardian_2_phone',
        // Successor Trustees (3 × 6 fields)
        'successor_trustee_1_name', 'successor_trustee_1_address', 'successor_trustee_1_city', 'successor_trustee_1_state', 'successor_trustee_1_zip', 'successor_trustee_1_phone',
        'successor_trustee_2_name', 'successor_trustee_2_address', 'successor_trustee_2_city', 'successor_trustee_2_state', 'successor_trustee_2_zip', 'successor_trustee_2_phone',
        'successor_trustee_3_name', 'successor_trustee_3_address', 'successor_trustee_3_city', 'successor_trustee_3_state', 'successor_trustee_3_zip', 'successor_trustee_3_phone',
        // Custodians
        'custodian_legal_age',
        'custodian_1_name', 'custodian_1_address', 'custodian_1_city', 'custodian_1_state', 'custodian_1_zip', 'custodian_1_phone',
        'custodian_2_name', 'custodian_2_address', 'custodian_2_city', 'custodian_2_state', 'custodian_2_zip', 'custodian_2_phone',
        // Healthcare
        'healthcare_same_as_trustees',
        'healthcare_agent_name', 'healthcare_agent_1_gender', 'healthcare_agent_1_address', 'healthcare_agent_1_city', 'healthcare_agent_1_state', 'healthcare_agent_1_zip', 'healthcare_agent_1_phone',
        'alternate_healthcare_agent', 'healthcare_agent_2_gender', 'healthcare_agent_2_address', 'healthcare_agent_2_city', 'healthcare_agent_2_state', 'healthcare_agent_2_zip', 'healthcare_agent_2_phone',
        'healthcare_agent_3_name', 'healthcare_agent_3_gender', 'healthcare_agent_3_address', 'healthcare_agent_3_city', 'healthcare_agent_3_state', 'healthcare_agent_3_zip', 'healthcare_agent_3_phone',
        'primary_physician_name', 'life_sustaining_treatment', 'organ_donation',
        // Financial
        'financial_poa_effective', 'financial_same_as_trustees',
        'financial_agent_name', 'financial_agent_1_gender', 'financial_agent_1_address', 'financial_agent_city', 'financial_agent_1_state', 'financial_agent_1_zip', 'financial_agent_1_phone',
        'alternate_financial_agent', 'financial_agent_2_gender', 'financial_agent_2_address', 'financial_agent_2_city', 'financial_agent_2_state', 'financial_agent_2_zip', 'financial_agent_2_phone',
        'financial_agent_3_name', 'financial_agent_3_gender', 'financial_agent_3_address', 'financial_agent_3_city', 'financial_agent_3_state', 'financial_agent_3_zip', 'financial_agent_3_phone',
        // Delivery
        'delivery_method', 'recipient_email',
    ];

    simpleFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) data[id] = el.value;
    });

    // Complex fields as JSON
    data.beneficiaries = JSON.stringify(collectBeneficiaries());
    data.properties = JSON.stringify(collectProperties());
    data.children = JSON.stringify(collectChildren());
    data.gifts = JSON.stringify(collectGifts());

    return data;
}

// ================= SUBMIT =================
async function submitForm() {
    const data = collectFormData();

    // If logged in as client, submit to server for admin review
    if (isLoggedIn && currentUser && currentUser.role === 'client') {
        document.getElementById('loadingOverlay').style.display = 'flex';
        document.getElementById('loadingText').textContent = 'Submitting your application…';

        try {
            const resp = await fetch('/api/submissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('trustbot_token'),
                },
                body: JSON.stringify(data),
            });
            const result = await resp.json();
            document.getElementById('loadingOverlay').style.display = 'none';

            if (!result.success) {
                alert('Error: ' + result.error);
                return;
            }

            // Show success for submission
            document.getElementById('formContainer').style.display = 'none';
            document.getElementById('successPanel').style.display = 'block';
            document.getElementById('successTitle').textContent = 'Application Submitted!';
            document.getElementById('successMessage').textContent =
                'Your trust application has been submitted for review. Our team will prepare your documents and notify you when they are ready.';
            document.getElementById('downloadList').innerHTML = `
        <div style="text-align:center; padding:20px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); margin-top:16px;">
          <p style="font-size:14px; color:var(--text-muted);">📋 Submission ID: <strong>${result.submission.id}</strong></p>
          <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">Submitted on ${new Date(result.submission.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      `;
            document.getElementById('successPanel').scrollIntoView({ behavior: 'smooth' });

        } catch (err) {
            document.getElementById('loadingOverlay').style.display = 'none';
            alert('Failed to submit: ' + err.message);
        }
        return;
    }

    // If not logged in or admin, use legacy direct generation
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = 'Generating your estate planning package…';

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
    document.getElementById('successTitle').textContent = 'Your Documents Are Ready!';

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
            a.href = file.url;
            a.download = file.name;
            a.target = '_blank';
            a.innerHTML = `<span class="dl-icon">${icon}</span><span class="dl-name">${file.name.replace(/_/g, ' ').replace('.pdf', '')}</span>`;
            list.appendChild(a);
        });
    }

    panel.scrollIntoView({ behavior: 'smooth' });
}

function startOver() {
    location.reload();
}
