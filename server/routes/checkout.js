/**
 * routes/checkout.js
 *
 * Custom Square Web Payments SDK checkout that REPLACES the hosted
 * Quick Pay link for both TNT and Balloon hires. Card is tokenised in
 * an iframe by Square (SAQ-A PCI), saved to a Square Customer record,
 * then the bond is charged using the saved card_id. Because the card
 * is on file, we can later charge any additional amount (damage / late
 * fees / re-bookings) via /:type/:id/charge.
 *
 * Customer-facing URLs (HMAC-signed, no auth):
 *   GET  /checkout/:type/:orderNumber/:token  → renders the card form
 *   POST /checkout/:type/:orderNumber/:token  → tokenises + charges bond
 *
 * type = 'tnt' | 'balloon'
 */
import { Router } from 'express'
import { verifyOrderToken } from '../lib/contract-signing-token.js'
import { getAll as getAllTnt, getById as getTntById, update as updateTnt } from '../lib/hire-store.js'
import { getAll as getAllBalloon, getById as getBalloonById, update as updateBalloon } from '../lib/balloon-store.js'
import { createOrGetCustomer, saveCardForCustomer, chargeCardOnFile, squareWebPaymentsEnv } from '../lib/square-cards.js'
import { sendHireEmail } from '../lib/hire-mailer.js'
import { sendBalloonEmail } from '../lib/balloon-mailer.js'
import { notifyTNTEvent } from '../lib/tnt-telegram.js'
import { notifyBalloonEvent } from '../lib/balloon-telegram.js'
import { buildSigningUrl } from '../lib/contract-signing-token.js'
import { getGriLogoDataUri } from '../lib/gri-logo-data-uri.js'

const router = Router()

function resolveHire(type, orderNumber) {
  const norm = String(orderNumber).replace(/^#/, '')
  const list = type === 'tnt' ? getAllTnt() : getAllBalloon()
  return list.find(h => h.orderNumber === `#${norm}` || h.orderNumber === norm) || null
}

function bondAmountCents(type, hire) {
  if (type === 'tnt') {
    return ((hire.kitQty || 1) >= 2 ? 40000 : 20000)
  }
  // Balloon: $200 × boxQty (override via BALLOON_BOND_AMOUNT)
  const base = parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10)
  return base * 100 * (hire.boxQty || 1)
}

function bondAmountDollars(type, hire) { return (bondAmountCents(type, hire) / 100) }

function productLabel(type, hire) {
  if (type === 'tnt') return `TNT Cannon Hire${(hire.kitQty || 1) > 1 ? ` × ${hire.kitQty}` : ''}`
  const variant = hire.boxColor ? hire.boxColor.toUpperCase() : ''
  return `Helium Balloon Box Hire${variant ? ' (' + variant + ')' : ''}${(hire.boxQty || 1) > 1 ? ` × ${hire.boxQty}` : ''}`
}

/** Validate token + return the hire, or send an error response. */
function validateAndLoad(req, res) {
  const { type, orderNumber, token } = req.params
  if (!['tnt', 'balloon'].includes(type)) {
    res.status(400).type('html').send('<h1>Invalid hire type</h1>')
    return null
  }
  const v = verifyOrderToken(orderNumber, token)
  if (!v.ok) {
    res.status(403).type('html').send(
      `<!doctype html><meta charset="utf-8"><title>Link expired</title><div style="font-family:system-ui;max-width:500px;margin:60px auto;padding:24px"><h1>Link expired or invalid</h1><p>Please contact Gender Reveal Ideas on 0406860077 to get a fresh payment link.</p></div>`
    )
    return null
  }
  const hire = resolveHire(type, orderNumber)
  if (!hire) {
    res.status(404).type('html').send('<h1>Hire not found</h1>')
    return null
  }
  return { type, hire }
}

// ──────────────────────────────────────────────────────────────────────────
//  GET — render the checkout HTML (card form via Square Web Payments SDK)
// ──────────────────────────────────────────────────────────────────────────
router.get('/:type/:orderNumber/:token', (req, res) => {
  const ctx = validateAndLoad(req, res)
  if (!ctx) return
  const { type, hire } = ctx

  // If already paid, show a friendly "already paid" page
  if (hire.bondStatus === 'paid') {
    return res.type('html').send(renderAlreadyPaid({ type, hire, logo: getGriLogoDataUri() }))
  }

  const sq = squareWebPaymentsEnv()
  if (!sq.applicationId || !sq.locationId) {
    return res.status(500).type('html').send('<h1>Checkout not configured — SQUARE_APPLICATION_ID missing</h1>')
  }
  const amount = bondAmountDollars(type, hire)
  const label = productLabel(type, hire)
  const sdkUrl = sq.environment === 'sandbox'
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js'

  res.type('html').send(renderCheckout({
    type, hire, amount, label, sq, sdkUrl, logo: getGriLogoDataUri(),
  }))
})

