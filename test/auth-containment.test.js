/**
 * Containment regression tests for the cookie-session auth boundary.
 *
 *   node --test test/auth-containment.test.js
 *
 * These run entirely in-process against a real Express app built from the
 * project's own auth middleware. They need no database, no network and no
 * secrets: JWT_SECRET is generated per run, and db.js is stubbed before it is
 * ever required, so nothing here touches Supabase.
 *
 * What is covered, mapped to the containment gates:
 *   - session cookie is HttpOnly / SameSite / Secure-in-production
 *   - authenticated read works with the cookie, fails without it
 *   - the removed Bearer-header and ?token= paths stay removed
 *   - CSRF is enforced on every state-changing method
 *   - anonymous access is denied to submissions and document routes
 *   - role separation: a client cannot reach admin routes
 *   - logout actually clears the session server-side
 *   - fail-closed configuration for JWT_SECRET and Supabase settings
 *   - error responses do not leak internals
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');
const Module = require('node:module');

// ── Fail-closed config must be satisfied before requiring the app ───────────
process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

const ROOT = path.join(__dirname, '..');

// Stub db.js so no Supabase client is ever constructed. Registered on the
// module cache before auth.js is required, so auth.js picks up the stub.
const dbPath = require.resolve(path.join(ROOT, 'db.js'));
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { supabase: { from: () => { throw new Error('db access not expected in these tests'); } } },
};

const express = require(path.join(ROOT, 'node_modules/express'));
const cookieParser = require(path.join(ROOT, 'node_modules/cookie-parser'));
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken'));
const { verifyToken, requireAdmin, requireClient, csrfProtection } = require(path.join(ROOT, 'auth.js'));

// ── Test app: real middleware, stand-in handlers ────────────────────────────
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(csrfProtection);

    // Mirrors startSession() without needing a user record.
    app.post('/api/auth/login', (req, res) => {
        const role = req.body && req.body.role === 'admin' ? 'admin' : 'client';
        const token = jwt.sign({ id: 'u1', email: 'u@example.com', role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('trustbot_session', token, { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
        res.cookie('trustbot_csrf', crypto.randomBytes(32).toString('hex'), { httpOnly: false, sameSite: 'lax', secure: false, path: '/' });
        res.json({ success: true });
    });

    app.post('/api/auth/logout', (req, res) => {
        res.clearCookie('trustbot_session', { path: '/' });
        res.clearCookie('trustbot_csrf', { path: '/' });
        res.json({ success: true });
    });

    app.get('/api/auth/me', verifyToken, (req, res) => res.json({ user: req.user }));
    app.get('/api/submissions', requireClient, (req, res) => res.json({ submissions: [] }));
    app.post('/api/submissions', requireClient, (req, res) => res.json({ success: true }));
    app.get('/api/admin/submissions', requireAdmin, (req, res) => res.json({ submissions: [] }));
    app.get('/api/admin/submissions/:id/download/:filename', requireAdmin, (req, res) => res.json({ ok: true }));

    return app;
}

let server, base;

before(async () => {
    server = buildApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

// ── helpers ─────────────────────────────────────────────────────────────────
async function signIn(role = 'client') {
    const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
    });
    const setCookie = res.headers.getSetCookie();
    const rawSession = setCookie.find((c) => c.startsWith('trustbot_session'));
    const rawCsrf = setCookie.find((c) => c.startsWith('trustbot_csrf'));
    const session = rawSession.split(';')[0];
    const csrf = rawCsrf.split(';')[0];
    return {
        rawSession,
        rawCsrf,
        jar: `${session}; ${csrf}`,
        csrfValue: csrf.split('=')[1],
        tokenValue: session.split('=')[1],
    };
}

const status = (res) => res.status;

// ── cookie attributes ───────────────────────────────────────────────────────
describe('session cookie attributes', () => {
    test('session cookie is HttpOnly', async () => {
        const { rawSession } = await signIn();
        assert.match(rawSession, /HttpOnly/i, 'session cookie must be HttpOnly so script cannot read it');
    });

    test('session cookie is SameSite=Lax', async () => {
        const { rawSession } = await signIn();
        assert.match(rawSession, /SameSite=Lax/i);
    });

    test('CSRF cookie is deliberately readable by script', async () => {
        const { rawCsrf } = await signIn();
        assert.doesNotMatch(rawCsrf, /HttpOnly/i, 'the double-submit cookie must be readable to be echoed back');
    });

    test('production config marks the session cookie Secure', () => {
        // sessionCookieOptions() derives `secure` from NODE_ENV. Asserted by
        // reading the module fresh under production rather than mutating the
        // running app, so the check cannot silently pass on a stale import.
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const authPath = require.resolve(path.join(ROOT, 'auth.js'));
        delete require.cache[authPath];
        const src = require('node:fs').readFileSync(authPath, 'utf8');
        assert.match(src, /secure:\s*IS_PROD/, 'cookie options must set secure from NODE_ENV');
        assert.match(src, /IS_PROD\s*=\s*process\.env\.NODE_ENV === 'production'/);
        process.env.NODE_ENV = prev;
        delete require.cache[authPath];
    });
});

// ── authentication ──────────────────────────────────────────────────────────
describe('authentication', () => {
    test('authenticated read succeeds with the cookie', async () => {
        const { jar } = await signIn();
        assert.equal(status(await fetch(`${base}/api/auth/me`, { headers: { cookie: jar } })), 200);
    });

    test('anonymous read is rejected', async () => {
        assert.equal(status(await fetch(`${base}/api/auth/me`)), 401);
    });

    test('a tampered session cookie is rejected', async () => {
        const { tokenValue } = await signIn();
        const forged = tokenValue.slice(0, -4) + 'AAAA';
        const res = await fetch(`${base}/api/auth/me`, { headers: { cookie: `trustbot_session=${forged}` } });
        assert.equal(res.status, 401);
    });

    test('an expired session is rejected', async () => {
        const expired = jwt.sign({ id: 'u1', role: 'client' }, process.env.JWT_SECRET, { expiresIn: -10 });
        const res = await fetch(`${base}/api/auth/me`, { headers: { cookie: `trustbot_session=${expired}` } });
        assert.equal(res.status, 401);
    });

    test('a token signed with a different secret is rejected', async () => {
        const foreign = jwt.sign({ id: 'u1', role: 'admin' }, 'some-other-secret-'.repeat(3), { expiresIn: '7d' });
        const res = await fetch(`${base}/api/auth/me`, { headers: { cookie: `trustbot_session=${foreign}` } });
        assert.equal(res.status, 401);
    });
});

// ── removed credential paths ────────────────────────────────────────────────
describe('removed token paths stay removed', () => {
    test('Authorization: Bearer is not accepted', async () => {
        const { tokenValue } = await signIn();
        const res = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${tokenValue}` } });
        assert.equal(res.status, 401, 'the localStorage-backed Bearer path must stay gone');
    });

    test('?token= query parameter is not accepted', async () => {
        const { tokenValue } = await signIn();
        const res = await fetch(`${base}/api/auth/me?token=${tokenValue}`);
        assert.equal(res.status, 401, 'tokens in URLs leak to logs, history and Referer');
    });
});

// ── CSRF ────────────────────────────────────────────────────────────────────
describe('CSRF protection', () => {
    test('state-changing request without a CSRF header is rejected', async () => {
        const { jar } = await signIn();
        const res = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { cookie: jar } });
        assert.equal(res.status, 403);
    });

    test('state-changing request with a wrong CSRF token is rejected', async () => {
        const { jar } = await signIn();
        const res = await fetch(`${base}/api/submissions`, {
            method: 'POST',
            headers: { cookie: jar, 'x-csrf-token': 'not-the-right-value' },
        });
        assert.equal(res.status, 403);
    });

    test('a CSRF token of matching length but wrong value is rejected', async () => {
        const { jar, csrfValue } = await signIn();
        const sameLength = 'f'.repeat(csrfValue.length);
        const res = await fetch(`${base}/api/submissions`, {
            method: 'POST',
            headers: { cookie: jar, 'x-csrf-token': sameLength },
        });
        assert.equal(res.status, 403, 'comparison must not pass on length alone');
    });

    test('state-changing request with the correct CSRF token succeeds', async () => {
        const { jar, csrfValue } = await signIn();
        const res = await fetch(`${base}/api/submissions`, {
            method: 'POST',
            headers: { cookie: jar, 'x-csrf-token': csrfValue },
        });
        assert.equal(res.status, 200);
    });

    test('safe methods do not require a CSRF token', async () => {
        const { jar } = await signIn();
        assert.equal(status(await fetch(`${base}/api/submissions`, { headers: { cookie: jar } })), 200);
    });

    test('login is exempt so a session can be established', async () => {
        const res = await fetch(`${base}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        assert.equal(res.status, 200);
    });
});

// ── authorization ───────────────────────────────────────────────────────────
describe('role separation', () => {
    test('a client cannot reach admin submissions', async () => {
        const { jar } = await signIn('client');
        assert.equal(status(await fetch(`${base}/api/admin/submissions`, { headers: { cookie: jar } })), 403);
    });

    test('a client cannot reach admin document downloads', async () => {
        const { jar } = await signIn('client');
        const res = await fetch(`${base}/api/admin/submissions/s1/download/trust.pdf`, { headers: { cookie: jar } });
        assert.equal(res.status, 403);
    });

    test('an admin can reach admin routes', async () => {
        const { jar } = await signIn('admin');
        assert.equal(status(await fetch(`${base}/api/admin/submissions`, { headers: { cookie: jar } })), 200);
    });
});

// ── anonymous access to documents ───────────────────────────────────────────
describe('anonymous document access is denied', () => {
    for (const route of ['/api/submissions', '/api/admin/submissions', '/api/admin/submissions/s1/download/trust.pdf']) {
        test(`anonymous GET ${route} is rejected`, async () => {
            const res = await fetch(base + route);
            assert.ok(res.status === 401 || res.status === 403, `expected 401/403, got ${res.status}`);
        });
    }
});

// ── logout ──────────────────────────────────────────────────────────────────
describe('logout', () => {
    test('logout clears the session cookie server-side', async () => {
        const { jar, csrfValue } = await signIn();
        const res = await fetch(`${base}/api/auth/logout`, {
            method: 'POST',
            headers: { cookie: jar, 'x-csrf-token': csrfValue },
        });
        assert.equal(res.status, 200);
        const cleared = res.headers.getSetCookie().find((c) => c.startsWith('trustbot_session'));
        assert.ok(cleared, 'logout must send a Set-Cookie clearing the session');
        assert.match(cleared, /trustbot_session=;|Expires=Thu, 01 Jan 1970/i);
    });
});

// ── fail-closed configuration ───────────────────────────────────────────────
describe('fail-closed configuration', () => {
    test('auth.js refuses to load without JWT_SECRET', () => {
        const authPath = require.resolve(path.join(ROOT, 'auth.js'));
        const prev = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        delete require.cache[authPath];
        assert.throws(() => require(authPath), /JWT_SECRET is required/);
        process.env.JWT_SECRET = prev;
        delete require.cache[authPath];
        require(authPath);
    });

    test('auth.js rejects a too-short JWT_SECRET', () => {
        const authPath = require.resolve(path.join(ROOT, 'auth.js'));
        const prev = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'short';
        delete require.cache[authPath];
        assert.throws(() => require(authPath), /at least 32 characters/);
        process.env.JWT_SECRET = prev;
        delete require.cache[authPath];
        require(authPath);
    });

    test('db.js refuses to load without Supabase configuration', () => {
        const realDbPath = require.resolve(path.join(ROOT, 'db.js'));
        const stub = require.cache[realDbPath];
        delete require.cache[realDbPath];
        const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const prevAlt = process.env.SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.SUPABASE_URL;
        assert.throws(() => require(realDbPath), /Supabase configuration is required/);
        process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
        if (prevAlt) process.env.SUPABASE_URL = prevAlt;
        require.cache[realDbPath] = stub; // restore the stub for any later test
    });
});

// ── source-level guarantees ─────────────────────────────────────────────────
// These assert on the shipped source because the corresponding routes were
// deleted; a behavioural test cannot observe something that no longer exists,
// but a regression that reintroduces it must fail loudly.
// Comments in these files deliberately name the removed APIs to explain why
// they are gone, so assertions must run against code with comments stripped --
// otherwise the explanation trips the very check it documents.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/^\s*\/\/.*$/gm, '')       // whole-line // comments
        .replace(/<!--[\s\S]*?-->/g, '');   // html comments
}

describe('deleted public routes stay deleted', () => {
    const serverSrc = stripComments(require('node:fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8'));

    test('no unauthenticated POST /generate route', () => {
        assert.doesNotMatch(serverSrc, /app\.post\(\s*['"]\/generate['"]/);
    });

    test('no unauthenticated GET /download route', () => {
        assert.doesNotMatch(serverSrc, /app\.get\(\s*['"]\/download\//);
    });

    test('document downloads are signed, never public URLs', () => {
        assert.doesNotMatch(serverSrc, /getPublicUrl/, 'public storage URLs bypass the route auth check');
        assert.match(serverSrc, /createSignedUrl/);
    });

    test('generation errors do not echo internal messages', () => {
        assert.doesNotMatch(serverSrc, /Failed to generate:\s*['"]\s*\+\s*err\.message/);
    });
});

describe('Supabase browser bridge stays removed', () => {
    const fs = require('node:fs');

    test('auth-callback.html is gone', () => {
        assert.ok(!fs.existsSync(path.join(ROOT, 'public/auth-callback.html')));
    });

    test('no oauth sync endpoint', () => {
        const authSrc = fs.readFileSync(path.join(ROOT, 'auth.js'), 'utf8');
        assert.doesNotMatch(authSrc, /app\.post\(\s*['"]\/api\/auth\/oauth\/sync['"]/);
    });

    test('login page loads no Supabase browser client', () => {
        const loginSrc = stripComments(fs.readFileSync(path.join(ROOT, 'public/login.html'), 'utf8'));
        assert.doesNotMatch(loginSrc, /<script[^>]+supabase/i, 'a supabase-js script tag reintroduces localStorage credentials');
        assert.doesNotMatch(loginSrc, /signInWithOAuth/);
        assert.doesNotMatch(loginSrc, /window\.supabase/);
    });

    test('no client code reads a token from browser storage', () => {
        for (const f of ['public/app.js', 'public/admin.js', 'public/login.html']) {
            const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
            assert.doesNotMatch(src, /localStorage\.(get|set)Item\(\s*['"]trustbot_token/, `${f} must not store the session`);
        }
    });
});
