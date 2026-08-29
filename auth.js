const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase } = require('./db');

// Fail closed. The previous fallback literal is in version-control history and
// must be treated as disclosed: any JWT signed with it is forgeable by anyone
// with repo access. Booting without a real secret is a security failure, not a
// convenience, so refuse to start rather than silently signing with a known key.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error(
        '[TrustBot] JWT_SECRET is required and must be at least 32 characters. ' +
        'Refusing to start. Generate one with: openssl rand -base64 48'
    );
}

const JWT_EXPIRES = '7d';
const SESSION_COOKIE = 'trustbot_session';
const CSRF_COOKIE = 'trustbot_csrf';
const CSRF_HEADER = 'x-csrf-token';
const IS_PROD = process.env.NODE_ENV === 'production';

// Session cookie is HttpOnly so no script can read it -- this is what replaces
// localStorage token storage, which was readable by any XSS on the page.
// SameSite=Lax still sends the cookie on top-level GET navigation (needed for
// the generated-PDF links, which used to smuggle the token through the query
// string) while withholding it from cross-site POSTs.
function sessionCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: IS_PROD,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };
}

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
        'sam@c-mtg.com',
        'custommtg23@gmail.com',
        'processing@c-mtg.com',
        'eve@c-mtg.com'
    ].filter(Boolean);
    // Fail closed. The previous fallback password is in version-control history
    // and must be considered disclosed -- seeding admin accounts with it would
    // hand anyone with repo access an administrator login. Skip seeding entirely
    // rather than create accounts with a known credential.
    const password = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;
    if (!password) {
        console.warn('[TrustBot] ADMIN_PASSWORD not set -- skipping admin seeding. Existing admins are unaffected.');
        return;
    }

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

// Session comes from the HttpOnly cookie only.
//
// The Bearer header path is gone because the token it carried was read from
// localStorage, where any XSS could exfiltrate it. The `?token=` query path is
// gone because tokens in URLs leak into server access logs, browser history and
// Referer headers -- it existed solely so generated-PDF <a> links could
// authenticate, which the cookie now does automatically on navigation.
function verifyToken(req, res, next) {
    const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;

    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        // Detail stays server-side. jwt.verify's messages distinguish an expired
        // token from a bad signature from malformed input, which tells an
        // attacker probing with forged cookies exactly which part to change next.
        // The client is told only that it is not authenticated.
        console.error('[Auth] verifyToken error:', err.message);
        return res.status(401).json({ error: 'Not authenticated' });
    }
}

// Issue the session. Replaces returning the raw token in the JSON body -- the
// browser never sees the token now, so there is nothing for script to store or
// steal. The CSRF cookie is deliberately readable by script: the client echoes
// it back in a header, and an attacker on another origin can do neither.
function startSession(res, user) {
    res.cookie(SESSION_COOKIE, signToken(user), sessionCookieOptions());
    res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), {
        httpOnly: false,
        sameSite: 'lax',
        secure: IS_PROD,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

function endSession(res) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
}

// Double-submit CSRF check on state-changing requests. Cookies ride along
// automatically on cross-site requests in a way Authorization headers never
// did, so moving to cookie sessions introduces a CSRF surface that the old
// Bearer scheme did not have. SameSite=lax blocks the common cross-site POST;
// this is the second layer, for anything Lax lets through.
function csrfProtection(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    // Unauthenticated entry points have no session to ride, so there is nothing
    // for an attacker to leverage; requiring a CSRF cookie here would just make
    // login impossible before one is issued.
    const exempt = ['/api/auth/login', '/api/auth/register'];
    if (exempt.includes(req.path)) return next();

    const cookieToken = req.cookies ? req.cookies[CSRF_COOKIE] : null;
    const headerToken = req.get(CSRF_HEADER);

    if (!cookieToken || !headerToken) {
        return res.status(403).json({ error: 'Missing CSRF token' });
    }

    const a = Buffer.from(String(cookieToken));
    const b = Buffer.from(String(headerToken));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}

function logout(req, res) {
    endSession(res);
    res.json({ success: true });
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

        startSession(res, user);
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
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

        startSession(res, user);
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

function me(req, res) {
    res.json({ user: req.user });
}

// ── Removed: Supabase social-login bridge ─────────────────────
// POST /api/auth/oauth/sync is gone along with public/auth-callback.html and
// the Google/GitHub buttons on the login page.
//
// The bridge ran supabase-js inside the browser to complete the PKCE exchange,
// which stores the Supabase session and code verifier in localStorage. That is
// the same browser-readable-credential problem this containment pass removes
// from TrustBot's own session, so keeping it would have undercut the change.
// It was also a standing privilege-escalation surface: the endpoint accepted
// any valid Supabase access token, so its safety depended on provider and
// email-verification checks staying correct forever.
//
// Social sign-in returns with the portfolio-wide OIDC client integration,
// handled server-side, rather than as a per-application bridge.

// ── mount routes ─────────────────────────────────────────────
function mountAuthRoutes(app) {
    seedAdmin().catch(console.error);
    app.post('/api/auth/register', register);
    app.post('/api/auth/login', login);
    app.post('/api/auth/logout', logout);
    app.get('/api/auth/me', verifyToken, me);
}

module.exports = { mountAuthRoutes, verifyToken, requireAdmin, requireClient, csrfProtection };
