import { Router } from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAll, getById, create, update } from '../lib/hire-store.js';
import { createBondPaymentLink, refundBondPayment } from '../lib/square-client.js';
import { sendHireEmail } from '../lib/hire-mailer.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// GET /api/hires/health — flow health check (MUST be before /:id)
router.get('/health', (_req, res) => {
  const checks = {
    square: {
      environment: process.env.SQUARE_ENVIRONMENT || 'NOT SET',
      hasToken: Boolean(process.env.SQUARE_ACCESS_TOKEN),
      hasLocation: Boolean(process.env.SQUARE_LOCATION_ID),
      ok: Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID),
    },
    email: {
      user: process.env.GMAIL_USER || 'NOT SET',
      hasPassword: Boolean(process.env.GMAIL_APP_PASSWORD),
      ok: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    },
    telegram: {
      hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hasChatId: Boolean(process.env.TELEGRAM_JOSH_CHAT_ID),
      ok: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    },
    contracts: {
      baseUrl: process.env.BASE_URL || 'NOT SET',
      signingUrl: `${process.env.BASE_URL || ''}/api/contract/{hireId}/sign`,
      ok: Boolean(process.env.BASE_URL && !process.env.BASE_URL.includes('trycloudflare')),
    },
    webhooks: {
      squareWebhook: `${process.env.BASE_URL || ''}/api/square/webhook`,
      ok: Boolean(process.env.BASE_URL && !process.env.BASE_URL.includes('trycloudflare')),
    },
    data: {
      hiresFile: existsSync(join(__dirname, '..', '..', 'data', 'tnt-hires.json')),
      contractsDir: existsSync(join(__dirname, '..', '..', 'data', 'contracts')),
      ok: true,
    },
  };
  const allOk = Object.values(checks).every(c => c.ok);
  res.json({ ok: allOk, checks, timestamp: new Date().toISOString() });
});

// GET /api/hires — list all hires
router.get('/', (req, res) => {
  res.json({ hires: getAll() });
});

// GET /api/hires/:id — single hire
router.get('/:id', (req, res) => {
  const hire = getById(req.params.id);
  if (!hire) return res.status(404).json({ error: 'Hire not found' });
  res.json({ hire });
});

// PUT /api/hires/:id — update a hire
router.put('/:id', (req, res) => {
  const hire = getById(req.params.id);
  if (!hire) return res.status(404).json({ error: 'Hire not found' });
  const updated = update(hire.id, req.body);
  res.json({ hire: updated });
});

