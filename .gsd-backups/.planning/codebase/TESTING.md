# TrustBot Testing State

## Current Coverage
**Zero.** `npm test` outputs: `"No tests yet"`.

No test framework is installed. No Playwright, Jest, Vitest, Mocha, or Supertest in `node_modules`.

## Existing Test Scripts (informal, root-level)
These are one-off debug scripts, not a test suite:

| Script | Purpose |
|---|---|
| `test-login.js` | Manual login HTTP test |
| `test-login-db.js` | Supabase connection + user lookup |
| `test-hash.js` | bcrypt hash verification |
| `test-anon.js` | Anon Supabase access test |
| `test-sub.js` | Submission creation test |
| `check-submissions.js` | Read submissions from DB |

These are run manually with `node test-xxx.js`. They are not automated.

## What Needs Testing

### Critical paths (no coverage):
1. **Form submission end-to-end** — POST /api/submissions → Supabase write → admin can see it
2. **PDF generation** — POST /api/generate → 5 PDFs returned → no crash
3. **Auth flow** — register → login → JWT → protected route access
4. **Admin dashboard** — loads submissions, status correct, generate button works
5. **Real estate field** — Places autocomplete initializes, APN required validation

### Regression risks (bugs that already occurred):
- Chromium `--no-zygote` flag removed → libnss3 crash returns
- submissions.js snake_case reverted → all submissions silently dropped
- primaryTrusteeDisplay null ref → JS crash on load

## Recommended Test Strategy

### Layer 1: API tests with Supertest (fastest, highest ROI)
```
npm install --save-dev supertest
```
Test all 10 API endpoints: auth, submissions, admin, generate.

### Layer 2: Playwright E2E (browser)
```
npm install --save-dev @playwright/test
npx playwright install chromium
```
Test the full client journey + admin review.

### Layer 3: Unit tests for generate.js
```
npm install --save-dev jest
```
Test `prepareData()` with known inputs → verify template variable output.

## Tools to Install

```bash
npm install --save-dev supertest jest @playwright/test
npx playwright install chromium
```
