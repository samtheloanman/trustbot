# TrustBot — REQUIREMENTS.md

## Milestone 1: Foundation (✅ Completed)
Core form → PDF pipeline working end-to-end.

### REQ-101: California Living Trust Intake Form
- [x] 12-step guided form covering all trust document fields
- [x] Grantor info, trustees, beneficiaries, guardians, healthcare, financial POA, assets
- [x] Marital status + spouse fields
- [x] Per-person gender, address, phone, city, state, zip

### REQ-102: PDF Generation
- [x] 5 California legal documents generated as PDFs
- [x] Living Trust, Healthcare Directive, Financial POA, HIPAA, Pour-Over Will
- [x] Handlebars templates with proper legal formatting
- [x] Download to browser

### REQ-103: Authentication
- [x] Client registration + login
- [x] Admin role for sam@c-mtg.com
- [x] JWT-based auth, 7-day sessions
- [x] Admin dashboard access control

### REQ-104: Admin Dashboard
- [x] List all submissions with status
- [x] View/edit raw submission JSON
- [x] Trigger PDF generation per submission

### REQ-105: Deployment
- [x] Live on Vercel at trustbot-delta.vercel.app
- [x] Supabase database connected
- [x] Environment variables synced

---

## Milestone 2: UX & Reliability (🔄 In Progress)
Make the system trustworthy and pleasant to use.

### REQ-201: Google Maps Integration
- [x] Places autocomplete on all person address fields
- [x] Unit/apt number field on all addresses
- [x] Real estate asset: Places autocomplete with APN required
- [x] Manual entry fallback for real estate (with APN still required)
- [x] API key restricted to trustbot domain

### REQ-202: Smart Form UX
- [x] Person selector — reuse existing people across roles (trustee, guardian, agent)
- [x] Choose existing person as successor trustee, healthcare agent, financial agent
- [x] Primary trustee toggle (self vs. other)
- [ ] Form validation — required field highlighting before submit
- [ ] Progress indicator — show step X of 12
- [ ] Save draft — restore in-progress form on page reload

### REQ-203: PDF Reliability (Critical)
- [x] Fix Vercel 50MB function size limit (chromium → chromium-min)
- [x] Fix libnss3.so crash (--no-zygote flag)
- [ ] Fix Vercel 10s timeout → set maxDuration: 60 in vercel.json
- [ ] PDF generation status polling — show real progress to user
- [ ] Graceful error messages on PDF failure (not raw JSON alert)

### REQ-204: Submission Pipeline
- [x] Fix submissions.js snake_case column mismatch (silent drop bug)
- [x] Add user_name / user_email columns to DB
- [ ] Admin sees submission with grantor name, status, date
- [ ] Status transitions: pending → generating → completed / failed
- [ ] Email notification to admin on new submission

---

## Milestone 3: Production Hardening (📋 Planned)
Make it safe and scalable.

### REQ-301: Security
- [ ] Enable Supabase RLS — clients can only read own submissions
- [ ] Require JWT_SECRET env var in production (no fallback)
- [ ] Rate limiting on /api/auth/login and /api/generate
- [ ] Input validation (Zod) on POST /api/submissions
- [ ] Remove hardcoded admin password fallback
- [ ] Remove real client PDFs from git history (output/)

### REQ-302: Testing
- [ ] Supertest API test suite (all 10 endpoints)
- [ ] Playwright E2E: login → form → submit → admin → generate → download
- [ ] Unit tests for prepareData() in generate.js
- [ ] CI pipeline (GitHub Actions) on every push

### REQ-303: Observability
- [ ] Structured logging (pino) with correlation IDs
- [ ] Vercel function duration monitoring
- [ ] Error alerting (email or Slack on 500s)
- [ ] Admin dashboard: show error details on failed generation

### REQ-304: Cleanup
- [ ] Delete fix_*.js and fix_*.py scripts from root
- [ ] Add output/ to .gitignore, purge from git history
- [ ] Add .nvmrc or engines field to package.json
- [ ] Add ESLint + Prettier

---

## Milestone 4: Feature Expansion (🔮 Future)
Grow the product.

### REQ-401: Client Self-Service
- [ ] Client dashboard — view own submissions, re-download PDFs
- [ ] Email delivery option — receive PDFs by email directly
- [ ] Amendment workflow — submit changes to an existing trust

### REQ-402: Attorney Features
- [ ] Attorney role — manage multiple clients
- [ ] Review & approve mode — attorney reviews before PDF is finalized
- [ ] E-signature integration (DocuSign or HelloSign)
- [ ] White-label branding option

### REQ-403: Additional Documents
- [ ] Trust certification
- [ ] Property deed cover letters
- [ ] Schedule A (property list formatted document)
- [ ] Notarization guide PDF

### REQ-404: Business
- [ ] Payment integration (Stripe) — charge per trust package
- [ ] Referral tracking
- [ ] SEO landing pages
