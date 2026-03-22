import { Router } from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getById, update } from '../lib/hire-store.js';
import { generateContractPdf } from '../lib/contract-generator.js';
import { getHireDates } from '../lib/date-helpers.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(__dirname, '..', '..', 'data', 'contracts');

// Ensure contracts directory exists
mkdirSync(CONTRACTS_DIR, { recursive: true });

const router = Router();

/**
 * GET /api/contract/:hireId/sign
 * Serves a standalone HTML signing page (not React).
 */
router.get('/:hireId/sign', (req, res) => {
  const hire = getById(req.params.hireId);
  if (!hire) return res.status(404).send('Hire not found');

  const dates = getHireDates(hire.eventDate);
  const alreadySigned = hire.contractStatus === 'signed';
  const qty = hire.kitQty || 1;
  const bondAmount = qty >= 2 ? 400 : 200;
  const kitPrice = qty >= 2 ? '699.98' : '349.99';
  const mul = (base) => qty >= 2 ? base * 2 : base;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no, date=no, address=no">
  <title>TNT Kit Rental Agreement \u2014 ${hire.orderNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
      padding: 12px;
      -webkit-text-size-adjust: 100%;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      padding: 24px;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .brand {
      text-align: center;
      margin-bottom: 8px;
    }
    .brand img { width: 120px; height: auto; }
    .title-block {
      text-align: center;
      margin-bottom: 16px;
    }
    .title-block h1 {
      font-size: 14px;
      color: #222;
      margin-bottom: 2px;
      letter-spacing: 1px;
    }
    .title-block h2 {
      font-size: 24px;
      color: #E91E8C;
      font-weight: 800;
    }
    .pink-line {
      height: 3px;
      background: #E91E8C;
      margin: 12px 0 18px;
    }
    .details-grid {
      display: flex;
      gap: 16px;
      margin-bottom: 18px;
    }
    .details-grid .col { flex: 1; min-width: 0; }
    .details-grid .col-label {
      font-style: italic;
      color: #888;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .details-grid p {
      margin-bottom: 2px;
      font-size: 12px;
    }
    .details-grid .val {
      font-weight: 700;
      word-break: break-all;
    }
    .rental-grid {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
    }
    .rental-grid .col { flex: 1; min-width: 0; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #222;
      margin: 14px 0 4px;
    }
    .terms-list {
      padding-left: 0;
      list-style: none;
    }
    .terms-list li {
      font-size: 12px;
      margin-bottom: 5px;
      padding-left: 12px;
      position: relative;
    }
    .terms-list li::before {
      content: '\u2022';
      position: absolute;
      left: 0;
      color: #333;
    }
    .section-body {
      font-size: 12px;
      margin-bottom: 5px;
    }
    .sign-area {
      border-top: 2px solid #eee;
      padding-top: 20px;
      text-align: center;
      margin-top: 16px;
    }
    .sign-area label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .sign-area input[type="text"] {
      width: 100%;
      max-width: 320px;
      padding: 10px 14px;
      font-size: 16px;
      border: 2px solid #ddd;
      border-radius: 6px;
      text-align: center;
      outline: none;
    }
    .sign-area input[type="text"]:focus {
      border-color: #E91E8C;
    }
    .sign-area button {
      display: block;
      margin: 14px auto 0;
      padding: 12px 36px;
      font-size: 15px;
      font-weight: 600;
      background: #E91E8C;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .sign-area button:hover {
      background: #c71478;
    }
    .sign-area button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .signed-banner {
      background: #e8f5e9;
      border: 1px solid #a5d6a7;
      border-radius: 6px;
      padding: 14px;
      text-align: center;
      color: #2e7d32;
      font-weight: 600;
      font-size: 14px;
      margin-top: 16px;
    }
    .error-msg {
      color: #c62828;
      text-align: center;
      margin-top: 10px;
      display: none;
      font-size: 13px;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 11px;
      color: #999;
    }
    @media (max-width: 480px) {
      .container { padding: 16px; }
      .details-grid, .rental-grid { flex-direction: column; gap: 12px; }
      .title-block h2 { font-size: 20px; }
      .brand img { width: 100px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <img src="/company-logos/gri.jpg" alt="Gender Reveal Ideas" />
    </div>

    <div class="title-block">
      <h1>TNT KIT</h1>
      <h2>RENTAL AGREEMENT</h2>
    </div>

    <div class="pink-line"></div>

    <div class="details-grid">
      <div class="col">
        <div class="col-label">Prepared by:</div>
        <p>Business name</p>
        <p class="val">GENDER REVEAL IDEAS PTY LTD</p>
        <p>ABN</p>
        <p class="val">32 684 332 929 7</p>
        <p>Contact Email</p>
        <p class="val">hello@genderrevealideas.com.au</p>
      </div>
      <div class="col">
        <div class="col-label">Prepared for:</div>
        <p>Leaser Full Name</p>
        <p class="val">${hire.customerName}</p>
        <p>Phone number</p>
        <p class="val">${hire.customerPhone || 'N/A'}</p>
        <p>Contact Email</p>
        <p class="val">${hire.customerEmail || 'N/A'}</p>
        <p>Order</p>
        <p class="val">${hire.orderNumber}</p>
      </div>
    </div>

    <div class="pink-line"></div>

    <div class="rental-grid">
      <div class="col">
        <div class="section-title">Rental Item(s):</div>
        <ul class="terms-list">
          <li>${mul(1)} x TNT Box</li>
          <li>${mul(3)} x Extension Leads</li>
          <li>${mul(3)} x Pressure Cannons</li>
          <li>${mul(3)} x Pressure Cannon Power Cables</li>
        </ul>
      </div>
      <div class="col">
        <div class="section-title">Rental Term:</div>
        <ul class="terms-list">
          <li>Pick Up Date: ${dates.pickupFormatted}</li>
          <li>Return Date: ${dates.returnFormatted}</li>
          <li>to: 2 Monaco St \u2013 Surfers Paradise</li>
        </ul>
      </div>
    </div>

    <div class="section-title">Rental Fee:</div>
    <ul class="terms-list">
      <li>TNT Gender Reveal Kit${qty >= 2 ? ' (x2)' : ''}: $${kitPrice}</li>
      <li>Bond/Security Deposit: $${bondAmount.toFixed(2)} and a valid credit card to keep on file until returned in safe conditions (refundable upon safe return of the product in original condition)</li>
      <li>Every day after the due date of return will incur a $100.00 per day late fee.</li>
      <li>Standard hire duration: The item must be returned to the same location it was picked up from on the business day following the gender reveal. Late returns may incur additional fees.</li>
    </ul>

    <div class="section-title">Bond Terms:</div>
    <p class="section-body">The bond will be refunded within 10 business days of return, subject to inspection.</p>
    <p class="section-body">Deductions may apply for damage, uncleaned items, missing parts, or late returns. We kindly ask that all items are returned <strong>clean</strong> and in the same condition as received.</p>

    <div class="section-title">Renter Responsibilities:</div>
    <p class="section-body">Ensure the TNT unit is used in a safe, secure, and appropriate outdoor location. Do not attempt to disassemble, modify or tamper with any equipment. Do not leave the unit unattended. Return all components clean and in working condition.</p>

    <div class="section-title">Damage, Loss or Theft:</div>
    <p class="section-body">The Renter is fully responsible for the equipment during the rental period. Any damage, loss, or theft will result in full or partial forfeiture of the bond and/or additional charges.</p>

    <div class="section-title">Important Notice</div>
    <p class="section-body">This is self\u2011hire equipment. We do not accept any liability for assembly, set\u2011up, or any malfunctions that may occur during use. All equipment is tested and confirmed to be in full working order prior to collection. Any performance issues on the day of your event are not our responsibility. Please ensure you watch the provided instructional videos carefully and contact us with any questions before use.</p>
    <p class="section-body">The Renter acknowledges that they are using the equipment at their own risk and will take all safety precautions. By signing below, the Renter acknowledges and agrees to all the terms above.</p>

    <div class="section-title">Liability:</div>
    <p class="section-body">The Company is not liable for any injury, damage, or claims resulting from the misuse of the TNT kit.</p>

    <div class="section-title">Cancellations &amp; Refunds:</div>
    <p class="section-body">Any cancellations will not be refundable.</p>

    <div class="section-title">Cleaning &amp; Return Condition</div>
    <p class="section-body">All TNT equipment must be returned in the same clean condition it was provided. This means free from powder, residue, or debris of any kind. It is the client\u2019s responsibility to ensure the equipment is thoroughly cleaned before return.</p>
    <p class="section-body">If equipment is returned dirty, marked, or with powder still on or inside it, the cleaning costs will be deducted from the bond, and the bond may be fully retained at our discretion.</p>
    <p class="section-body">By hiring our TNT equipment, the client accepts full responsibility for returning it in a clean and proper condition.</p>

    <div class="sign-area">
      ${alreadySigned ? `
        <div class="signed-banner">
          This contract has been signed by ${hire.contractSignatureUrl ? hire.contractSignatureUrl.replace('typed:', '') : hire.customerName}
          on ${hire.contractSignedAt ? new Date(hire.contractSignedAt).toLocaleDateString('en-AU') : ''}
        </div>
      ` : `
        <label for="signature">Type your full name to sign this agreement</label>
        <input type="text" id="signature" placeholder="Your full name" autocomplete="name" />
        <p class="error-msg" id="errorMsg"></p>
        <button id="signBtn" onclick="submitSignature()">Sign Contract</button>
      `}
    </div>

    <div class="footer">
      <p>Gender Reveal Ideas PTY LTD | ABN 32 684 332 929 7 | hello@genderrevealideas.com.au</p>
    </div>
  </div>

  ${!alreadySigned ? `
  <script>
    async function submitSignature() {
      var sig = document.getElementById('signature').value.trim();
      var errEl = document.getElementById('errorMsg');
      var btn = document.getElementById('signBtn');

      if (!sig || sig.length < 2) {
        errEl.textContent = 'Please type your full name to sign.';
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting...';
      errEl.style.display = 'none';

      try {
        var res = await fetch('/api/contract/${hire.id}/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: sig })
        });
        var data = await res.json();
        if (data.ok) {
          document.querySelector('.sign-area').innerHTML =
            '<div class="signed-banner">Contract signed successfully. Thank you, ' + sig + '.</div>';
        } else {
          errEl.textContent = data.error || 'Something went wrong. Please try again.';
          errEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Sign Contract';
        }
      } catch (e) {
        errEl.textContent = 'Network error. Please check your connection and try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign Contract';
      }
    }
  </script>
  ` : ''}
</body>
</html>`;

  res.type('html').send(html);
});

/**
 * POST /api/contract/:hireId/sign
 * Accepts { signature } and records the signing.
 */
router.post('/:hireId/sign', async (req, res) => {
  const hire = getById(req.params.hireId);
  if (!hire) return res.status(404).json({ ok: false, error: 'Hire not found' });

  const { signature } = req.body;
  if (!signature || signature.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Signature is required (full name)' });
  }

  if (hire.contractStatus === 'signed') {
    return res.json({ ok: true, message: 'Contract already signed' });
  }

  const updated = update(hire.id, {
    contractStatus: 'signed',
    contractSignedAt: new Date().toISOString(),
    contractSignatureUrl: `typed:${signature.trim()}`,
    status: hire.status === 'contract_sent' ? 'contract_signed' : hire.status,
  });

  console.log(`[contract] Contract signed by ${signature.trim()} for hire ${hire.id}`);

  // Auto-save signed contract PDF to disk
  try {
    const pdfBuffer = await generateContractPdf(updated);
    const safeOrder = (hire.orderNumber || hire.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `TNT-Contract-${safeOrder}-${hire.id}.pdf`;
    writeFileSync(join(CONTRACTS_DIR, filename), pdfBuffer);
    update(hire.id, { contractPdfPath: filename });
    console.log(`[contract] Signed PDF saved: data/contracts/${filename}`);
  } catch (pdfErr) {
    console.error('[contract] Failed to save signed PDF:', pdfErr.message);
  }

  // Telegram notification — contract signed
  notifyTNTEvent('contract_signed', getById(hire.id)).catch(() => {});

  res.json({ ok: true, hire: getById(hire.id) });
});

/**
 * GET /api/contract/:hireId/pdf
 * Generates and returns the contract PDF.
 */
router.get('/:hireId/pdf', async (req, res) => {
  try {
    const hire = getById(req.params.hireId);
    if (!hire) return res.status(404).json({ error: 'Hire not found' });

    // Serve saved file if it exists, otherwise generate fresh
    if (hire.contractPdfPath && existsSync(join(CONTRACTS_DIR, hire.contractPdfPath))) {
      const filePath = join(CONTRACTS_DIR, hire.contractPdfPath);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${hire.contractPdfPath}"`,
      });
      return res.sendFile(filePath);
    }

    const pdfBuffer = await generateContractPdf(hire);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="TNT-Contract-${hire.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[contract] PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
