require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Send the full trust package as email attachments
 * @param {string} toEmail - recipient email
 * @param {string} grantorName - for subject line personalization
 * @param {Buffer[]} pdfBuffers - array of PDF buffers
 * @param {string[]} fileNames - matching file names
 */
async function sendTrustPackage(toEmail, grantorName, pdfBuffers, fileNames) {
    const fromAddr = process.env.EMAIL_FROM || 'TrustBot <noreply@trustbot.local>';

    const attachments = pdfBuffers.map((buf, i) => ({
        filename: fileNames[i],
        content: buf,
        contentType: 'application/pdf',
    }));

    const info = await transporter.sendMail({
        from: fromAddr,
        to: toEmail,
        subject: `Your California Estate Planning Package — ${grantorName}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Your Estate Planning Documents Are Ready</h2>
        <p>Dear ${grantorName},</p>
        <p>Please find attached your complete California estate planning package, which includes:</p>
        <ul>
          <li><strong>Revocable Living Trust</strong> — The core trust instrument</li>
          <li><strong>Advance Healthcare Directive</strong> — Living Will + Healthcare POA</li>
          <li><strong>Durable Financial Power of Attorney</strong> — Financial decision authority</li>
          <li><strong>HIPAA Authorization</strong> — Medical records access for your agent</li>
          <li><strong>Pour-Over Will</strong> — Ensures all assets flow into your trust</li>
        </ul>
        <p><strong>⚠️ Important next steps:</strong></p>
        <ol>
          <li>Print each document</li>
          <li>Sign in the presence of a Notary Public</li>
          <li>For the Trust: have two witnesses sign as well</li>
          <li>Record the property deed transfer with your county recorder</li>
          <li>Store originals in a safe place and give copies to your successor trustee</li>
        </ol>
        <p style="color: #7f8c8d; font-size: 12px;">
          <em>These documents were generated for informational purposes. 
          We recommend having them reviewed by a licensed California estate planning attorney 
          before execution.</em>
        </p>
      </div>
    `,
        attachments,
    });

    console.log('[TrustBot] Email sent:', info.messageId);
    return info;
}

module.exports = { sendTrustPackage };
