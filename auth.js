const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join('/tmp', 'trustbot', 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'trustbot-dev-secret-change-me';
const JWT_EXPIRES = '7d';

// ── helpers ──────────────────────────────────────────────────
function ensureDir() {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadUsers() {
    ensureDir();
    if (!fs.existsSync(USERS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
    catch { return []; }
}

function saveUsers(users) {
    ensureDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findByEmail(email) {
    return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

// ── admin seeding ────────────────────────────────────────────
function seedAdmin() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    if (findByEmail(email)) return;
    const users = loadUsers();
    users.push({
        id: 'admin-' + Date.now().toString(36),
        name: 'Admin',
        email: email.toLowerCase(),
        password: bcrypt.hashSync(password, 10),
        role: 'admin',
        createdAt: new Date().toISOString(),
    });
    saveUsers(users);
    console.log('[TrustBot] Admin account seeded:', email);
}

// ── JWT middleware ────────────────────────────────────────────
function signToken(user) {
    return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        next();
    });
}

function requireClient(req, res, next) {
    verifyToken(req, res, () => {
        next(); // both client and admin can access client routes
    });
}

// ── route handlers ───────────────────────────────────────────
function register(req, res) {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

    const users = loadUsers();
    const user = {
        id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: bcrypt.hashSync(password, 10),
        role: 'client',
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);

    const token = signToken(user);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

function me(req, res) {
    res.json({ user: req.user });
}

// ── mount routes ─────────────────────────────────────────────
function mountAuthRoutes(app) {
    seedAdmin();
    app.post('/api/auth/register', register);
    app.post('/api/auth/login', login);
    app.get('/api/auth/me', verifyToken, me);
}

module.exports = { mountAuthRoutes, verifyToken, requireAdmin, requireClient };
