const fs = require('fs');
const path = require('path');

const SUBS_FILE = path.join('/tmp', 'trustbot', 'submissions.json');

function ensureDir() {
    const dir = path.dirname(SUBS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAll() {
    ensureDir();
    if (!fs.existsSync(SUBS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); }
    catch { return []; }
}

function saveAll(subs) {
    ensureDir();
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

// ── CRUD ─────────────────────────────────────────────────────
function create(userId, userName, userEmail, formData) {
    const subs = loadAll();
    const sub = {
        id: 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId,
        userName,
        userEmail,
        status: 'pending',        // pending → in_progress → completed
        data: formData,
        generatedFiles: [],       // populated when admin generates docs
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    subs.push(sub);
    saveAll(subs);
    return sub;
}

function list() {
    return loadAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listByUser(userId) {
    return loadAll().filter(s => s.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getById(id) {
    return loadAll().find(s => s.id === id) || null;
}

function update(id, updates) {
    const subs = loadAll();
    const idx = subs.findIndex(s => s.id === id);
    if (idx === -1) return null;
    subs[idx] = { ...subs[idx], ...updates, updatedAt: new Date().toISOString() };
    saveAll(subs);
    return subs[idx];
}

function remove(id) {
    const subs = loadAll();
    const filtered = subs.filter(s => s.id !== id);
    if (filtered.length === subs.length) return false;
    saveAll(filtered);
    return true;
}

module.exports = { create, list, listByUser, getById, update, remove };
