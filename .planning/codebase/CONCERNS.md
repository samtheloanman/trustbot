# TrustBot Technical Concerns & Risks

## 🔴 Critical (block reliable production use)

### 1. Vercel function timeout — PDF generation
- **Problem:** Vercel default function timeout is 10s. PDF generation takes 20-30s.
- **Impact:** All PDF generation will timeout in production → 504 errors
- **Fix:** Add `"maxDuration": 60` to `vercel.json` function config

### 2. No Supabase RLS (Row Level Security)
- **Problem:** Tables use anon key with no RLS policies → any authenticated user can read all rows
- **Impact:** Client A can read Client B's trust data via direct Supabase API calls
- **Fix:** Enable RLS + add policies: submissions readable only by owner or admin role

### 3. JWT secret insecure fallback
- **Problem:** `auth.js` line: `const JWT_SECRET = process.env.JWT_SECRET || 'trustbot-dev-secret-change-me'`
- **Impact:** If `JWT_SECRET` env var is not set in production, tokens are signed with a public default
- **Fix:** Throw on startup if `JWT_SECRET` is not set and `NODE_ENV === 'production'`

### 4. Admin password hardcoded fallback
- **Problem:** `auth.js` line: `const password = process.env.ADMIN_PASSWORD || 'Lolo@2323'`
- **Impact:** If env var is missing, admin account uses a known password
- **Fix:** Same as above — throw on production startup if not set

---

## 🟠 High (fix soon)

### 5. Real client PDF data committed to git
- **Problem:** `output/Farshid_Valizadeh/` contains 5 real client PDFs in the repository
- **Fix:** Add `output/` to `.gitignore`, remove with `git rm -r --cached output/`

### 6. No rate limiting
- **Problem:** `/api/auth/login`, `/api/submissions`, `/api/generate` have no rate limits
- **Impact:** Brute-force login, spam submissions, PDF generation DoS
- **Fix:** Add `express-rate-limit` on auth and generate routes

### 7. No input validation / sanitization
- **Problem:** `req.body` passed directly to Supabase and Handlebars with no schema validation
- **Impact:** XSS risk in PDFs, unexpected crashes on malformed data
- **Fix:** Add Zod or Joi validation on `POST /api/submissions`

### 8. One-off fix scripts in repo root
- **Files:** `fix_address.py`, `fix_app_js.js`, `fix_html.js`, `fix_html2.js`, `fix_html_classes.js`, `fix_index_primary_trustee.js`, `fix_trustbot.py`, `modify_html.py`
- **Fix:** Delete all, commit cleanup

---

## 🟡 Medium (tech debt)

### 9. Chromium binary download at runtime
- Chromium-min downloads ~130MB binary from GitHub CDN on cold start
- Cold starts will be slow (10-30s download before PDF can start)
- Consider: pre-cached binary via Vercel build step

### 10. No CI/CD pipeline
- No GitHub Actions — code goes straight to prod on push with no automated checks
- Fix: Add `.github/workflows/ci.yml` with lint + test on every PR

### 11. No structured logging
- `console.log` / `console.error` only — no log levels, no correlation IDs
- Fix: Add `pino` or structured JSON logging for Vercel log parsing

### 12. No error pages
- Unhandled errors return raw JSON — no user-friendly error UI
- Fix: Add frontend error display + server `process.on('unhandledRejection')` handler

### 13. Supabase anon key in client-side config endpoint
- `GET /api/config` returns Google Maps key — intentional but worth auditing what else leaks

---

## 🟢 Low (nice to have)

- TypeScript migration
- Bundle optimization / frontend build step
- Admin pagination (currently fetches ALL submissions)
- PDF caching (regenerating same data is expensive)
- Webhook on submission → notify admin

---

## ✅ Completed Fixes (recent)

| Fix | Commit |
|---|---|
| Safari PDF download (base64 → real file download) | `77a6224` |
| Auth system: JWT + bcrypt + admin/client roles | `5c5ecd8` |
| Vercel serverless migration | `b26b57d` |
| Supabase DB connection + login fix | `0545f8b` |
| Edit submission JSON in admin panel | `201f9ea` |
| Chromium → chromium-min (50MB size fix) | `a7dbc01` |
| Google Maps Places autocomplete on all address fields | session |
| Unit/apt number support on all address fields | session |
| Person selector (reuse people across roles) | session |
| Real estate asset: Places autocomplete + APN required | `1cfa1d6` |
| `primaryTrusteeDisplay` null reference crash | `f30572b` |
| `--no-zygote` flag + `HOME=/tmp` (libnss3 crash) | `e9a306e` |
| `submissions.js` snake_case column mismatch | `e9a306e` |
| DB migration: add `user_name`, `user_email` columns | migration |
