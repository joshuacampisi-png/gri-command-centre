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
import { notifyStaffBondPaid } from '../lib/staff-notify.js'
import { buildSigningUrl } from '../lib/contract-signing-token.js'
import { getGriLogoDataUri } from '../lib/gri-logo-data-uri.js'

const router = Router()

function resolveHire(type, orderNumber) {
  const norm = String(orderNumber).replace(/^#/, '')
  const list = type === 'tnt' ? getAllTnt() : getAllBalloon()
  return list.find(h => h.orderNumber === `#${norm}` || h.orderNumber === norm) || null
}

// Bond scales linearly with hire quantity for BOTH TNT and Balloon.
// 1 unit = $200, 2 units = $400, 3 units = $600, etc.
function bondAmountCents(type, hire) {
  if (type === 'tnt') {
    const tntBase = parseInt(process.env.TNT_BOND_AMOUNT || '200', 10)
    return tntBase * 100 * (hire.kitQty || 1)
  }
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

    // Telegram + staff email
    if (type === 'tnt') notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {})
    else notifyBalloonEvent('bond_paid', getById(hire.id)).catch(() => {})
    notifyStaffBondPaid(type, getById(hire.id), { amountCents, source: 'checkout', paymentId: charge.paymentId }).catch(() => {})

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
    button { width: 100%; min-height: 48px; margin-top: 16px; padding: 14px; font-size: 16px; font-weight: 700; color: #fff; background: linear-gradient(135deg, ${accent}, #d1356b); border: none; border-radius: 10px; cursor: pointer; transition: opacity .15s, transform .05s ease; -webkit-tap-highlight-color: rgba(228,63,123,0.2); }
    button:hover { opacity: .92; }
    button:active { transform: scale(0.98); opacity: .88; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .err { color: #DC2626; font-size: 13px; margin-top: 10px; min-height: 18px; }
    .ok { color: #047857; font-size: 13px; margin-top: 10px; }
    /* Trust badges */
    .trust { margin-top: 18px; padding-top: 16px; border-top: 1px solid #E2E8F0; }
    .trust-row { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
    .trust-pill {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 10px; border-radius: 999px;
      background: linear-gradient(180deg, #F0FDF4, #DCFCE7);
      border: 1px solid #86EFAC;
      color: #047857; font-size: 11px; font-weight: 600;
      letter-spacing: 0.01em;
    }
    .cards-row {
      display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .card-logo {
      width: 42px; height: 28px;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.06));
    }
    .powered-by {
      text-align: center; color: #64748B; font-size: 11px;
      margin-top: 6px; line-height: 1.5;
    }
    .powered-by strong { color: #2D3A4A; }
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

    <!-- Trust badges + card brands -->
    <div class="trust">
      <div class="trust-row">
        <span class="trust-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          256-bit SSL
        </span>
        <span class="trust-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
          PCI DSS Compliant
        </span>
        <span class="trust-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg>
          Encrypted
        </span>
      </div>

      <div class="cards-row" aria-label="Accepted payment methods">
        <!-- Visa -->
        <svg class="card-logo" viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
          <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E7EB"/>
          <path d="M19.7 21.3l1.7-10.4h2.7l-1.7 10.4h-2.7zm12.4-10.1c-.5-.2-1.4-.4-2.5-.4-2.7 0-4.7 1.4-4.7 3.5 0 1.5 1.4 2.4 2.4 2.9 1.1.5 1.5.9 1.5 1.4 0 .7-.9 1.1-1.7 1.1-1.1 0-1.8-.2-2.7-.6l-.4-.2-.4 2.5c.6.3 1.8.6 3.1.6 2.9 0 4.8-1.4 4.8-3.6 0-1.2-.7-2.1-2.3-2.9-1-.5-1.6-.8-1.6-1.4 0-.5.5-1 1.7-1 1 0 1.7.2 2.2.4l.3.1.3-2.4zm6.7-.3h-2.1c-.6 0-1.1.2-1.4 1l-4 9.4h2.8s.5-1.3.6-1.5h3.4c.1.4.3 1.5.3 1.5h2.5l-2.1-10.4zm-3.3 6.6c.2-.6 1.1-2.9 1.1-2.9 0 0 .2-.6.4-1l.2 1s.5 2.5.6 3l-2.3-.1zm-17.7-6.6l-2.6 7.1-.3-1.4c-.5-1.6-2-3.4-3.7-4.3l2.4 9h2.9l4.3-10.4h-3z" fill="#1A1F71"/>
          <path d="M11.6 10.9H7.2l-.1.3c3.5.9 5.8 3 6.7 5.5l-1-4.8c-.2-.8-.7-1-1.2-1z" fill="#F7B600"/>
        </svg>
        <!-- Mastercard -->
        <svg class="card-logo" viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
          <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E7EB"/>
          <circle cx="19" cy="16" r="7" fill="#EB001B"/>
          <circle cx="29" cy="16" r="7" fill="#F79E1B"/>
          <path d="M24 10.5a7 7 0 010 11 7 7 0 010-11z" fill="#FF5F00"/>
        </svg>
        <!-- American Express -->
        <svg class="card-logo" viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" aria-label="American Express">
          <rect width="48" height="32" rx="4" fill="#1F72CD"/>
          <text x="24" y="20" font-family="Arial Black, sans-serif" font-size="6.5" fill="#fff" text-anchor="middle" font-weight="900">AMERICAN</text>
          <text x="24" y="26" font-family="Arial Black, sans-serif" font-size="6.5" fill="#fff" text-anchor="middle" font-weight="900">EXPRESS</text>
        </svg>
        <!-- Apple Pay -->
        <svg class="card-logo" viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" aria-label="Apple Pay">
          <rect width="48" height="32" rx="4" fill="#000"/>
          <path d="M14.3 13.2c-.4.5-1 .9-1.7.8-.1-.7.3-1.4.6-1.8.4-.5 1.1-.9 1.6-.9.1.7-.1 1.4-.5 1.9zm.5.8c-.9-.1-1.7.5-2.1.5-.5 0-1.1-.5-1.9-.5-1 0-1.9.6-2.4 1.5-1 1.7-.3 4.2.7 5.6.5.7 1 1.4 1.8 1.4.7 0 1-.5 1.9-.5.9 0 1.1.5 1.9.5.8 0 1.3-.7 1.8-1.4.5-.7.7-1.4.7-1.4-.6-.2-1.5-.9-1.5-1.9.1-1.1.9-1.6 1-1.7-.5-.7-1.3-1.1-1.9-1.1zM19.5 12.5h3.4c1.5 0 2.6 1.1 2.6 2.6s-1.1 2.6-2.7 2.6h-1.9v2.7h-1.4v-7.9zm1.4 1.1v3h1.6c1 0 1.6-.5 1.6-1.5s-.6-1.5-1.6-1.5h-1.6zM28.2 20.5c-.9 0-1.6-.5-1.6-1.3 0-.8.6-1.3 2-1.4l1.6-.1v-.5c0-.7-.5-1.1-1.2-1.1-.7 0-1.2.4-1.3.9h-1.3c.1-1.1 1-1.9 2.6-1.9 1.5 0 2.5.8 2.5 2.1v3.2h-1.2v-.8h0c-.4.5-1 .9-2.1.9zm.4-1c.9 0 1.6-.6 1.6-1.4v-.5l-1.4.1c-.7.1-1.2.4-1.2.9 0 .6.5.9 1 .9zM32.5 22.5c-.1 0-.5 0-.6-.1v-1c.1 0 .3.1.4.1.6 0 .9-.3 1.1-.9l.1-.4-1.9-5.4h1.4l1.3 4.4h0l1.3-4.4h1.4l-2 5.7c-.5 1.4-1 1.9-2.5 1.9z" fill="#fff"/>
        </svg>
        <!-- Google Pay -->
        <svg class="card-logo" viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" aria-label="Google Pay">
          <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E7EB"/>
          <path d="M21.4 16.9v3.3h-1V12h2.8c.7 0 1.3.2 1.8.7s.7 1 .7 1.7-.2 1.2-.7 1.7-1.1.7-1.8.7l-1.8.1zm0-3.9V16h1.8c.4 0 .8-.1 1-.4s.4-.6.4-1-.1-.7-.4-1c-.3-.3-.6-.4-1-.4l-1.8-.2zm6.2 1.5c.7 0 1.3.2 1.7.6.4.4.6.9.6 1.5v3.6h-1v-.7h0c-.4.6-1 .9-1.7.9-.6 0-1.1-.2-1.5-.5s-.6-.8-.6-1.3.2-.9.6-1.2.9-.5 1.6-.5c.6 0 1.1.1 1.5.3v-.2c0-.3-.1-.6-.4-.9s-.6-.4-1-.4c-.6 0-1 .2-1.4.7l-.9-.6c.5-.8 1.2-1.3 2.5-1.3zm-1.4 3.9c0 .2.1.5.3.6s.5.3.8.3c.5 0 .9-.2 1.2-.5.4-.4.5-.8.5-1.2-.4-.3-.8-.4-1.4-.4-.4 0-.8.1-1.1.3s-.3.5-.3.9zM35 14.6l-3.4 7.8h-1.1l1.3-2.7-2.3-5.1h1.1l1.6 3.9h0l1.6-3.9H35z" fill="#5F6368"/>
          <path d="M18.4 16.2c0-.3 0-.6-.1-.9h-4v1.7H17c-.1.4-.3.8-.7 1l1.2 1c.7-.7 1.1-1.7 1.1-2.8h-.2z" fill="#4285F4"/>
          <path d="M14.3 20.4c1.1 0 2-.4 2.7-1l-1.2-1c-.4.3-.9.4-1.5.4-1.1 0-2-.7-2.4-1.7H10v1c.6 1.3 1.9 2.3 4.3 2.3z" fill="#34A853"/>
          <path d="M11.9 17.1c-.1-.3-.2-.6-.2-.9s.1-.7.2-.9v-1H10c-.4.7-.6 1.4-.6 2.2s.2 1.5.6 2.2l1.9-.6v-1z" fill="#FBBC04"/>
          <path d="M14.3 13.6c.6 0 1.2.2 1.6.6l1.1-1c-.7-.7-1.6-1.1-2.7-1.1-2.4 0-3.8 1-4.3 2.3l1.9 1c.4-1.1 1.3-1.8 2.4-1.8z" fill="#EA4335"/>
        </svg>
      </div>

      <div class="powered-by">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4;vertical-align:-2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        Card data goes directly to <strong>Square</strong> — never touches our servers.
      </div>
    </div>

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
