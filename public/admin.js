// ── State ────────────────────────────────────────────────────
let token = localStorage.getItem('trustbot_token');
let currentUser = null;
let allSubmissions = [];

// ── Auth check ───────────────────────────────────────────────
(async function init() {
    if (!token) return window.location.href = '/login';
    try {
        const resp = await apiFetch('/api/auth/me');
        currentUser = resp.user;
        if (currentUser.role !== 'admin') {
            window.location.href = '/';
            return;
        }
        document.getElementById('userBadge').textContent = currentUser.name + ' (Admin)';
        loadSubmissions();
    } catch {
        window.location.href = '/login';
    }
})();

// ── API helper ───────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
    const resp = await fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...(opts.headers || {}),
        },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ── Load submissions ─────────────────────────────────────────
async function loadSubmissions() {
    try {
        const data = await apiFetch('/api/admin/submissions');
        allSubmissions = data.submissions || [];
        renderStats();
        renderTable();
    } catch (err) {
        console.error('Load error:', err);
    }
}

function renderStats() {
    const total = allSubmissions.length;
    const pending = allSubmissions.filter(s => s.status === 'pending').length;
    const completed = allSubmissions.filter(s => s.status === 'completed').length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statCompleted').textContent = completed;
}

function renderTable() {
    const wrap = document.getElementById('tableWrap');

    if (allSubmissions.length === 0) {
        wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No Submissions Yet</h3>
        <p>Client submissions will appear here when they complete the intake form.</p>
      </div>`;
        return;
    }

    let html = `<table class="submissions-table">
    <thead>
      <tr>
        <th>Grantor Name</th>
        <th>Client</th>
        <th>Email</th>
        <th>Status</th>
        <th>Submitted</th>
      </tr>
    </thead>
    <tbody>`;

    allSubmissions.forEach(sub => {
        const grantorName = sub.data?.grantor_name || '—';
        const date = new Date(sub.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        html += `
      <tr class="clickable" onclick="viewSubmission('${sub.id}')">
        <td><strong>${esc(grantorName)}</strong></td>
        <td>${esc(sub.userName || '—')}</td>
        <td>${esc(sub.userEmail || '—')}</td>
        <td><span class="status-badge ${sub.status}">${sub.status.replace('_', ' ')}</span></td>
        <td>${date}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
}

// ── View one submission ──────────────────────────────────────
async function viewSubmission(id) {
    try {
        const data = await apiFetch('/api/admin/submissions/' + id);
        showModal(data.submission);
    } catch (err) {
        alert('Error loading: ' + err.message);
    }
}

function showModal(sub) {
    const modal = document.getElementById('detailModal');
    const d = sub.data || {};

    document.getElementById('modalTitle').textContent = d.grantor_name || 'Submission Details';

    // Build sections
    let body = '';

    // Grantor Info
    body += detailSection('Grantor Information', [
        ['Name', d.grantor_name], ['Gender', d.grantor_gender],
        ['Address', d.grantor_address], ['City', d.grantor_city],
        ['State', d.grantor_state], ['ZIP', d.grantor_zip],
        ['Phone', formatPhone(d.grantor_area_code, d.grantor_phone)], ['Email', d.grantor_email],
        ['Marital Status', d.marital_status], ['Spouse', d.spouse_name],
    ]);

    // Trust
    body += detailSection('Trust Details', [
        ['Trust Name', d.trust_name], ['Execution Date', d.execution_date],
        ['City of Execution', d.execution_city], ['County', d.notary_county],
    ]);

    // Children
    const children = parseJSON(d.children);
    if (children.length) {
        body += detailSection('Children', children.map((c, i) =>
            [`Child ${i + 1}`, `${c.name} (DOB: ${c.birth_mo}/${c.birth_day}/${c.birth_year}, ${c.gender}, ${c.is_minor ? 'Minor' : 'Adult'})`]
        ));
    }

    // Successor Trustees
    const trustees = [];
    for (let i = 1; i <= 3; i++) {
        if (d[`successor_trustee_${i}_name`]) {
            trustees.push([`Trustee #${i}`, `${d[`successor_trustee_${i}_name`]}, ${d[`successor_trustee_${i}_city`] || ''} ${d[`successor_trustee_${i}_state`] || ''}`]);
        }
    }
    if (trustees.length) body += detailSection('Successor Trustees', trustees);

    // Beneficiaries
    const bens = parseJSON(d.beneficiaries);
    if (bens.length) {
        body += detailSection('Beneficiaries', bens.map((b, i) =>
            [`#${i + 1} — ${b.name}`, `${b.share}% (${b.relationship || '—'}) Alt: ${b.alternate || '—'}`]
        ));
    }

    // Specific Gifts
    const gifts = parseJSON(d.gifts);
    if (gifts.length) {
        body += detailSection('Specific Gifts', gifts.map((g, i) =>
            [`Gift ${i + 1}`, `"${g.gift}" → ${g.to} (${g.relationship || '—'})`]
        ));
    }

    // Healthcare
    body += detailSection('Healthcare Directive', [
        ['Agent #1', d.healthcare_agent_name], ['Agent #2', d.alternate_healthcare_agent],
        ['Life Sustaining', d.life_sustaining_treatment], ['Organ Donation', d.organ_donation],
    ]);

    // Financial POA
    body += detailSection('Financial Power of Attorney', [
        ['Agent #1', d.financial_agent_name], ['Agent #2', d.alternate_financial_agent],
        ['Effective', d.financial_poa_effective],
    ]);

    // Properties
    const props = parseJSON(d.properties);
    if (props.length) {
        body += detailSection('Trust Property (Schedule A)', props.map((p, i) =>
            [`${p.type || 'Asset'} #${i + 1}`, p.description]
        ));
    }

    document.getElementById('modalBody').innerHTML = body;

    // Actions
    let actions = '';
    if (sub.status !== 'completed') {
        actions += `<button class="btn-success" onclick="generateDocs('${sub.id}')">🏛 Generate Documents</button>`;
    }
    if (sub.generatedFiles?.length) {
        actions += `<div class="download-links">${sub.generatedFiles.map(f =>
            `<a href="${f.url}" target="_blank">📄 ${f.name.replace(/_/g, ' ').replace('.pdf', '')}</a>`
        ).join('')}</div>`;
    }
    actions += `<button class="btn-danger" onclick="deleteSubmission('${sub.id}')">Delete</button>`;
    document.getElementById('modalActions').innerHTML = actions;

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('detailModal').classList.remove('active');
}

// Close modal on overlay click
document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// ── Generate documents ───────────────────────────────────────
async function generateDocs(id) {
    if (!confirm('Generate all trust documents for this submission?')) return;
    try {
        const btn = document.querySelector('.btn-success');
        if (btn) { btn.textContent = '⏳ Generating...'; btn.disabled = true; }

        const data = await apiFetch('/api/admin/submissions/' + id + '/generate', { method: 'POST', body: '{}' });

        alert('Documents generated successfully!');
        closeModal();
        loadSubmissions();
    } catch (err) {
        alert('Generation failed: ' + err.message);
    }
}

// ── Delete submission ────────────────────────────────────────
async function deleteSubmission(id) {
    if (!confirm('Delete this submission permanently?')) return;
    try {
        await apiFetch('/api/admin/submissions/' + id, { method: 'DELETE' });
        closeModal();
        loadSubmissions();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

// ── Logout ───────────────────────────────────────────────────
function logout() {
    localStorage.removeItem('trustbot_token');
    localStorage.removeItem('trustbot_user');
    window.location.href = '/login';
}

// ── Helpers ──────────────────────────────────────────────────
function esc(str) {
    if (!str) return '—';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function parseJSON(str) {
    if (!str) return [];
    if (Array.isArray(str)) return str;
    try { return JSON.parse(str); } catch { return []; }
}

function formatPhone(area, phone) {
    if (!phone) return '—';
    return area ? `(${area}) ${phone}` : phone;
}

function detailSection(title, items) {
    const filtered = items.filter(([, v]) => v && v !== '—' && v !== 'undefined');
    if (filtered.length === 0) return '';
    return `
    <div class="detail-section">
      <h3>${title}</h3>
      <div class="detail-grid">
        ${filtered.map(([label, value]) => `
          <div class="detail-item">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${esc(String(value))}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}
