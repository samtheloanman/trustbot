# TrustBot Integrations

## External Services

| Service | Purpose | Auth method |
|---|---|---|
| **Supabase** | PostgreSQL database (users + submissions) | Anon key + URL |
| **Google Maps Places API** | Address autocomplete on all address fields + real estate assets | API key (client-side) |
| **SMTP / Gmail** | Email delivery of PDF packages | App password via SMTP |
| **Vercel** | Serverless hosting + CDN | CLI / GitHub integration |
| **GitHub CDN** | Runtime download of Sparticuz Chromium binary | Public URL (no auth) |

## Environment Variables Required

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | ✅ | Google Maps Places API |
| `JWT_SECRET` | ✅ | JWT signing secret (falls back to insecure default) |
| `ADMIN_EMAIL` | optional | Additional admin email to seed |
| `ADMIN_PASSWORD` | optional | Admin password (falls back to hardcoded) |
| `SMTP_HOST` | for email | SMTP server host |
| `SMTP_PORT` | for email | SMTP port (587) |
| `SMTP_SECURE` | for email | TLS flag |
| `SMTP_USER` | for email | SMTP username |
| `SMTP_PASS` | for email | SMTP app password |
| `EMAIL_FROM` | for email | Sender address |
| `PORT` | local dev | Server port (default 3000) |

## API Keys & Access

- **Google Maps:** Key `AIzaSyCzFIB03eu_nTgcKN_ShYnDPz_9JzbDc90` — created under CMTG project, restricted to `*trustbot-delta.vercel.app/*` and `*localhost*`
- **Supabase:** Uses anon key — RLS not fully configured (direct table access)
- **Vercel:** Deployed via `vercel` CLI, env vars synced to Production + Preview + Development scopes

## Webhooks / Callbacks
- None currently implemented

## Third-party SDKs
- `@supabase/supabase-js` — official Supabase JS client
- Google Maps JavaScript API loaded dynamically via `<script>` tag (async)
