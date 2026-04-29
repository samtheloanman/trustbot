const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'trustbot-dev-secret-change-me';
const JWT_EXPIRES = '7d';

// ── helpers ──────────────────────────────────────────────────
async function findByEmail(email) {
    const { data, error } = await supabase
        .from('trustbot_users')
        .select('*')
        .ilike('email', email)
        .single();
    if (error) return null;
    return data;
}

// ── admin seeding ────────────────────────────────────────────
async function seedAdmin() {
    const adminEmails = [
        process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim() : null,
        'sam@c-mtg.com'
    ].filter(Boolean);
    const password = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : 'Lolo@2323';

    if (adminEmails.length === 0) return;

    for (const email of adminEmails) {
        const lowerEmail = email.toLowerCase();
        const existing = await findByEmail(lowerEmail);
        
        if (existing) {
            if (existing.role !== 'admin') {
                await supabase.from('trustbot_users').update({ role: 'admin' }).eq('id', existing.id);
                console.log('[TrustBot] User promoted to admin:', lowerEmail);
            }
        } else {
            await supabase.from('trustbot_users').insert({
                id: 'admin-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                name: 'Admin',
                email: lowerEmail,
                password: bcrypt.hashSync(password, 10),
                role: 'admin',
                createdAt: new Date().toISOString(),
            });
            console.log('[TrustBot] Admin account seeded:', lowerEmail);
        }
    }
}

// ── JWT middleware ────────────────────────────────────────────
function signToken(user) {
    return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(req, res, next) {
    let token = null;
    const header = req.headers.authorization;
    
    if (header && header.startsWith('Bearer ')) {
        token = header.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        console.error('[Auth] verifyToken missing/invalid header or query token');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('[Auth] verifyToken error:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
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
async function register(req, res) {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        
        const existing = await findByEmail(email);
        if (existing) return res.status(409).json({ error: 'Email already registered' });

        const user = {
            id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: bcrypt.hashSync(password, 10),
            role: 'client',
            createdAt: new Date().toISOString(),
        };
        
        const { error } = await supabase.from('trustbot_users').insert(user);
        if (error) {
            console.error('[TrustBot] User insert error:', error);
            return res.status(500).json({ error: 'Failed to register user' });
        }

        const token = signToken(user);
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const user = await findByEmail(email);
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signToken(user);
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

function me(req, res) {
    res.json({ user: req.user });
}

// ── mount routes ─────────────────────────────────────────────
function mountAuthRoutes(app) {
    seedAdmin().catch(console.error);
    app.post('/api/auth/register', register);
    app.post('/api/auth/login', login);
    app.get('/api/auth/me', verifyToken, me);
}

module.exports = { mountAuthRoutes, verifyToken, requireAdmin, requireClient };
