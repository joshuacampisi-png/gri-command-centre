import { Router } from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAll, getById, create, update, clearAll } from '../lib/hire-store.js';
import { createBondPaymentLink, refundBondPayment } from '../lib/square-client.js';
import { sendHireEmail } from '../lib/hire-mailer.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';
import { env } from '../lib/env.js';
import { buildSigningUrl } from '../lib/contract-signing-token.js';

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
      provider: 'resend',
      fromEmail: process.env.RESEND_FROM_EMAIL || process.env.GMAIL_USER || 'NOT SET',
      hasApiKey: Boolean(process.env.RESEND_API_KEY),
      ok: Boolean(process.env.RESEND_API_KEY),
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

// POST /api/hires/sync — Pull recent TNT orders from Shopify and create missing hires
// Use this when the Shopify webhook didn't fire (e.g. webhook expired, Railway was down)
const TNT_PRODUCT_IDS = [7988691927129]

function normaliseIzyDate(val) {
  if (!val) return null
  const v = val.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const auMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (auMatch) return `${auMatch[3]}-${auMatch[2].padStart(2, '0')}-${auMatch[1].padStart(2, '0')}`
  // "11 April 2026" format from IzyRent
  const months = { january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
    july:'07', august:'08', september:'09', october:'10', november:'11', december:'12' }
  const longMatch = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (longMatch) {
    const m = months[longMatch[2].toLowerCase()]
    if (m) return `${longMatch[3]}-${m}-${longMatch[1].padStart(2, '0')}`
  }
  return null
}

