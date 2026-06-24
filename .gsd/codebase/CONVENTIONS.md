# TrustBot Code Conventions

## Language & Style
- **Language:** JavaScript (CommonJS — `require`/`module.exports`)
- **No TypeScript** — plain JS throughout
- **No linter** — no ESLint, Prettier, or pre-commit hooks configured
- **Async:** async/await throughout (no callbacks)
- **Error handling:** try/catch with `console.error()` logging + HTTP 500 responses

## File Organization
- Backend modules: root-level `.js` files (one concern per file)
- Frontend: all in `public/` (flat structure, no bundler)
- Templates: `templates/*.html` (Handlebars, one per PDF document)
- Env vars: `.env` (local), Vercel dashboard (production)

## Naming Conventions
- **Files:** `kebab-case.js` (server.js, auth.js, submissions.js)
- **Functions:** `camelCase` (generateTrustPackage, prepareData, seedAdmin)
- **DB columns:** `snake_case` in Supabase (profile_id, created_at, user_name)
- **JS objects:** camelCase keys internally, snake_case only when writing to DB
- **Form fields:** `snake_case` ids in HTML (grantor_name, successor_trustee_1_city)
- **CSS:** CSS custom properties with `--kebab-case` (--surface, --border, --text)

## Error Handling Patterns
```js
// Standard API route pattern:
app.post('/api/route', requireClient, async (req, res) => {
  try {
    const result = await doSomething(req.body);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[TrustBot][route] error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});
```

## Environment Variables
- Local: `.env` (gitignored)
- Production: Vercel dashboard → synced to Production + Preview + Development
- Pattern: `process.env.VAR_NAME || 'fallback'`
- ⚠️ JWT_SECRET and ADMIN_PASSWORD have insecure hardcoded fallbacks

## Git Workflow
- Single branch: `master`
- No PRs, no branch strategy
- Direct commits + push to origin
- Vercel auto-deploys on every push to `master`
