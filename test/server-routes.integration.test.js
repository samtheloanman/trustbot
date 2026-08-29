/**
 * Integration tests against the REAL server.js route table.
 *
 *   node --test test/server-routes.integration.test.js
 *
 * Unlike auth-containment.test.js, which exercises the middleware through a
 * purpose-built app, this file requires the actual server.js and drives its
 * real routes, real middleware order and real handlers. Supabase, the PDF
 * generator, the mailer and the submissions store are replaced in the module
 * cache before server.js loads, so nothing here touches the network, a
 * database, or Chromium.
 *
 * Proves:
 *   - anonymous admin document download is denied
 *   - a client role cannot reach admin document download
 *   - an authenticated admin download mints a 60-second SIGNED url
 *   - getPublicUrl is never called on the download path
 *   - the deleted legacy public routes now 404
 *   - storage failures and generation failures return generic messages
 *
 * NOTE ON SCOPE: this proves the application's behaviour. It cannot prove that
 * the `trustbot-docs` bucket is actually PRIVATE in Supabase -- a signed URL
 * over a public bucket is still bypassable by object URL. That check is manual
 * and appears in DEPLOYMENT-CHECKLIST.md.
 */

const { test, before, after, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');

// ── Fail-closed config, satisfied before any project module loads ───────────
process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';
// Deliberately empty (rather than deleted): dotenv must not repopulate the real
// local value when server.js loads. seedAdmin() then returns before DB access.
process.env.ADMIN_PASSWORD = '';

const ROOT = path.join(__dirname, '..');
const resolve = (p) => require.resolve(path.join(ROOT, p));

// ── Recording stubs ─────────────────────────────────────────────────────────
const calls = { createSignedUrl: [], getPublicUrl: [], upload: [], email: [] };
let signedUrlResult = { data: { signedUrl: 'https://stub.supabase.co/signed/doc.pdf?token=abc' }, error: null };
let generateResult = { pdfBuffers: [Buffer.from('%PDF-1.4 stub')], fileNames: ['living_trust.pdf'] };
let generateShouldThrow = null;

function stubModule(relPath, exports) {
    const id = resolve(relPath);
    require.cache[id] = { id, filename: id, loaded: true, exports };
}

stubModule('db.js', {
    supabase: {
        storage: {
            from() {
                return {
                    async createSignedUrl(objectPath, expiresIn) {
                        calls.createSignedUrl.push({ objectPath, expiresIn });
                        return signedUrlResult;
                    },
                    getPublicUrl(objectPath) {
                        calls.getPublicUrl.push({ objectPath });
                        return { data: { publicUrl: 'https://stub.supabase.co/public/' + objectPath } };
                    },
                    async upload(objectPath, buf, opts) {
                        calls.upload.push({ objectPath, opts });
                        return { error: null };
                    },
                };
            },
        },
        from() {
            throw new Error('unexpected database access in integration test');
        },
    },
});

stubModule('generate.js', {
    async generateTrustPackage() {
        if (generateShouldThrow) throw new Error(generateShouldThrow);
        return generateResult;
    },
});

stubModule('email.js', {
    async sendTrustPackage(to) {
        calls.email.push({ to });
    },
});

stubModule('submissions.js', {
    async getById(id) {
        return id === 'missing' ? null : { id, status: 'pending', data: { grantor_name: 'A. Person' } };
    },
    async create() { return { id: 's-stub' }; },
    async update() { return { id: 's-stub' }; },
    async listAll() { return []; },
    async listByUser() { return []; },
    async remove() { return true; },
});

// Now load the real app.
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken'));
const app = require(resolve('server.js'));

let server, base;

before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

beforeEach(() => {
    calls.createSignedUrl.length = 0;
    calls.getPublicUrl.length = 0;
    calls.upload.length = 0;
    calls.email.length = 0;
    signedUrlResult = { data: { signedUrl: 'https://stub.supabase.co/signed/doc.pdf?token=abc' }, error: null };
    generateShouldThrow = null;
});

// Mint the same cookie startSession() would, without needing the user table.
function cookieFor(role) {
    const token = jwt.sign({ id: 'u1', email: 'u@example.com', role, name: 'U' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const csrf = crypto.randomBytes(32).toString('hex');
    return { jar: `trustbot_session=${token}; trustbot_csrf=${csrf}`, csrf };
}

const DOWNLOAD = '/api/admin/submissions/s1/download/living_trust.pdf';

// ── anonymous and role enforcement on the real route ────────────────────────
describe('admin document download — real route', () => {
    test('anonymous download is denied', async () => {
        const res = await fetch(base + DOWNLOAD, { redirect: 'manual' });
        assert.equal(res.status, 401);
        assert.equal(calls.createSignedUrl.length, 0, 'must not sign anything for an anonymous caller');
    });

    test('a client role cannot download admin documents', async () => {
        const { jar } = cookieFor('client');
        const res = await fetch(base + DOWNLOAD, { headers: { cookie: jar }, redirect: 'manual' });
        assert.equal(res.status, 403);
        assert.equal(calls.createSignedUrl.length, 0);
    });

    test('an authenticated admin gets a signed URL redirect', async () => {
        const { jar } = cookieFor('admin');
        const res = await fetch(base + DOWNLOAD, { headers: { cookie: jar }, redirect: 'manual' });
        assert.equal(res.status, 302);
        assert.match(res.headers.get('location'), /\/signed\//);
    });

    test('the signed URL expires in 60 seconds', async () => {
        const { jar } = cookieFor('admin');
        await fetch(base + DOWNLOAD, { headers: { cookie: jar }, redirect: 'manual' });
        assert.equal(calls.createSignedUrl.length, 1);
        assert.equal(calls.createSignedUrl[0].expiresIn, 60);
        assert.equal(calls.createSignedUrl[0].objectPath, 's1/living_trust.pdf');
    });

    test('getPublicUrl is never used on the download path', async () => {
        const { jar } = cookieFor('admin');
        await fetch(base + DOWNLOAD, { headers: { cookie: jar }, redirect: 'manual' });
        assert.equal(calls.getPublicUrl.length, 0, 'a public URL would bypass the requireAdmin check entirely');
    });

    test('a storage failure returns a generic message, not internals', async () => {
        signedUrlResult = { data: null, error: { message: 'bucket "trustbot-docs" not found; service_role key rejected' } };
        const { jar } = cookieFor('admin');
        const res = await fetch(base + DOWNLOAD, { headers: { cookie: jar }, redirect: 'manual' });
        assert.equal(res.status, 404);
        const body = await res.text();
        assert.doesNotMatch(body, /service_role|bucket|not found;/i, 'storage internals must not reach the client');
        assert.match(body, /Document not available/);
    });
});

// ── deleted legacy routes ───────────────────────────────────────────────────
describe('legacy public routes are gone', () => {
    test('POST /generate is rejected and has no side effects', async () => {
        const res = await fetch(base + '/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grantor_name: 'X', grantor_city: 'Y', trust_name: 'Z', successor_trustee_1_name: 'W' }),
        });
        // 403, not 404: csrfProtection is global middleware and runs before the
        // route table, so an unmatched POST is refused for a missing CSRF token
        // before Express can report "no such route". Both mean the handler is
        // gone, and the 403 leaks slightly less -- a prober cannot tell a
        // deleted route from an existing one behind CSRF.
        assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
        assert.equal(calls.email.length, 0, 'the open email relay must be gone');
        assert.equal(calls.upload.length, 0, 'no document may be generated or stored');
    });

    test('GET /download/:sessionId/:filename returns 404', async () => {
        const res = await fetch(base + '/download/abc123/living_trust.pdf', { redirect: 'manual' });
        assert.equal(res.status, 404);
        assert.equal(calls.getPublicUrl.length, 0);
    });

    test('the removed social-login callback route returns 404', async () => {
        const res = await fetch(base + '/auth/callback', { redirect: 'manual' });
        assert.equal(res.status, 404);
    });

    test('the frozen OAuth-server consent route is not served', async () => {
        const res = await fetch(base + '/oauth/consent', { redirect: 'manual' });
        assert.equal(res.status, 404);
    });
});

// ── error handling on the real generation route ─────────────────────────────
describe('generation errors do not leak internals', () => {
    test('a generation failure returns a generic message', async () => {
        generateShouldThrow = 'Chromium launch failed: /usr/local/lib/node_modules/... ENOENT';
        const { jar, csrf } = cookieFor('admin');
        const res = await fetch(base + '/api/admin/submissions/s1/generate', {
            method: 'POST',
            headers: { cookie: jar, 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        assert.equal(res.status, 500);
        const body = await res.text();
        assert.doesNotMatch(body, /Chromium|ENOENT|node_modules/, 'internal paths and causes must not reach the client');
        assert.match(body, /Failed to generate documents/);
    });

    test('an invalid session returns no verification detail', async () => {
        const res = await fetch(base + '/api/auth/me', {
            headers: { cookie: 'trustbot_session=not-a-real-jwt' },
        });
        assert.equal(res.status, 401);
        const body = await res.text();
        // jwt.verify messages ("jwt malformed", "invalid signature", "jwt expired")
        // tell a prober which part of a forged cookie to change next.
        assert.doesNotMatch(body, /malformed|invalid signature|jwt expired|details/i);
    });
});

// ── config route no longer ships browser Supabase credentials ───────────────
describe('client config surface', () => {
    test('/api/config exposes no Supabase credentials', async () => {
        const res = await fetch(base + '/api/config');
        assert.equal(res.status, 200);
        const cfg = await res.json();
        assert.ok(!('supabaseUrl' in cfg), 'the browser no longer talks to Supabase directly');
        assert.ok(!('supabaseAnonKey' in cfg));
    });
});
