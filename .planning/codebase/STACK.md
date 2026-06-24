# TrustBot Tech Stack

## Runtime & Framework
- **Runtime:** Node.js (CommonJS, `require`/`module.exports`)
- **Web Framework:** Express 5.2.x
- **Deployment target:** Vercel Serverless Functions (primary), Railway/Docker (fallback)
- **Entrypoint:** `api/index.js` wraps `server.js` for Vercel; `server.js` runs standalone locally

## Database & Storage
- **Database:** Supabase (PostgreSQL-hosted)
- **Client:** `@supabase/supabase-js ^2.104.1`
- **Tables:**
  - `trustbot_users` — auth, roles (admin/client)
  - `trustbot_submissions` — form data, status, generated file refs
- **Connection:** `db.js` singleton using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Authentication
- **Strategy:** Custom JWT (not Supabase Auth)
- **Library:** `jsonwebtoken ^9.0.3`
- **Password hashing:** `bcryptjs ^3.0.3`
- **Roles:** `admin` | `client`
- **Token TTL:** 7 days
- **Admin seeding:** `seedAdmin()` runs at startup — hardcodes `sam@c-mtg.com` as admin

## PDF Generation
- **Engine:** Puppeteer + Handlebars → PDF
- **Browser:** `@sparticuz/chromium-min ^131.0.1` (runtime download from GitHub CDN)
- **Puppeteer:** `puppeteer-core ^24.40.0`
- **Template engine:** `handlebars ^4.7.8`
- **5 documents generated:** Living Trust, Healthcare Directive, Financial POA, HIPAA Authorization, Pour-Over Will
- **Critical flags:** `--no-zygote`, `--no-sandbox`, `--disable-dev-shm-usage`, `HOME=/tmp`

## Email
- **Library:** `nodemailer ^8.0.1`
- **Transport:** SMTP (configured via env vars)
- **Use:** Sends completed PDF package to client email on request

## Deployment
- **Primary:** Vercel (serverless, via `vercel.json`)
- **URL:** `https://trustbot-delta.vercel.app`
- **Secondary:** Railway (via `railway.json` + `Dockerfile`)
- **Static assets:** `public/` served by Express static middleware

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | HTTP server |
| `@supabase/supabase-js` | ^2.104.1 | Database client |
| `jsonwebtoken` | ^9.0.3 | JWT auth tokens |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `handlebars` | ^4.7.8 | HTML template rendering |
| `puppeteer-core` | ^24.40.0 | Headless browser for PDF |
| `@sparticuz/chromium-min` | ^131.0.1 | Chromium binary (Lambda-compatible) |
| `nodemailer` | ^8.0.1 | Email delivery |
| `dotenv` | ^17.3.1 | Environment variable loading |
