# TrustBot File Structure

## Directory Tree (annotated)

```
trustbot/
├── api/
│   └── index.js            ← Vercel serverless entrypoint
├── public/                 ← Static frontend (served by Express)
│   ├── index.html          ← 12-step trust intake form (~2100 lines)
│   ├── app.js              ← Form logic, Google Maps, person selectors (~1000 lines)
│   ├── admin.html          ← Admin dashboard UI
│   ├── admin.js            ← Admin logic: list/view/edit/generate
│   ├── login.html          ← Login page
│   └── style.css           ← CSS custom properties, dark theme
├── templates/              ← Handlebars HTML → PDF templates
│   ├── living_trust.html
│   ├── healthcare_directive.html
│   ├── financial_poa.html
│   ├── hipaa.html
│   └── pour_over_will.html
├── output/                 ← Local PDF output (dev only, should NOT be in git)
│   └── Farshid_Valizadeh/  ← ⚠️ Real client data in git
├── .planning/              ← GSD planning directory
│   ├── codebase/           ← This codebase map
│   ├── PROJECT.md          ← Project context and goals
│   ├── REQUIREMENTS.md     ← Scoped requirements
│   ├── ROADMAP.md          ← Phase structure
│   └── STATE.md            ← GSD project memory
├── .agent/                 ← GSD agent toolkit
├── .agents/                ← Extended agents toolkit
├── server.js               ← Express app + all routes
├── auth.js                 ← JWT, bcrypt, role middleware, admin seeding
├── db.js                   ← Supabase client singleton
├── submissions.js          ← Submission CRUD (Supabase)
├── generate.js             ← PDF generation engine
├── email.js                ← nodemailer email dispatch
├── package.json            ← Dependencies + npm scripts
├── vercel.json             ← Vercel deployment config
├── railway.json            ← Railway deployment config
├── Dockerfile              ← Container build (Railway)
├── .env                    ← Local env vars (not in git)
├── .env.example            ← Template for env vars
└── [fix_*.js/py]           ← ⚠️ One-off fix scripts (should be cleaned up)
```

## Core Files

| File | Lines | Purpose |
|---|---|---|
| `server.js` | ~220 | All Express routes, middleware mounting |
| `auth.js` | ~148 | JWT auth, role guards, admin seeding |
| `db.js` | ~10 | Supabase singleton |
| `submissions.js` | ~85 | CRUD for trustbot_submissions table |
| `generate.js` | ~327 | PDF generation pipeline |
| `email.js` | ~50 | Email delivery |
| `public/app.js` | ~1000 | Frontend form logic |
| `public/index.html` | ~2100 | 12-step form markup |
| `public/admin.js` | ~337 | Admin dashboard logic |

## Frontend Architecture
- **No framework** — vanilla HTML, CSS, JavaScript
- **Form state:** Collected via DOM queries at submit time (no SPA state)
- **Address autocomplete:** Google Maps Places API loaded dynamically from `/api/config`
- **Person selector:** Address book built from entered names, reused via `<select>` dropdowns
- **Toggling:** CSS `display:none/block` for conditional sections (trustees, agents, etc.)

## Backend Architecture
- **Pattern:** Classic MVC-lite — routes in `server.js`, logic in `*.js` modules
- **No ORM** — raw Supabase client calls in `submissions.js`
- **No framework router** — everything mounted inline in `server.js`

## Template System
- **Engine:** Handlebars.js
- **Templates:** 5 HTML files with `{{variable}}`, `{{#if}}`, `{{#each}}` blocks
- **Data prep:** `prepareData()` in `generate.js` normalizes raw form data → flat template context
- **Rendering pipeline:** `Handlebars.compile(template)(data)` → `page.setContent(html)` → `page.pdf()`
