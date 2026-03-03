require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateTrustPackage } = require('./generate');
const { sendTrustPackage } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve the intake form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Download a previously generated PDF by session ID + filename
app.get('/download/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  // Sanitize — only allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-zA-Z0-9_\-.]+$/.test(filename)) {
    return res.status(400).send('Invalid request');
  }
  const filePath = path.join('/tmp', 'trustbot', sessionId, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found or expired. Please regenerate your documents.');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

// Generate PDFs from form data
app.post('/generate', async (req, res) => {
  try {
    const formData = req.body;
    console.log('[TrustBot] Generating trust package for:', formData.grantor_name);

    // Validate required fields
    const required = ['grantor_name', 'grantor_city', 'trust_name', 'successor_trustee_1_name'];
    for (const field of required) {
      if (!formData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    const { pdfBuffers, fileNames } = await generateTrustPackage(formData);

    // If email delivery requested
    if (formData.delivery_method === 'email' && formData.recipient_email) {
      await sendTrustPackage(formData.recipient_email, formData.grantor_name, pdfBuffers, fileNames);
      return res.json({
        success: true,
        message: `Trust package emailed to ${formData.recipient_email}`,
        files: fileNames.map(name => ({ name }))
      });
    }

    // Save PDFs to /tmp with a unique session ID and return proper download URLs
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const sessionDir = path.join('/tmp', 'trustbot', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const files = pdfBuffers.map((buf, i) => {
      const name = fileNames[i];
      fs.writeFileSync(path.join(sessionDir, name), buf);
      return { name, url: `/download/${sessionId}/${name}` };
    });

    // Auto-cleanup after 1 hour
    setTimeout(() => {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch { }
    }, 60 * 60 * 1000);

    res.json({ success: true, files });

  } catch (err) {
    console.error('[TrustBot] Error generating package:', err);
    res.status(500).json({ error: 'Failed to generate trust package: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏛️  TrustBot running at http://localhost:${PORT}\n`);
});