// ──────────────────────────────────────────────────────────────────────────
//  POST — accept the card nonce, save the card, charge the bond
// ──────────────────────────────────────────────────────────────────────────
router.post('/:type/:orderNumber/:token', async (req, res) => {
  const ctx = validateAndLoad(req, res)
  if (!ctx) return
  const { type, hire } = ctx

  if (hire.bondStatus === 'paid') {
    return res.json({ ok: true, alreadyPaid: true })
  }

  const { sourceNonce, verifyToken } = req.body || {}
  if (!sourceNonce) return res.status(400).json({ ok: false, error: 'Card nonce missing' })

  const amountCents = bondAmountCents(type, hire)
  const update = type === 'tnt' ? updateTnt : updateBalloon
  const getById = type === 'tnt' ? getTntById : getBalloonById

  // Step 1 — create / lookup Square Customer
  let customerId = hire.squareCustomerId
  try {
    if (!customerId) {
      const [firstName, ...rest] = (hire.customerName || '').trim().split(/\s+/)
      const lastName = rest.join(' ')
      const r = await createOrGetCustomer({
        email: hire.customerEmail,
        firstName, lastName,
        phone: hire.customerPhone,
        referenceId: hire.orderNumber,
      })
      customerId = r.customerId
      update(hire.id, { squareCustomerId: customerId })
    }
  } catch (e) {
    return res.status(502).json({ ok: false, code: 'CUSTOMER_FAIL', error: e.message })
  }

  // Step 2 — save the card on file
  let card
  try {
    card = await saveCardForCustomer(customerId, sourceNonce, verifyToken)
    update(hire.id, {
      squareCardId: card.cardId,
      squareCardLast4: card.last4,
      squareCardBrand: card.brand,
      squareCardExpMonth: card.expMonth,
      squareCardExpYear: card.expYear,
    })
  } catch (e) {
    return res.status(502).json({ ok: false, code: 'CARD_SAVE_FAIL', error: e.message, squareErrors: e.squareErrors || null })
  }

  // Step 3 — charge the bond
  try {
    const charge = await chargeCardOnFile({
      cardId: card.cardId,
      customerId,
      amountCents,
      note: `Bond $${(amountCents/100).toFixed(0)} for ${type === 'tnt' ? 'TNT Cannon' : 'Helium Balloon Box'} hire ${hire.orderNumber}`,
    })
    const updated = update(hire.id, {
      bondStatus: 'paid',
      bondPaymentId: charge.paymentId,
      bondPaidAt: new Date().toISOString(),
      status: hire.status === 'confirmed' ? 'bond_paid' : hire.status,
      bondReceiptUrl: charge.receiptUrl,
    })

    // Auto-send contract email (mirrors the Square webhook flow)
    try {
      const orderNum = (hire.orderNumber || '').replace(/^#/, '')
      const signingUrl = type === 'tnt'
        ? buildSigningUrl(orderNum)
        : buildSigningUrl(orderNum).replace('/sign/', '/sign-balloon/')
      if (type === 'tnt') await sendHireEmail('contract', updated, signingUrl)
      else await sendBalloonEmail('contract', updated, signingUrl)
      update(hire.id, { contractStatus: 'sent', contractSentAt: new Date().toISOString(), status: 'contract_sent' })
    } catch (e) {
      console.error(`[checkout] contract email failed for ${hire.id}:`, e.message)
    }

    // Telegram
    if (type === 'tnt') notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {})
    else notifyBalloonEvent('bond_paid', getById(hire.id)).catch(() => {})

    return res.json({ ok: true, paymentId: charge.paymentId, status: charge.status, last4: card.last4, brand: card.brand })
  } catch (e) {
    return res.status(502).json({ ok: false, code: 'CHARGE_FAIL', error: e.message, squareErrors: e.squareErrors || null })
  }
})

