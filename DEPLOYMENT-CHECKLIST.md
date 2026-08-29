# TrustBot — Auth Containment Deployment Checklist

This change moves TrustBot from `localStorage`-held bearer tokens to HttpOnly
cookie sessions, deletes two unauthenticated public routes, and makes secret and
database configuration fail closed. It is a **breaking** change: every existing
session is invalidated, and the app will refuse to start if configuration is
missing.

Work through this in order. Items marked **MANUAL** cannot be proven by the test
suite and must be confirmed by a human in a console.

---

## 1. Pre-deployment — external state

- [ ] **MANUAL — the `trustbot-docs` Supabase bucket is PRIVATE.**

  This is the single most important item and the test suite **cannot** verify it.

  The download route now mints a 60-second signed URL instead of returning a
  permanent public one. If the bucket is still public, that change buys nothing:
  every object remains readable by anyone who has or guesses its URL, and the
  `requireAdmin` check on the route is bypassed entirely by going straight to
  storage. Previously the app handed those public URLs to the browser, so they
  may already exist in browser history, proxy logs, and anywhere a link was
  shared.

  Confirm in Supabase Dashboard → Storage → `trustbot-docs` → the bucket is not
  marked Public. Then verify from a signed-out context:

  ```bash
  # Expect 400/403 — NOT 200. A 200 means the bucket is still public.
  curl -s -o /dev/null -w '%{http_code}\n' \
    "https://<project-ref>.supabase.co/storage/v1/object/public/trustbot-docs/<known-id>/living_trust.pdf"
  ```

- [ ] **MANUAL — decide what happens to documents already exposed.** If the
  bucket was public, treat every previously generated document as disclosed.
  Rotating the bucket to private does not retract URLs already distributed.

- [ ] **MANUAL — rotate `JWT_SECRET`.** The previous fallback
  (`trustbot-dev-secret-change-me`) is in version-control history, so any token
  signed with it is forgeable by anyone with repository access. Generate a new
  value of at least 32 characters and inject it through the deployment's secret
  manager:

  ```bash
  openssl rand -base64 48
  ```

  Do not place it in `.env.example`, a commit, or a chat message.

- [ ] **MANUAL — decide on `ADMIN_PASSWORD`.** Boot-time seeding is skipped
  entirely when it is unset, and existing admin accounts are unaffected. Set a
  fresh value only if seeding is still needed; the historic fallback is also
  disclosed and must not be reused.

- [ ] **MANUAL — audit for helper scripts carrying the old fallback password.**
  Confirm none can execute in a deployment path.

- [ ] **MANUAL — confirm the deployment terminates TLS.** The session cookie is
  issued with `Secure` whenever `NODE_ENV=production`, so it will not be sent
  over plain HTTP. Verify `NODE_ENV=production` is actually set in the
  environment, or sessions will silently be issued without `Secure`.

## 2. Pre-deployment — repository

- [ ] `npm ci` — `cookie-parser` is a new dependency.
- [ ] `npm test` — expect **48 passing, 0 failing**.
- [ ] Stage only the files in the staging manifest. The working tree contains
      unrelated in-progress work that must not ship with this change.

## 3. Deploy

- [ ] Inject `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and
      `SUPABASE_SERVICE_ROLE_KEY` through the secret manager. **The process will
      throw on startup if any are missing** — this is intended, not a fault.
- [ ] Deploy once. Rotating `JWT_SECRET` invalidates every existing session, so
      all users are signed out exactly once. Communicate this if relevant.
- [ ] Confirm the process actually started; a fail-closed throw looks like a
      crash loop in most platform logs.

## 4. Post-deployment verification — against the deployed URL

The test suite proves application behaviour in-process. These confirm the
deployed configuration, which it cannot reach.

- [ ] **Cookie attributes over HTTPS.** Sign in, then inspect the response:

  ```bash
  curl -si https://<host>/api/auth/login -X POST \
    -H 'Content-Type: application/json' \
    -d '{"email":"...","password":"..."}' | grep -i set-cookie
  ```

  `trustbot_session` must show `HttpOnly`, `Secure`, `SameSite=Lax`.
  `trustbot_csrf` must show `Secure` and `SameSite=Lax` but **not** `HttpOnly`.

- [ ] **Anonymous access is denied** to submissions and documents:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/submissions
  curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/admin/submissions
  curl -s -o /dev/null -w '%{http_code}\n' \
    https://<host>/api/admin/submissions/<id>/download/living_trust.pdf
  ```

  All must be 401.

- [ ] **Deleted legacy routes are gone** (expect 403 or 404, never 200):

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/generate
  curl -s -o /dev/null -w '%{http_code}\n' https://<host>/download/abc/x.pdf
  curl -s -o /dev/null -w '%{http_code}\n' https://<host>/auth/callback
  ```

- [ ] **A real admin download returns a signed, expiring URL.** Follow the
      redirect and confirm the target carries a token and query expiry. Wait 60
      seconds and re-request the same signed URL — it must now fail.

- [ ] **CSRF is enforced on every state-changing route.** With a valid session
      cookie but no `X-CSRF-Token` header, each of these must return 403:
      `POST /api/submissions`, `PUT /api/admin/submissions/:id`,
      `DELETE /api/admin/submissions/:id`,
      `POST /api/admin/submissions/:id/generate`, `POST /api/auth/logout`.

- [ ] **Login, logout and expiry.** Log in; confirm access. Log out; confirm the
      session cookie is cleared server-side and protected routes return 401 —
      clearing it in the browser alone is not sufficient evidence.

- [ ] **Role separation.** A client-role account must receive 403 on every
      `/api/admin/*` route, including document download.

- [ ] **No stack traces or internals in production responses.** Force a failure
      (for example a download for a non-existent object) and confirm the body
      carries only a generic message.

- [ ] **Social login is absent.** `/login` must show no Google/GitHub buttons and
      must not load `supabase-js`. `/auth/callback` must not resolve.

## 5. Rollback

Rotating `JWT_SECRET` is the one step that does not roll back cleanly: sessions
issued under the new secret are invalid under the old one, and vice versa.
Redeploying the previous build **also requires restoring the previous
`JWT_SECRET`** — which is the disclosed value, so treat that as an emergency
measure only and re-rotate immediately afterwards.

Preferred path is to roll forward. Users are signed out once either way.

See the staging manifest for file-specific working-tree rollback commands. Do
not use a blanket `git checkout -- .` in this repository; it would destroy
unrelated in-progress work.

## 6. Known gaps, deliberately not addressed here

- **Admin identities are still a hardcoded email list** in `seedAdmin()`. This is
  an implicit privilege policy living in source. Before TrustBot becomes a public
  legal-document service, admin identity should move entirely to configuration
  or the database.
- **No rate limiting** on login or registration.
- **No security headers** (`helmet`, CSP). A CSP matters more than usual here
  because the CSRF cookie is intentionally script-readable.
- **`bcryptjs`** is the pure-JS implementation and is slow; consider native
  `bcrypt` or `argon2` when the auth provider decision is made.
