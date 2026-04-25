# TrustBot — ROADMAP.md

## Milestone 1: Foundation ✅ COMPLETE
> Core form → PDF pipeline, auth, admin dashboard, Vercel deployment

| Phase | Description | Status |
|---|---|---|
| 1.0 | Initial form + PDF generation (5 docs) | ✅ Done |
| 1.1 | Safari PDF download fix | ✅ Done |
| 1.2 | Auth system (JWT, bcrypt, roles) | ✅ Done |
| 1.3 | 12-step form expansion (all PDF fields) | ✅ Done |
| 1.4 | Vercel serverless migration | ✅ Done |
| 1.5 | Supabase DB connection + login fix | ✅ Done |
| 1.6 | Admin edit submission JSON | ✅ Done |
| 1.7 | Chromium-min (50MB size fix) | ✅ Done |

---

## Milestone 2: UX & Reliability 🔄 IN PROGRESS
> Make the product trustworthy and delightful to use

| Phase | Description | Status | Depends on |
|---|---|---|---|
| 2.1 | Google Maps Places autocomplete (all addresses) | ✅ Done | 1.7 |
| 2.2 | Unit/apt number on all address fields | ✅ Done | 2.1 |
| 2.3 | Person selector (reuse people across roles) | ✅ Done | 1.3 |
| 2.4 | Real estate field: Places + APN required | ✅ Done | 2.1 |
| 2.5 | Fix libnss3.so crash (--no-zygote) | ✅ Done | 1.7 |
| 2.6 | Fix submissions column mismatch (snake_case) | ✅ Done | 1.5 |
| **2.7** | **Fix Vercel PDF timeout (maxDuration: 60)** | 🔴 NEXT | 2.5 |
| 2.8 | Form validation — required field highlights | 📋 Planned | 1.3 |
| 2.9 | Status transitions + polling (pending→generating→done) | 📋 Planned | 2.6 |
| 2.10 | Error UX — user-friendly failure messages | 📋 Planned | 2.7 |
| 2.11 | Admin email notification on new submission | 📋 Planned | 2.6 |

---

## Milestone 3: Production Hardening 📋 PLANNED
> Make it safe and observable before real client volume

| Phase | Description | Status | Depends on |
|---|---|---|---|
| 3.1 | Supabase RLS — row-level security policies | 📋 Planned | 2.6 |
| 3.2 | Security hardening (JWT env, rate limiting, validation) | 📋 Planned | 2.7 |
| 3.3 | Codebase cleanup (fix scripts, git history) | 📋 Planned | — |
| 3.4 | Supertest API test suite | 📋 Planned | 2.6 |
| 3.5 | Playwright E2E test suite | 📋 Planned | 3.4 |
| 3.6 | CI pipeline (GitHub Actions) | 📋 Planned | 3.5 |
| 3.7 | Structured logging (pino) + error alerting | 📋 Planned | 3.4 |

---

## Milestone 4: Feature Expansion 🔮 FUTURE
> Grow from internal tool to customer-facing product

| Phase | Description | Status |
|---|---|---|
| 4.1 | Client dashboard (view own submissions, re-download) | 🔮 Future |
| 4.2 | Email delivery of PDF package to client | 🔮 Future |
| 4.3 | Payment integration (Stripe) | 🔮 Future |
| 4.4 | Attorney role + multi-client management | 🔮 Future |
| 4.5 | E-signature integration | 🔮 Future |
| 4.6 | Additional documents (deed cover, Schedule A) | 🔮 Future |
| 4.7 | Amendment workflow | 🔮 Future |
| 4.8 | SEO landing pages + marketing | 🔮 Future |

---

## Next Immediate Action: Phase 2.7

**Fix Vercel PDF timeout** — add maxDuration: 60 to vercel.json.
This is a production blocker — without it, all PDF generation will timeout at 10s.

Then Phase 2.8 → 2.9 to complete UX milestone, then Milestone 3 before any public launch.
