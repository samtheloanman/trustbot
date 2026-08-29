require('dotenv').config();
const express = require('express');
const path = require('path');
const { generateTrustPackage } = require('./generate');
const { sendTrustPackage } = require('./email');
const cookieParser = require('cookie-parser');
const { mountAuthRoutes, requireAdmin, requireClient, csrfProtection } = require('./auth');
const submissions = require('./submissions');
const { supabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Required before csrfProtection and verifyToken -- both read req.cookies.
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Applies to every state-changing request. Must be mounted before the routes it
// protects, including the auth routes below.
app.use(csrfProtection);

// ── Auth routes ──────────────────────────────────────────────
mountAuthRoutes(app);

// ── Config route ───────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  });
});

// ── Pages ────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Favicon (suppress 404 noise) ─────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── Client: submit form data ────────────────────────────────
app.post('/api/submissions', requireClient, async (req, res) => {
  try {
    const sub = await submissions.create(req.user.id, req.user.name, req.user.email, req.body);
    console.log('[TrustBot] New submission from:', req.user.email, '→', sub.id);
    res.json({ success: true, submission: { id: sub.id, status: sub.status, createdAt: sub.createdAt } });
  } catch (err) {
    console.error('[TrustBot] Submission error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// ── Client: view own submissions ─────────────────────────────
app.get('/api/submissions', requireClient, async (req, res) => {
  const subs = await submissions.listByUser(req.user.id);
  res.json({ submissions: subs.map(s => ({ id: s.id, status: s.status, createdAt: s.createdAt, grantorName: s.data.grantor_name })) });
});

// ── Admin: list all submissions ──────────────────────────────
app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
  const subs = await submissions.list();
  res.json({ submissions: subs });
});

// ── Admin: view one submission ───────────────────────────────
app.get('/api/admin/submissions/:id', requireAdmin, async (req, res) => {
  const sub = await submissions.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  res.json({ submission: sub });
});

// ── Admin: update submission data ────────────────────────────
app.put('/api/admin/submissions/:id', requireAdmin, async (req, res) => {
  const sub = await submissions.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const updates = {};
  if (req.body.data) updates.data = { ...sub.data, ...req.body.data };
  if (req.body.status) updates.status = req.body.status;
  const updated = await submissions.update(req.params.id, updates);
  res.json({ success: true, submission: updated });
});

// ── Admin: delete submission ─────────────────────────────────
app.delete('/api/admin/submissions/:id', requireAdmin, async (req, res) => {
  const removed = await submissions.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Submission not found' });
  res.json({ success: true });
});

// ── Admin: generate documents for a submission ───────────────
app.post('/api/admin/submissions/:id/generate', requireAdmin, async (req, res) => {
  try {
    const sub = await submissions.getById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    console.log('[TrustBot] Admin generating docs for submission:', sub.id);
    const { pdfBuffers, fileNames } = await generateTrustPackage(sub.data);

    const sessionId = sub.id;
    const files = [];

    for (let i = 0; i < pdfBuffers.length; i++) {
        const buf = pdfBuffers[i];
        const name = fileNames[i];
        const storagePath = `${sessionId}/${name}`;
        
        const { error } = await supabase.storage
            .from('trustbot-docs')
            .upload(storagePath, buf, {
                contentType: 'application/pdf',
                upsert: true
            });
            
        if (error) throw new Error('Upload failed: ' + error.message);

        // Hand back only the guarded local route. Previously a public storage
        // URL was also minted here; it is gone because the download route now
        // signs a short-lived URL at request time, behind requireAdmin.
        files.push({ name, url: `/api/admin/submissions/${sub.id}/download/${name}` });
    }

    // Update submission status
    await submissions.update(sub.id, { status: 'completed', generatedFiles: files });

    // Email if requested
    if (req.body?.sendEmail && sub.data.recipient_email) {
      await sendTrustPackage(sub.data.recipient_email, sub.data.grantor_name, pdfBuffers, fileNames);
    }

    res.json({ success: true, files });
  } catch (err) {
    // Log detail server-side; return a generic message. Interpolating err.message
    // leaked storage paths, upstream API errors and internal state to the client.
    console.error('[TrustBot] Generation error:', err);
    res.status(500).json({ error: 'Failed to generate documents' });
  }
});

// ── Admin: download generated PDF ────────────────────────────
app.get('/api/admin/submissions/:id/download/:filename', requireAdmin, async (req, res) => {
  const { id, filename } = req.params;

  // Signed, not public. getPublicUrl() returns an unauthenticated URL, so the
  // requireAdmin check above only guarded the redirect -- the document itself
  // stayed readable to anyone holding or guessing the path, and those URLs were
  // previously handed to the browser and could be copied out of history or
  // shared. A short-lived signed URL makes the access check actually bind to
  // the object. Requires the 'trustbot-docs' bucket to be private; if it is
  // still public, flipping it is part of the deployment prerequisites.
  const { data, error } = await supabase.storage
    .from('trustbot-docs')
    .createSignedUrl(`${id}/${filename}`, 60);

  if (error || !data?.signedUrl) {
    console.error('[TrustBot] Signed URL error:', error);
    return res.status(404).json({ error: 'Document not available' });
  }

  res.redirect(data.signedUrl);
});

// ── Removed: legacy public POST /generate and GET /download ───────────────────
//
// Both were unauthenticated on a legal-document system and are deleted rather
// than gated, because neither had a caller left: the client flow goes through
// POST /api/submissions and admin generation through
// POST /api/admin/submissions/:id/generate.
//
// What they exposed while public:
//   - Anyone could generate a full trust package and have it emailed to any
//     address they supplied, making the service an open relay for
//     authentic-looking legal documents sent from this domain.
//   - Each call launched headless Chromium, so unauthenticated traffic could
//     exhaust server resources.
//   - Documents were written to storage and rows inserted as 'anonymous'.
//   - GET /download/:sessionId/:filename redirected to a storage URL keyed only
//     by a timestamp plus five random characters, with no ownership check.
//
// If a public demo is wanted later it belongs in a separate deployment with
// its own storage bucket, not on the instance holding real client documents.

// ── Start server (only if run directly) ────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🏛️  TrustBot running at http://localhost:${PORT}\n`);
  });
}

// Export the Express app for Vercel
module.exports = app;
