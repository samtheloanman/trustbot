require('dotenv').config();
const express = require('express');
const path = require('path');
const { generateTrustPackage } = require('./generate');
const { sendTrustPackage } = require('./email');
const { mountAuthRoutes, requireAdmin, requireClient } = require('./auth');
const submissions = require('./submissions');
const { supabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
        
        const { data } = supabase.storage
            .from('trustbot-docs')
            .getPublicUrl(storagePath);
            
        // We use the local route so it looks the same to the frontend, 
        // but it will redirect to the public URL. Or we can just return the public URL directly.
        // Returning local route so we don't need to change frontend.
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
    console.error('[TrustBot] Generation error:', err);
    res.status(500).json({ error: 'Failed to generate: ' + err.message });
  }
});

// ── Admin: download generated PDF ────────────────────────────
app.get('/api/admin/submissions/:id/download/:filename', requireAdmin, (req, res) => {
  const { id, filename } = req.params;
  const { data } = supabase.storage.from('trustbot-docs').getPublicUrl(`${id}/${filename}`);
  res.redirect(data.publicUrl);
});

// ── Legacy: direct generation — public access for testing/demos ────────────────
// Clients use /api/submissions for the main flow.
// Admins trigger generation via /api/admin/submissions/:id/generate.
// This route is public to allow demo document generation without logging in.
app.post('/generate', async (req, res) => {
  const tag = `[/generate ${req.user?.email ?? 'unknown'}]`;
  try {
    const formData = req.body;
    console.log(tag, 'Starting PDF generation for:', formData.grantor_name);

    const required = ['grantor_name', 'grantor_city', 'trust_name', 'successor_trustee_1_name'];
    for (const field of required) {
      if (!formData[field]) {
        console.warn(tag, 'Missing required field:', field);
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    console.log(tag, 'Launching Chromium for PDF rendering...');
    const t0 = Date.now();
    const { pdfBuffers, fileNames } = await generateTrustPackage(formData);
    console.log(tag, `PDFs generated in ${Date.now() - t0}ms — ${fileNames.length} docs`);

    if (formData.delivery_method === 'email' && formData.recipient_email) {
      await sendTrustPackage(formData.recipient_email, formData.grantor_name, pdfBuffers, fileNames);
      console.log(tag, 'Emailed to:', formData.recipient_email);
      return res.json({
        success: true,
        message: `Trust package emailed to ${formData.recipient_email}`,
        files: fileNames.map(name => ({ name }))
      });
    }

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const files = [];

    for (let i = 0; i < pdfBuffers.length; i++) {
        const buf = pdfBuffers[i];
        const name = fileNames[i];
        const storagePath = `legacy/${sessionId}/${name}`;

        const { error } = await supabase.storage
            .from('trustbot-docs')
            .upload(storagePath, buf, { contentType: 'application/pdf', upsert: true });

        if (error) {
          console.error(tag, 'Storage upload failed for', name, ':', error.message);
          throw new Error('Upload failed: ' + error.message);
        }

        const { data } = supabase.storage.from('trustbot-docs').getPublicUrl(storagePath);
        files.push({ name, url: `/download/${sessionId}/${name}` });
    }

    console.log(tag, 'Done. Files:', files.map(f => f.name).join(', '));
    res.json({ success: true, files });
  } catch (err) {
    console.error(tag, 'FATAL ERROR:', err.message, '\nStack:', err.stack);
    res.status(500).json({ error: 'Failed to generate trust package: ' + err.message });
  }
});

// Legacy download route
app.get('/download/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  const { data } = supabase.storage.from('trustbot-docs').getPublicUrl(`legacy/${sessionId}/${filename}`);
  res.redirect(data.publicUrl);
});

// ── Start server (only if run directly) ────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🏛️  TrustBot running at http://localhost:${PORT}\n`);
  });
}

// Export the Express app for Vercel
module.exports = app;
