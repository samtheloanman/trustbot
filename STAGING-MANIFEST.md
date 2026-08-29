# Staging Manifest — Auth Containment

The working tree contains unrelated in-progress work. Two files carry **both**
containment changes and someone else's feature work in the same file, so they
cannot be staged whole. Follow this path by path.

Nothing below commits. Review `git diff --cached` before you do.

---

## A. Stage whole — containment only

Every hunk in these files belongs to this change.

```bash
git add auth.js db.js server.js .env.example package.json package-lock.json
```

| Path | What it carries |
| --- | --- |
| `auth.js` | Fail-closed `JWT_SECRET`; HttpOnly cookie session; CSRF middleware; logout; removed Bearer, `?token=` and the Supabase sync endpoint; 401s no longer echo `jwt.verify` detail |
| `db.js` | Fail-closed Supabase configuration (was `example.supabase.co` / `dummy_key`) |
| `server.js` | `cookie-parser` + global CSRF; deleted public `POST /generate` and `GET /download/...`; deleted `/auth/callback` and `/oauth/consent`; signed download URLs; generic generation errors; Supabase keys removed from `/api/config` |
| `.env.example` | Documents the now-required Supabase vars; frozen OAuth-server notes stripped |
| `package.json` | `cookie-parser` dependency; `test` script |
| `package-lock.json` | Lockfile for `cookie-parser` |

## B. Stage new files

```bash
git add test/auth-containment.test.js
git add test/server-routes.integration.test.js
git add DEPLOYMENT-CHECKLIST.md
git add STAGING-MANIFEST.md
```

## C. Stage the deletion

```bash
git rm --cached public/auth-callback.html 2>/dev/null || true
```

`public/auth-callback.html` was never committed, so it is already gone from the
tree with nothing to stage. The command above is a no-op safeguard in case a
different branch has it tracked.

## D. Stage hunk by hunk — MIXED FILES, do not `git add` whole

These two files interleave containment changes with **unrelated in-progress
feature work**. Staging either one wholesale would sweep that work into this
commit.

```bash
git add -p public/admin.js
git add -p public/login.html
git add -p public/app.js
```

### `public/admin.js` — 12 hunks

| Hunk | Around | Stage? | What it is |
| --- | --- | --- | --- |
| 1–3 | lines 2–16 | **yes** | Drop `localStorage` token state; add `csrfToken()` reader |
| 4–5 | lines 26–40 | **yes** | `apiFetch` sends cookies + `X-CSRF-Token` instead of `Bearer` |
| 6–7 | lines 203–218 | **yes** | Remove `?token=` from PDF download links |
| 8–9 | lines 239–262 | **NO** | `summarizeCounts()` confirm dialog in `saveEdit` — unrelated feature |
| 10 | lines 280–300 | **NO** | `summarizeCounts()` function definition — unrelated feature |
| 11 | lines 283–325 | **NO** | Pre-generation count summary in `generateDocs` — unrelated feature |
| 12 | lines 312–358 | **yes** | `logout()` round-trips to the server to clear the HttpOnly cookie |

Answer `y` to 1–7 and 12; `n` to 8–11.

### `public/app.js` — 22 hunks

| Hunk | Around | Stage? | What it is |
| --- | --- | --- | --- |
| 1–4 | lines 28–57 | **yes** | `csrfToken()`; cookie-based auth check; server-side `logout()` |
| 5–20 | lines 672–770 | **NO** | Property autocomplete / manual-entry UI — unrelated feature |
| 21–22 | lines 948–951 | **yes** | `submitForm` sends cookies + `X-CSRF-Token` |

Answer `y` to 1–4 and 21–22; `n` to 5–20.

### `public/login.html` — review each hunk

All current hunks belong to containment (removed Google/GitHub buttons, the
`supabase-js` CDN tag, OAuth CSS, and the `localStorage` token writes). Step
through with `-p` anyway to confirm nothing unrelated has landed since.

## E. Explicitly EXCLUDE — do not stage

Modified but unrelated to containment:

```
.planning/ROADMAP.md
generate.js
templates/living_trust.html
templates/pour_over_will.html
```

Untracked and unrelated — agent scaffolding, scratch scripts and frozen work:

```
.agent/  .agents/  .ijfw/  .planning/phases/  scripts/  scratch/
.env.production
public/oauth-consent.html          <- frozen OAuth-server work, stays uncommitted
check-submissions.js
fix_address.py  fix_app_js.js  fix_html.js  fix_html2.js
fix_html_classes.js  fix_index_primary_trustee.js  fix_trustbot.py
modify_html.py  query_sub_tmp.js
render_living_trust_tmp.js  render_pow_tmp.js
schedule_a_repro.html
test-anon.js  test-hash.js  test-login-db.js  test-login.js  test-sub.js
test_auth.sh  test_fk.js  test_pdf.js  test_playwright.js
test_properties_repro.js  test_submit.js  test_submit.sh  test_submit2.js
test_vercel_api.js
```

`public/oauth-consent.html` is deliberately left on disk and unstaged. It is
frozen OAuth-server work, and `server.js` no longer routes to it.

## F. Verify before committing

```bash
git diff --cached --stat
git diff --cached -- public/admin.js public/app.js
```

The second command must show **only** cookie, CSRF and logout changes — no
`summarizeCounts`, no property-autocomplete edits. If either appears, unstage
and redo section D:

```bash
git restore --staged public/admin.js public/app.js
```

---

## Rollback — file-specific only

**Do not run `git checkout -- .` or `git restore .` in this repository.** It
would discard the unrelated in-progress work listed in section E, none of which
is committed anywhere.

Revert only the containment changes to tracked files:

```bash
git restore --source=HEAD -- auth.js
git restore --source=HEAD -- db.js
git restore --source=HEAD -- server.js
git restore --source=HEAD -- .env.example
git restore --source=HEAD -- package.json
git restore --source=HEAD -- package-lock.json
```

Revert only the containment hunks in the mixed files, keeping the feature work:

```bash
git restore -p --source=HEAD -- public/admin.js
git restore -p --source=HEAD -- public/app.js
git restore -p --source=HEAD -- public/login.html
```

Remove the files this change added:

```bash
rm -f test/auth-containment.test.js
rm -f test/server-routes.integration.test.js
rm -f DEPLOYMENT-CHECKLIST.md
rm -f STAGING-MANIFEST.md
rmdir test 2>/dev/null || true
```

Restore the deleted OAuth bridge only if it is genuinely wanted back — it was
never committed, so there is no git copy to restore and it would have to be
rewritten. It is intentionally gone.

Undo the dependency:

```bash
npm uninstall cookie-parser
```

If the change has already been committed, revert that commit rather than
restoring files individually:

```bash
git revert --no-commit <commit-sha>
```
