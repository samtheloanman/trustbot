require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateTrustPackage } = require('./generate');
const { sendTrustPackage } = require('./email');
const { mountAuthRoutes, requireAdmin, requireClient } = require('./auth');
const submissions = require('./submissions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ──────────────────────────────────────────────
mountAuthRoutes(app);

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

// ── Client: submit form data ────────────────────────────────
app.post('/api/submissions', requireClient, (req, res) => {
  try {
    const sub = submissions.create(req.user.id, req.user.name, req.user.email, req.body);
    console.log('[TrustBot] New submission from:', req.user.email, '→', sub.id);
    res.json({ success: true, submission: { id: sub.id, status: sub.status, createdAt: sub.createdAt } });
  } catch (err) {
    console.error('[TrustBot] Submission error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// ── Client: view own submissions ─────────────────────────────
app.get('/api/submissions', requireClient, (req, res) => {
  const subs = submissions.listByUser(req.user.id);
  res.json({ submissions: subs.map(s => ({ id: s.id, status: s.status, createdAt: s.createdAt, grantorName: s.data.grantor_name })) });
});

// ── Admin: list all submissions ──────────────────────────────
app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const subs = submissions.list();
  res.json({ submissions: subs });
});

// ── Admin: view one submission ───────────────────────────────
app.get('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const sub = submissions.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  res.json({ submission: sub });
});

// ── Admin: update submission data ────────────────────────────
app.put('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const sub = submissions.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const updates = {};
  if (req.body.data) updates.data = { ...sub.data, ...req.body.data };
  if (req.body.status) updates.status = req.body.status;
  const updated = submissions.update(req.params.id, updates);
  res.json({ success: true, submission: updated });
});

// ── Admin: delete submission ─────────────────────────────────
app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const removed = submissions.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Submission not found' });
  res.json({ success: true });
});

// ── Admin: generate documents for a submission ───────────────
app.post('/api/admin/submissions/:id/generate', requireAdmin, async (req, res) => {
  try {
    const sub = submissions.getById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    console.log('[TrustBot] Admin generating docs for submission:', sub.id);
    const { pdfBuffers, fileNames } = await generateTrustPackage(sub.data);

    // Save PDFs with session ID
    const sessionId = sub.id;
    const sessionDir = path.join('/tmp', 'trustbot', 'docs', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const files = pdfBuffers.map((buf, i) => {
      const name = fileNames[i];
      fs.writeFileSync(path.join(sessionDir, name), buf);
      return { name, url: `/api/admin/submissions/${sub.id}/download/${name}` };
    });

    // Update submission status
    submissions.update(sub.id, { status: 'completed', generatedFiles: files });

    // Email if requested
    if (req.body.sendEmail && sub.data.recipient_email) {
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
  if (!/^[a-zA-Z0-9_\-.]+$/.test(filename)) return res.status(400).send('Invalid filename');

  const filePath = path.join('/tmp', 'trustbot', 'docs', id, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found. Regenerate documents.');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

// ── Legacy: direct generation (still available if needed) ────
app.post('/generate', async (req, res) => {
  try {
    const formData = req.body;
    console.log('[TrustBot] Generating trust package for:', formData.grantor_name);

    const required = ['grantor_name', 'grantor_city', 'trust_name', 'successor_trustee_1_name'];
    for (const field of required) {
      if (!formData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    const { pdfBuffers, fileNames } = await generateTrustPackage(formData);

    if (formData.delivery_method === 'email' && formData.recipient_email) {
      await sendTrustPackage(formData.recipient_email, formData.grantor_name, pdfBuffers, fileNames);
      return res.json({
        success: true,
        message: `Trust package emailed to ${formData.recipient_email}`,
        files: fileNames.map(name => ({ name }))
      });
    }

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const sessionDir = path.join('/tmp', 'trustbot', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const files = pdfBuffers.map((buf, i) => {
      const name = fileNames[i];
      fs.writeFileSync(path.join(sessionDir, name), buf);
      return { name, url: `/download/${sessionId}/${name}` };
    });

    setTimeout(() => {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch { }
    }, 60 * 60 * 1000);

    res.json({ success: true, files });
  } catch (err) {
    console.error('[TrustBot] Error generating package:', err);
    res.status(500).json({ error: 'Failed to generate trust package: ' + err.message });
  }
});

// Legacy download route
app.get('/download/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-zA-Z0-9_\-.]+$/.test(filename)) {
    return res.status(400).send('Invalid request');
  }
  const filePath = path.join('/tmp', 'trustbot', sessionId, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found or expired.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`\n🏛️  TrustBot running at http://localhost:${PORT}\n`);
});
