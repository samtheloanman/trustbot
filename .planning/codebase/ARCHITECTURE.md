# TrustBot Architecture

## Overview
TrustBot is a California estate planning SaaS. Clients fill a 12-step guided intake form; the system generates a legally-structured 5-document trust package as PDFs, stores the submission in Supabase, and optionally emails the package to the client.

**Pattern:** Monolithic Express app with a single frontend + backend, deployed serverless on Vercel.

---

## Component Map

```
Browser (Client)
  └── public/index.html     ← 12-step form (vanilla HTML/JS)
  └── public/app.js         ← Form logic, address book, autocomplete
  └── public/admin.html     ← Admin dashboard
  └── public/admin.js       ← Submission management, PDF trigger
  └── public/login.html     ← Auth page
  └── public/style.css      ← CSS custom properties design system

Vercel Serverless
  └── api/index.js          ← Entrypoint (wraps Express for Vercel)
  └── server.js             ← Express 5.x app + all routes

Business Logic
  ├── auth.js               ← JWT, bcrypt, role middleware
  ├── submissions.js        ← Supabase CRUD for submissions
  ├── generate.js           ← PDF generation (Puppeteer + Handlebars)
  ├── email.js              ← nodemailer email dispatch
  └── db.js                 ← Supabase client singleton

Templates (Handlebars → PDF)
  ├── templates/living_trust.html
  ├── templates/healthcare_directive.html
  ├── templates/financial_poa.html
  ├── templates/hipaa.html
  └── templates/pour_over_will.html

External
  ├── Supabase              ← PostgreSQL (users + submissions)
  └── Google Maps Places    ← Address autocomplete
```

---

## Data Flow

```
1. CLIENT FILLS FORM
   index.html (12 steps) → app.js collects data
   → POST /api/submissions (with JWT)
   → submissions.js → Supabase trustbot_submissions (status: pending)

2. ADMIN REVIEWS
   admin.js → GET /api/admin/submissions → renders table
   → Admin clicks "Generate PDFs"
   → POST /api/generate/:id

3. PDF GENERATION
   server.js → generate.js
   → prepareData(rawFormData) → normalized template vars
   → Handlebars.compile(template) × 5 templates
   → Puppeteer (chromium-min) → page.pdf() × 5
   → Returns PDF buffers

4. DELIVERY
   → Download: ZIP sent as response
   → Email: nodemailer sends PDFs as attachments
   → Supabase: generated_files refs updated, status → completed
```

---

## API Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create client account |
| `POST` | `/api/auth/login` | None | Login → JWT |
| `GET` | `/api/auth/me` | JWT | Get current user |
| `GET` | `/api/config` | None | Return Google Maps key |
| `POST` | `/api/submissions` | Client JWT | Save form submission |
| `GET` | `/api/submissions` | Client JWT | List own submissions |
| `GET` | `/api/admin/submissions` | Admin JWT | List all submissions |
| `GET` | `/api/admin/submissions/:id` | Admin JWT | Get one submission |
| `PUT` | `/api/admin/submissions/:id` | Admin JWT | Edit submission data |
| `POST` | `/api/generate` | Admin JWT | Generate PDF package |

---

## Database Schema

### `trustbot_users`
| Column | Type | Notes |
|---|---|---|
| `id` | text | PK, `admin-seed-1`, `u-{nanoid}` |
| `email` | text | Unique, lowercase |
| `name` | text | Display name |
| `role` | text | `admin` or `client` |
| `password` | text | bcrypt hash |
| `createdAt` | text | ISO timestamp |

### `trustbot_submissions`
| Column | Type | Notes |
|---|---|---|
| `id` | text | PK, `s-{nanoid}` |
| `profile_id` | text | FK → trustbot_users.id |
| `user_name` | text | Denormalized for display |
| `user_email` | text | Denormalized for display |
| `status` | enum | `pending` / `completed` |
| `data` | json | Full form payload |
| `generated_files` | json | Array of file refs |
| `created_at` | timestamp | Row creation time |
| `updated_at` | timestamp | Last update time |

---

## Security Model
- **Auth:** JWT signed with `JWT_SECRET` (7d TTL)
- **Roles:** `requireAdmin` and `requireClient` middleware on all protected routes
- **Passwords:** bcrypt (cost factor 10)
- **Gaps:** No rate limiting, no input validation/sanitization, no RLS on Supabase tables, JWT secret has insecure fallback
