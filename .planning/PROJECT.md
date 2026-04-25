# TrustBot — PROJECT.md

## Vision
TrustBot is a California estate planning SaaS that guides clients through a 12-step guided intake form and automatically generates a legally-structured 5-document trust package (PDF). The goal is to make California living trust creation accessible, fast, and affordable — eliminating the need for clients to start with a blank legal document.

## Elevator Pitch
> "Fill out a guided form in 30 minutes. Get a complete California living trust package — Living Trust, Healthcare Directive, Financial POA, HIPAA Authorization, and Pour-Over Will — ready to sign."

## Target Users
- **Primary:** Individuals and couples in California wanting to establish a living trust (no attorney required for basic cases)
- **Secondary:** Estate planning attorneys using TrustBot as a client intake + document generation tool
- **Admin:** Sam (sam@c-mtg.com) — manages submissions, reviews, triggers document generation

## Tech Stack
- **Backend:** Node.js + Express 5.x (CommonJS)
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Database:** Supabase (PostgreSQL)
- **PDF Engine:** Puppeteer-core + @sparticuz/chromium-min + Handlebars
- **Auth:** Custom JWT + bcrypt
- **Deployment:** Vercel Serverless
- **Email:** nodemailer + SMTP

## Key Design Decisions
1. **No SPA framework** — vanilla JS keeps deployment simple and eliminates build steps
2. **Puppeteer for PDF** — HTML templates give precise control over legal document formatting
3. **chromium-min** — avoids Vercel's 50MB function size limit; binary downloaded at runtime
4. **Custom JWT auth** — avoids Supabase Auth complexity; simple admin/client role model
5. **Supabase anon key** — chosen for simplicity; RLS needs to be enabled before production scale

## Business Context
- Owned by Sam Tehranchi (CMTG / C-MTG.com)
- Live at: https://trustbot-delta.vercel.app
- Related projects: CMRE (real estate + mortgage platform), paperclip (AI orchestration)

## Current Status
**MVP live on Vercel.** Core form → PDF pipeline is functional. Known issues being actively fixed (see CONCERNS.md). Not yet production-hardened (no tests, no rate limiting, no RLS).