// POST /api/hires — lodge a new hire
router.post('/', async (req, res) => {
  try {
    const { orderNumber, customerName, customerEmail, customerPhone, eventDate } = req.body;
    if (!orderNumber || !customerName || !customerEmail || !eventDate) {
      return res.status(400).json({ error: 'Missing required fields: orderNumber, customerName, customerEmail, eventDate' });
    }

    const hire = create({ orderNumber, customerName, customerEmail, customerPhone, eventDate });

    // Send confirmation email
    try {
      await sendHireEmail('confirmation', hire);
      update(hire.id, { emailSent: true });
      hire.emailSent = true;
    } catch (emailErr) {
      console.error('[hires] Confirmation email failed:', emailErr.message);
    }

    // Create Square payment link for bond
    try {
      const link = await createBondPaymentLink(hire);
      update(hire.id, {
        bondPaymentUrl: link.url,
        bondPaymentLinkId: link.paymentLinkId,
      });
      hire.bondPaymentUrl = link.url;
      hire.bondPaymentLinkId = link.paymentLinkId;

      // Send bond payment link email
      await sendHireEmail('bond_link', hire, link.url);
    } catch (squareErr) {
      console.error('[hires] Square payment link failed:', squareErr.message);
    }

    res.json({ hire });
  } catch (err) {
    console.error('[hires] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/:id/send-confirmation — resend confirmation email
router.post('/:id/send-confirmation', async (req, res) => {
  try {
    const hire = getById(req.params.id);
    if (!hire) return res.status(404).json({ error: 'Hire not found' });

    await sendHireEmail('confirmation', hire);
    const updated = update(hire.id, { emailSent: true });
    res.json({ hire: updated });
  } catch (err) {
    console.error('[hires] Send confirmation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/:id/mark-bond-paid — manually mark bond as paid (Square terminal)
router.post('/:id/mark-bond-paid', async (req, res) => {
  const hire = getById(req.params.id);
  if (!hire) return res.status(404).json({ error: 'Hire not found' });

  const paymentId = req.body.paymentId || 'sq_terminal_' + Date.now().toString(36);
  const updated = update(hire.id, {
    status: 'bond_paid',
    bondStatus: 'paid',
    bondPaymentId: paymentId,
  });

  // Telegram notification — bond paid
  notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {});

  // Automatically trigger sending the contract when bond is paid
  try {
    await sendContractInternal(updated);
  } catch (contractErr) {
    console.error('[hires] Auto send contract after bond paid failed:', contractErr.message);
  }

  res.json({ hire: getById(hire.id) });
});

/**
 * Internal helper to generate signing URL, send contract email, and update hire.
 */
async function sendContractInternal(hire) {
  const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8787}`;
  const signingUrl = `${baseUrl}/api/contract/${hire.id}/sign`;

  await sendHireEmail('contract', hire, signingUrl);

  update(hire.id, {
    contractStatus: 'sent',
    status: hire.status === 'bond_paid' ? 'contract_sent' : hire.status,
  });

  console.log(`[hires] Contract sent for hire ${hire.id} — signing URL: ${signingUrl}`);
  return { signingUrl };
}

// POST /api/hires/:id/send-contract — send the contract signing email
router.post('/:id/send-contract', async (req, res) => {
  try {
    const hire = getById(req.params.id);
    if (!hire) return res.status(404).json({ error: 'Hire not found' });

    const result = await sendContractInternal(hire);
    res.json({ ok: true, hire: getById(hire.id), signingUrl: result.signingUrl });
  } catch (err) {
    console.error('[hires] Send contract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/:id/process-return — mark returned + refund or withhold + send email
router.post('/:id/process-return', async (req, res) => {
  try {
    const hire = getById(req.params.id);
    if (!hire) return res.status(404).json({ error: 'Hire not found' });

    const { decision } = req.body;
    if (!decision || !['refund', 'withhold'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "refund" or "withhold"' });
    }

    const updates = {
      status: decision === 'refund' ? 'returned' : 'withheld',
      bondOutcome: decision === 'refund' ? 'refunded' : 'withheld',
    };

    // Attempt Square refund if refunding and we have a real payment ID
    if (decision === 'refund' && hire.bondPaymentId && !hire.bondPaymentId.startsWith('sq_terminal_')) {
      try {
        const bondCents = (hire.kitQty || 1) >= 2 ? 40000 : 20000;
        const refund = await refundBondPayment(hire.bondPaymentId, bondCents);
        updates.refundId = refund.refundId;
        console.log(`[hires] Square refund processed: ${refund.refundId}`);
      } catch (refundErr) {
        console.error('[hires] Square refund failed (continuing):', refundErr.message);
      }
    }

    const updated = update(hire.id, updates);

    // Send appropriate email
    try {
      const emailType = decision === 'refund' ? 'refund' : 'withheld';
      await sendHireEmail(emailType, updated);
    } catch (emailErr) {
      console.error('[hires] Return email failed:', emailErr.message);
    }

    res.json({ hire: updated });
  } catch (err) {
    console.error('[hires] Process return error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/:id/send-bond-link — resend the Square payment link
router.post('/:id/send-bond-link', async (req, res) => {
  try {
    const hire = getById(req.params.id);
    if (!hire) return res.status(404).json({ error: 'Hire not found' });

    let url = hire.bondPaymentUrl;
    if (!url) {
      const link = await createBondPaymentLink(hire);
      update(hire.id, {
        bondPaymentUrl: link.url,
        bondPaymentLinkId: link.paymentLinkId,
      });
      url = link.url;
    }

    await sendHireEmail('bond_link', hire, url);
    res.json({ hire: getById(hire.id), paymentUrl: url });
  } catch (err) {
    console.error('[hires] Send bond link error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