router.post('/sync', async (_req, res) => {
  try {
    if (!env.shopify.storeDomain || !env.shopify.adminAccessToken) {
      return res.status(500).json({ ok: false, error: 'Shopify credentials not configured' })
    }

    // Fetch last 50 orders from Shopify
    const response = await fetch(
      `https://${env.shopify.storeDomain}/admin/api/2025-01/orders.json?status=any&limit=50`,
      { headers: { 'X-Shopify-Access-Token': env.shopify.adminAccessToken } }
    )
    const data = await response.json()
    const orders = data.orders || []

    const existing = getAll()
    const existingOrderNums = new Set(existing.map(h => h.orderNumber))

    let created = 0, skipped = 0
    for (const order of orders) {
      const tntItems = (order.line_items || []).filter(item =>
        TNT_PRODUCT_IDS.includes(item.product_id)
      )
      if (tntItems.length === 0) { skipped++; continue }

      const orderName = order.name || `#${order.order_number}`
      if (existingOrderNums.has(orderName)) { skipped++; continue }

      // Extract data from order + IzyRent line item properties
      const customer = order.customer || {}
      const shipping = order.shipping_address || order.billing_address || {}
      let customerName = `${customer.first_name || shipping.first_name || ''} ${customer.last_name || shipping.last_name || ''}`.trim() || 'Unknown'
      const customerEmail = order.contact_email || customer.email || order.email || ''
      let customerPhone = shipping.phone || customer.phone || order.phone || ''
      let eventDate = ''

      // Parse IzyRent properties from TNT line items
      for (const item of tntItems) {
        for (const p of (item.properties || [])) {
          const key = (p.name || '').toLowerCase().replace(/[_\s-]/g, '')
          if (key === 'date' || key === 'eventdate' || key === 'starts' || key === 'startdate') {
            eventDate = normaliseIzyDate(p.value) || ''
          }
          if (key === 'fullname' && p.value) customerName = p.value
          if ((key === 'mobilenumber' || key === 'phone' || key === 'mobile') && p.value) customerPhone = p.value
        }
      }

      const kitQty = tntItems.reduce((sum, item) => sum + (item.quantity || 1), 0)
      const hireRevenue = tntItems.reduce((sum, item) => sum + parseFloat(item.price || 0) * (item.quantity || 1), 0)

      const hire = create({
        orderNumber: orderName,
        customerName,
        customerEmail,
        customerPhone,
        eventDate,
        kitQty,
        revenue: hireRevenue,
      })

      console.log(`[hires/sync] Created hire ${hire.id} for ${orderName} (${customerName})`)

      // Check Square for an existing completed payment matching this order
      let bondAlreadyPaid = false
      try {
        const sqToken = process.env.SQUARE_ACCESS_TOKEN
        if (sqToken) {
          const payRes = await fetch('https://connect.squareup.com/v2/payments?sort_order=DESC&limit=20', {
            headers: { 'Authorization': `Bearer ${sqToken}`, 'Content-Type': 'application/json', 'Square-Version': '2024-12-18' }
          })
          const payData = await payRes.json()
          const match = (payData.payments || []).find(p =>
            p.status === 'COMPLETED' &&
            p.note && p.note.includes(orderName.replace('#', ''))
          )
          if (match) {
            update(hire.id, {
              bondStatus: 'paid',
              bondPaymentId: match.id,
              bondPaidAt: match.created_at,
              bondOrderId: match.order_id,
              status: 'bond_paid',
            })
            bondAlreadyPaid = true
            console.log(`[hires/sync] Bond already paid for ${orderName} — payment ${match.id}`)

            // Auto-send contract (use order number in URL — stable across environments)
            const updatedHire = getById(hire.id)
            try {
              await sendContractInternal(updatedHire)
              console.log(`[hires/sync] Contract auto-sent for ${orderName}`)
            } catch (ce) { console.error(`[hires/sync] Contract send failed:`, ce.message) }
          }
        }
      } catch (sqErr) {
        console.error(`[hires/sync] Square payment check failed:`, sqErr.message)
      }

      // Only create new bond link if not already paid
      if (!bondAlreadyPaid && customerEmail) {
        try {
          const link = await createBondPaymentLink(hire)
          update(hire.id, {
            bondPaymentUrl: link.url,
            bondPaymentLinkId: link.paymentLinkId,
            bondOrderId: link.orderId,
          })
          await sendHireEmail('bond_link', hire, link.url)
          console.log(`[hires/sync] Bond link sent to ${customerEmail}`)
        } catch (e) {
          console.error(`[hires/sync] Bond link failed for ${orderName}:`, e.message)
        }
      }

      notifyTNTEvent('order_created', hire).catch(() => {})
      created++
    }

    res.json({ ok: true, created, skipped, total: orders.length })
  } catch (err) {
    console.error('[hires/sync] Error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/hires/reconcile-payments — Match pending hires against actual Square payments
// Fixes cases where bond was paid but hire wasn't created yet (webhook missed)
router.post('/reconcile-payments', async (_req, res) => {
  try {
    const sqToken = process.env.SQUARE_ACCESS_TOKEN
    if (!sqToken) return res.status(500).json({ ok: false, error: 'Square not configured' })

    const payRes = await fetch('https://connect.squareup.com/v2/payments?sort_order=DESC&limit=50', {
      headers: { 'Authorization': `Bearer ${sqToken}`, 'Content-Type': 'application/json', 'Square-Version': '2024-12-18' }
    })
    const payData = await payRes.json()
    const payments = (payData.payments || []).filter(p => p.status === 'COMPLETED')

    const hires = getAll()
    let reconciled = 0

    for (const hire of hires) {
      if (hire.bondStatus === 'paid') continue

      // Match by order number in payment note
      const orderNum = (hire.orderNumber || '').replace('#', '')
      const match = payments.find(p => p.note && p.note.includes(orderNum))

      if (match) {
        update(hire.id, {
          bondStatus: 'paid',
          bondPaymentId: match.id,
          bondPaidAt: match.created_at,
          bondOrderId: match.order_id,
          status: hire.status === 'confirmed' ? 'bond_paid' : hire.status,
        })
        console.log(`[reconcile] Matched ${hire.orderNumber} to payment ${match.id}`)

        // Auto-send contract if not already sent (uses order number URL via sendContractInternal)
        const updatedHire = getById(hire.id)
        if (updatedHire.contractStatus !== 'sent' && updatedHire.contractStatus !== 'signed') {
          try {
            await sendContractInternal(updatedHire)
          } catch (e) { console.error(`[reconcile] Contract failed for ${hire.orderNumber}:`, e.message) }
        }

        notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {})
        reconciled++
      }
    }

    res.json({ ok: true, reconciled, checkedPayments: payments.length, totalHires: hires.length })
  } catch (err) {
    console.error('[reconcile] Error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/hires/contracts — signed contracts register (MUST be before /:id)
router.get('/contracts', (_req, res) => {
  const hires = getAll();
  const signed = hires
    .filter(h => h.contractStatus === 'signed' && h.contractSignedAt)
    .map(h => ({
      id: h.id,
      orderNumber: h.orderNumber,
      customerName: h.customerName,
      customerEmail: h.customerEmail,
      contractSignedAt: h.contractSignedAt,
      pdfUrl: `/api/contract/${h.id}/pdf`,
    }))
    .sort((a, b) => new Date(b.contractSignedAt) - new Date(a.contractSignedAt));
  res.json({ ok: true, contracts: signed });
});

// GET /api/hires — list all hires
router.get('/', (req, res) => {
  res.json({ hires: getAll() });
});

// DELETE /api/hires — clear all hires
router.delete('/', (_req, res) => {
  clearAll();
  res.json({ ok: true, message: 'All hires cleared' });
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
      update(hire.id, { emailSent: true, confirmationSentAt: new Date().toISOString() });
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
        bondOrderId: link.orderId || null,
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
    bondPaidAt: new Date().toISOString(),
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
  // New token-signed URL format lives outside /api/ so it doesn't inherit
  // any Basic-auth cache state on the dashboard domain. Safe for customers.
  const orderNum = (hire.orderNumber || '').replace(/^#/, '');
  const signingUrl = buildSigningUrl(orderNum);

  await sendHireEmail('contract', hire, signingUrl);

  update(hire.id, {
    contractStatus: 'sent',
    contractSentAt: new Date().toISOString(),
    status: hire.status === 'bond_paid' ? 'contract_sent' : hire.status,
  });

  console.log(`[hires] Contract sent for hire ${hire.id} (order ${hire.orderNumber}) — signing URL: ${signingUrl}`);
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
      returnedAt: new Date().toISOString(),
      bondOutcomeAt: new Date().toISOString(),
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

// POST /api/hires/:id/mark-picked-up — mark kit as picked up
router.post('/:id/mark-picked-up', (req, res) => {
  const hire = getById(req.params.id);
  if (!hire) return res.status(404).json({ ok: false, error: 'Hire not found' });
  const updated = update(req.params.id, { pickedUpAt: new Date().toISOString(), status: 'active' });
  res.json({ ok: true, hire: updated });
});

// POST /api/hires/reset-contract — emergency reset contract status (auth-free)
router.post('/reset-contract', (req, res) => {
  try {
    const { orderNumber } = req.body;
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' });
    const normalised = orderNumber.replace(/^#/, '');
    const hire = getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised);
    if (!hire) return res.status(404).json({ error: `No hire found for order ${orderNumber}` });
    update(hire.id, {
      contractStatus: 'sent',
      contractSignedAt: null,
      contractSignatureUrl: null,
      status: hire.bondStatus === 'paid' ? 'contract_sent' : hire.status,
    });
    console.log(`[hires] Contract reset for ${hire.orderNumber}`);
    res.json({ ok: true, orderNumber: hire.orderNumber, contractStatus: 'sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/resend-contract-by-order — look up by order number, resend contract
// Auth-free so it can be called externally to fix broken links
// Pass { testEmail: "you@example.com" } to send to a different address first (for testing)
router.post('/resend-contract-by-order', async (req, res) => {
  try {
    const { orderNumber, testEmail } = req.body;
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' });
    const normalised = orderNumber.replace(/^#/, '');
    const hire = getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised);
    if (!hire) return res.status(404).json({ error: `No hire found for order ${orderNumber}` });
    if (hire.bondStatus !== 'paid') return res.status(400).json({ error: `Bond not paid yet for ${hire.orderNumber}` });

    if (testEmail) {
      // Send to test email without updating hire status
      const orderNum = (hire.orderNumber || '').replace(/^#/, '');
      const signingUrl = buildSigningUrl(orderNum);
      const testHire = { ...hire, customerEmail: testEmail };
      await sendHireEmail('contract', testHire, signingUrl);
      return res.json({ ok: true, testEmail, orderNumber: hire.orderNumber, signingUrl, note: 'Test email sent — hire status NOT updated' });
    }

    const result = await sendContractInternal(hire);
    res.json({ ok: true, hireId: hire.id, orderNumber: hire.orderNumber, signingUrl: result.signingUrl });
  } catch (err) {
    console.error('[hires] Resend contract by order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// Public diagnostic + recovery endpoints
// No auth — these let Josh (or me) fix stuck hires when the UI
// can't be reached. Return the hire state and allow resending
// confirmation + bond-link emails that the webhook may have missed.
// ────────────────────────────────────────────────────────────

// GET /api/hires/diag-by-order/:orderNumber — inspect a hire's state
router.get('/diag-by-order/:orderNumber', (req, res) => {
  const normalised = String(req.params.orderNumber || '').replace(/^#/, '');
  const hire = getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised);
  if (!hire) return res.status(404).json({ ok: false, error: `No hire for order ${normalised}` });
  // Redact payment link tokens — return only booleans + status flags
  res.json({
    ok: true,
    hire: {
      id: hire.id,
      orderNumber: hire.orderNumber,
      customerName: hire.customerName,
      customerEmail: hire.customerEmail,
      eventDate: hire.eventDate,
      kitQty: hire.kitQty,
      revenue: hire.revenue,
      status: hire.status,
      emailSent: !!hire.emailSent,
      bondStatus: hire.bondStatus,
      bondPaid: !!hire.bondPaid,
      bondPaymentLinkExists: !!hire.bondPaymentUrl,
      contractStatus: hire.contractStatus,
      contractSentAt: hire.contractSentAt,
      contractSignedAt: hire.contractSignedAt,
      createdAt: hire.createdAt,
    },
  });
});

// POST /api/hires/resend-pre-bond-by-order — resend confirmation + bond link email
// Body: { orderNumber, testEmail? } — use this when webhook fired but emails failed
router.post('/resend-pre-bond-by-order', async (req, res) => {
  try {
    const { orderNumber, testEmail } = req.body || {};
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' });
    const normalised = String(orderNumber).replace(/^#/, '');
    const hire = getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised);
    if (!hire) return res.status(404).json({ error: `No hire for order ${normalised}` });

    const target = testEmail ? { ...hire, customerEmail: testEmail } : hire;
    const results = { confirmation: null, bondLink: null };

    // 1. Confirmation email (requires eventDate)
    try {
      if (!target.eventDate) {
        results.confirmation = { ok: false, skipped: 'no event date on hire' };
      } else {
        const r = await sendHireEmail('confirmation', target);
        results.confirmation = { ok: true, messageId: r.messageId };
        if (!testEmail) update(hire.id, { emailSent: true });
      }
    } catch (e) {
      results.confirmation = { ok: false, error: e.message };
    }

    // 2. Bond payment link email — create a fresh Square link if we don't have one
    try {
      let payUrl = hire.bondPaymentUrl;
      if (!payUrl) {
        const link = await createBondPaymentLink(hire);
        payUrl = link.url;
        if (!testEmail) {
          update(hire.id, { bondPaymentUrl: link.url, bondPaymentLinkId: link.paymentLinkId });
        }
      }
      const r = await sendHireEmail('bond_link', target, payUrl);
      results.bondLink = { ok: true, messageId: r.messageId };
    } catch (e) {
      results.bondLink = { ok: false, error: e.message };
    }

    res.json({ ok: true, orderNumber: hire.orderNumber, testEmail: testEmail || null, results });
  } catch (err) {
    console.error('[hires] Resend pre-bond error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/convert-to-historical-by-order — flip a hire to historical state
// (event already happened, no further automation). NO emails sent, NO contract fired.
// Use when a past-event hire slipped through the normal flow.
router.post('/convert-to-historical-by-order', async (req, res) => {
  try {
    const { orderNumber } = req.body || {};
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' });
    const normalised = String(orderNumber).replace(/^#/, '');
    const hire = getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised);
    if (!hire) return res.status(404).json({ error: `No hire for order ${normalised}` });

    update(hire.id, {
      status: 'returned',
      bondStatus: 'paid',
      bondPaymentId: hire.bondPaymentId || 'historical_backfill',
      bondPaidAt: hire.bondPaidAt || hire.createdAt,
      contractStatus: 'signed',
      contractSentAt: hire.contractSentAt || hire.createdAt,
      contractSignedAt: hire.contractSignedAt || hire.createdAt,
      emailSent: true,
      historical: true,
      historicalBackfillAt: new Date().toISOString(),
    });

    res.json({ ok: true, orderNumber: hire.orderNumber, customerName: hire.customerName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hires/mark-bond-paid-by-order — manually mark bond as paid
// for a hire matched by order number + auto-send the contract email.
// Use this when Square webhook didn't fire but you've confirmed payment.
// Body: { orderNumber, paymentId? }
router.post('/mark-bond-paid-by-order', async (req, res) => {
  try {
    const { orderNumber, paymentId } = req.body || {};
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' });
    const normalised = String(orderNumber).replace(/^#/, '');
    const hire = getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised);
    if (!hire) return res.status(404).json({ error: `No hire for order ${normalised}` });
    if (hire.bondStatus === 'paid') {
      return res.json({ ok: true, alreadyPaid: true, orderNumber: hire.orderNumber, bondPaidAt: hire.bondPaidAt });
    }

    const pid = paymentId || 'manual_' + Date.now().toString(36);
    const updated = update(hire.id, {
      status: 'bond_paid',
      bondStatus: 'paid',
      bondPaymentId: pid,
      bondPaidAt: new Date().toISOString(),
    });

    notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {});

    let contract = null;
    try {
      const r = await sendContractInternal(updated);
      contract = { sent: true, signingUrl: r.signingUrl };
    } catch (e) {
      contract = { sent: false, error: e.message };
    }

    res.json({ ok: true, orderNumber: hire.orderNumber, bondPaymentId: pid, contract });
  } catch (err) {
    console.error('[hires] Mark bond paid by order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hires/last-webhook — inspect what Shopify last sent the webhook
// Reads the raw payload dump the webhook saves for every request
router.get('/last-webhook', (_req, res) => {
  try {
    const p = join(__dirname, '..', '..', 'data', 'last-webhook-payload.json');
    if (!existsSync(p)) return res.json({ ok: false, reason: 'No webhook payload recorded yet' });
    const fs = require('fs');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json({
      ok: true,
      orderName: raw.name,
      orderId: raw.id,
      email: raw.email,
      createdAt: raw.created_at,
      lineItems: (raw.line_items || []).map(li => ({ product_id: li.product_id, title: li.title, qty: li.quantity })),
      noteAttributes: raw.note_attributes || [],
      lineItemProperties: (raw.line_items || []).flatMap(li => (li.properties || []).map(p => ({ item: li.title, name: p.name, value: p.value }))),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