// ──────────────────────────────────────────────────────────────────────────
//  HTML templates
// ──────────────────────────────────────────────────────────────────────────
function renderCheckout({ type, hire, amount, label, sq, sdkUrl, logo }) {
  const isBalloon = type === 'balloon'
  const accent = isBalloon ? '#E43F7B' : '#E43F7B'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gender Reveal Ideas Contract — Bond Payment</title>
  <script src="${sdkUrl}"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F8F6F4; color: #2D3A4A; line-height: 1.5; padding: 14px; }
    .container { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); padding: 28px; }
    .brand { text-align: center; margin-bottom: 8px; }
    .brand img { max-width: 140px; height: auto; }
    h1 { font-size: 20px; font-weight: 800; text-align: center; color: ${accent}; margin: 8px 0 4px; }
    .sub { text-align: center; color: #6B7280; font-size: 12px; margin-bottom: 18px; }
    .summary { background: #F0FDFA; border: 1px solid #A7F3D0; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }
    .summary-row strong { color: #047857; }
    .summary-total { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #A7F3D0; font-size: 16px; font-weight: 700; color: #047857; }
    label { display: block; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; margin: 14px 0 6px; }
    #card-container { padding: 4px; border: 1px solid #CBD5E1; border-radius: 10px; min-height: 90px; background: #fff; }
    #card-container.sq-focus { border-color: ${accent}; box-shadow: 0 0 0 3px rgba(228,63,123,0.12); }
    button { width: 100%; margin-top: 16px; padding: 14px; font-size: 16px; font-weight: 700; color: #fff; background: linear-gradient(135deg, ${accent}, #d1356b); border: none; border-radius: 10px; cursor: pointer; transition: opacity .15s; }
    button:hover { opacity: .92; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .err { color: #DC2626; font-size: 13px; margin-top: 10px; min-height: 18px; }
    .ok { color: #047857; font-size: 13px; margin-top: 10px; }
    .safe { text-align: center; color: #94A3B8; font-size: 11px; margin-top: 14px; }
    .footer { text-align: center; color: #94A3B8; font-size: 11px; margin-top: 18px; padding-top: 12px; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand"><img src="${logo}" alt="Gender Reveal Ideas"></div>
    <h1>Refundable Bond Payment</h1>
    <div class="sub">${label} · ${hire.orderNumber}</div>

    <div class="summary">
      <div class="summary-row"><span>Hirer</span><strong>${hire.customerName}</strong></div>
      <div class="summary-row"><span>Item</span><strong>${label}</strong></div>
      <div class="summary-row"><span>Order</span><strong>${hire.orderNumber}</strong></div>
      <div class="summary-total"><span>Refundable bond</span><span>$${amount.toFixed(2)} AUD</span></div>
    </div>

    <p style="font-size:12px;color:#475569;line-height:1.5">
      Your card will be securely saved on file by Square. The $${amount.toFixed(2)} bond is charged now and refunded after the item is returned in good condition. If damage occurs we may charge the same card for any additional amount as per your signed hire agreement.
    </p>

    <label>Card details</label>
    <div id="card-container"></div>

    <button id="pay-btn" type="button" disabled>Loading secure card form…</button>
    <div id="msg" class="err"></div>
    <div class="safe">🔒 Card data goes directly to Square — never to our servers.</div>
    <div class="footer">Gender Reveal Ideas · 0406 860 077 · genderrevealideas.com.au</div>
  </div>

<script>
(async () => {
  const payments = window.Square.payments(${JSON.stringify(sq.applicationId)}, ${JSON.stringify(sq.locationId)});
  const card = await payments.card();
  await card.attach('#card-container');

  const btn = document.getElementById('pay-btn');
  const msg = document.getElementById('msg');
  btn.textContent = 'Pay $${amount.toFixed(2)} bond';
  btn.disabled = false;

  async function submit() {
    btn.disabled = true; msg.textContent = 'Processing…'; msg.className = 'err';
    try {
      const result = await card.tokenize();
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message || 'Card tokenisation failed');
      const verify = await payments.verifyBuyer(result.token, {
        amount: ${JSON.stringify(amount.toFixed(2))},
        currencyCode: 'AUD',
        intent: 'CHARGE',
        billingContact: { givenName: ${JSON.stringify((hire.customerName || '').split(' ')[0])} },
      }).catch(() => null);
      const res = await fetch(location.pathname, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceNonce: result.token, verifyToken: verify?.token })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || ('Charge failed (' + res.status + ')'));
      msg.className = 'ok';
      msg.textContent = '✓ Bond paid · card saved · contract email on its way';
      btn.textContent = 'Paid ✓';
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      msg.className = 'err'; msg.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Pay $${amount.toFixed(2)} bond';
    }
  }
  btn.addEventListener('click', submit);
})();
</script>
</body>
</html>`
}

function renderAlreadyPaid({ type, hire, logo }) {
  const label = type === 'tnt' ? 'TNT Cannon Hire' : 'Helium Balloon Box Hire'
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gender Reveal Ideas Contract — Bond Paid</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8F6F4;padding:14px}
.container{max-width:480px;margin:60px auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.06);padding:28px;text-align:center}
img{max-width:140px;margin-bottom:14px}h1{color:#047857;font-size:22px;margin-bottom:8px}p{color:#475569;font-size:14px;line-height:1.6}</style></head>
<body><div class="container"><img src="${logo}" alt="GRI"><h1>✓ Bond already paid</h1>
<p>Thanks ${hire.customerName.split(' ')[0]} — your ${label} bond is recorded against order ${hire.orderNumber}.</p>
<p style="margin-top:12px">If you need anything, call us on 0406 860 077.</p></div></body></html>`
}

export default router
