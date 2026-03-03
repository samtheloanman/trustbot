require('dotenv').config();
const express = require('express');
const path = require('path');
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
        files: fileNames
      });
    }

    // Otherwise return the first PDF as a download (bundle later)
    // For now, return all as base64 for client-side download
    const files = pdfBuffers.map((buf, i) => ({
      name: fileNames[i],
      data: buf.toString('base64')
    }));

    res.json({ success: true, files });

  } catch (err) {
    console.error('[TrustBot] Error generating package:', err);
    res.status(500).json({ error: 'Failed to generate trust package: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏛️  TrustBot running at http://localhost:${PORT}\n`);
});
