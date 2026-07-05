/**
 * routes/balloons.js
 * Full lifecycle API for the Helium Balloon Box hire system.
 *
 * Mirrors routes/hires.js (TNT) one-for-one. Reuses square-client.js for
 * refunds + order_id matching, reuses contract-signing-token.js for the
 * /sign-balloon/:order/:token URL, reuses Resend HTTP via balloon-mailer.
 */
import { Router } from 'express'
import { getAll, getById, create, update, clearAll } from '../lib/balloon-store.js'
import { createBalloonBondPaymentLink, balloonBondCents } from '../lib/balloon-square.js'
import { refundBondPayment, isRealSquarePaymentId, getRefund, getPayment } from '../lib/square-client.js'
import { sendBalloonEmail } from '../lib/balloon-mailer.js'
import { notifyBalloonEvent } from '../lib/balloon-telegram.js'
import { buildSigningUrl, buildBondCheckoutUrl } from '../lib/contract-signing-token.js'
import { chargeCardOnFile } from '../lib/square-cards.js'
import { verifyCompletedPayment, findCompletedPaymentByOrder } from '../lib/square-payment-verify.js'
import { notifyStaffBondPaid } from '../lib/staff-notify.js'

const router = Router()

// ── Health ─────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    bondAmount: parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10),
    productId: 8205084131417,
    square: {
      hasToken: Boolean(process.env.SQUARE_ACCESS_TOKEN),
      hasLocation: Boolean(process.env.SQUARE_LOCATION_ID),
    },
    email: { resend: Boolean(process.env.RESEND_API_KEY) },
    counts: (() => {
      const all = getAll()
      return {
        total: all.length,
        active: all.filter(h => !['returned', 'withheld', 'cancelled'].includes(h.status)).length,
        bondPending: all.filter(h => h.bondStatus !== 'paid' && !['returned', 'withheld', 'cancelled'].includes(h.status)).length,
      }
    })(),
  })
})

// ── Contract email helper (called from multiple endpoints) ─────────────────
async function sendContractInternal(hire) {
  const orderNum = (hire.orderNumber || '').replace(/^#/, '')
  const signingUrl = buildSigningUrl(orderNum).replace('/sign/', '/sign-balloon/')
  await sendBalloonEmail('contract', hire, signingUrl)
  update(hire.id, {
    contractStatus: 'sent',
    contractSentAt: new Date().toISOString(),
    status: 'contract_sent',
  })
  return { signingUrl }
}

// ── Sync from Shopify ──────────────────────────────────────────────────────
import { env } from '../lib/env.js'

const BALLOON_PRODUCT_IDS = [8205084131417]

function isBalloonOrder(order) {
  return (order.line_items || []).some(li => BALLOON_PRODUCT_IDS.includes(li.product_id))
}

function pickBalloonVariant(order) {
  const li = (order.line_items || []).find(l => BALLOON_PRODUCT_IDS.includes(l.product_id))
  if (!li) return null
  const title = (li.variant_title || '').toLowerCase()
  if (title.includes('pink')) return 'pink'
  if (title.includes('blue')) return 'blue'
  if (title.includes('secret')) return 'secret'
  return null
}

router.post('/sync', async (_req, res) => {
  try {
    if (!env.shopify.storeDomain || !env.shopify.adminAccessToken) {
      return res.status(500).json({ ok: false, error: 'Shopify credentials not configured' })
    }
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const sinceStr = since.toISOString()
    const url = `https://${env.shopify.storeDomain}/admin/api/2026-01/orders.json?status=any&created_at_min=${encodeURIComponent(sinceStr)}&limit=250`
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': env.shopify.adminAccessToken, 'Content-Type': 'application/json' } })
    const data = await r.json()
    if (!r.ok) return res.status(500).json({ ok: false, error: data.errors || `Shopify HTTP ${r.status}` })

    const orders = (data.orders || []).filter(isBalloonOrder)
    const existing = getAll()
    let created = 0, skipped = 0
    for (const o of orders) {
      const orderName = o.name || `#${o.order_number}`
      if (existing.some(h => h.orderNumber === orderName)) { skipped++; continue }
      const customer = o.customer || {}
      const shipping = o.shipping_address || o.billing_address || {}
      const customerName = `${customer.first_name || shipping.first_name || ''} ${customer.last_name || shipping.last_name || ''}`.trim() || 'Unknown'
      const customerEmail = o.contact_email || customer.email || o.email || ''
      const customerPhone = shipping.phone || customer.phone || o.phone || ''
      const boxColor = pickBalloonVariant(o)
      const balloonItems = (o.line_items || []).filter(li => BALLOON_PRODUCT_IDS.includes(li.product_id))
      const boxQty = balloonItems.reduce((sum, li) => sum + (li.quantity || 1), 0)
      const revenue = balloonItems.reduce((sum, li) => sum + parseFloat(li.price || 0) * (li.quantity || 1), 0)
      const hire = create({
        orderNumber: orderName,
        customerName, customerEmail, customerPhone,
        eventDate: '',
        boxQty, boxColor, revenue,
      })
      console.log(`[balloons/sync] Created hire ${hire.id} for ${orderName} (${customerName})`)
      // Bond link → card-on-file checkout URL (lets us charge damages later)
      if (customerEmail) {
        try {
          const checkoutUrl = buildBondCheckoutUrl('balloon', hire.orderNumber)
          update(hire.id, { bondPaymentUrl: checkoutUrl })
          await sendBalloonEmail('bond_link', hire, checkoutUrl)
        } catch (e) {
          console.error(`[balloons/sync] Bond link failed for ${orderName}:`, e.message)
        }
      }
      notifyBalloonEvent('order_created', hire).catch(() => {})
      created++
    }
    res.json({ ok: true, created, skipped, total: orders.length })
  } catch (e) {
    console.error('[balloons/sync] error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Reconcile against Square payments ──────────────────────────────────────
router.post('/reconcile-payments', async (_req, res) => {
  try {
    const sqToken = process.env.SQUARE_ACCESS_TOKEN
    if (!sqToken) return res.status(500).json({ ok: false, error: 'Square not configured' })

    const payRes = await fetch('https://connect.squareup.com/v2/payments?sort_order=DESC&limit=50', {
      headers: { 'Authorization': `Bearer ${sqToken}`, 'Content-Type': 'application/json', 'Square-Version': '2024-12-18' },
    })
    const payData = await payRes.json()
    const payments = (payData.payments || []).filter(p => p.status === 'COMPLETED')

    const hires = getAll()
    let reconciled = 0
    for (const hire of hires) {
      if (hire.bondStatus === 'paid') continue
      const orderNum = (hire.orderNumber || '').replace('#', '')
      const match = payments.find(p => (p.note || '').includes(orderNum) && /Balloon/i.test(p.note))
      if (match) {
        update(hire.id, {
          bondStatus: 'paid',
          bondPaymentId: match.id,
          bondPaidAt: match.created_at,
          bondOrderId: match.order_id,
          status: hire.status === 'confirmed' ? 'bond_paid' : hire.status,
        })
        try { await sendContractInternal(getById(hire.id)) } catch {}
        notifyBalloonEvent('bond_paid', getById(hire.id)).catch(() => {})
        notifyStaffBondPaid('balloon', getById(hire.id), { amountCents: match.amount_money?.amount, source: 'reconcile', paymentId: match.id }).catch(() => {})
        reconciled++
      }
    }
    res.json({ ok: true, reconciled })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Refund audit (public — exposed in PUBLIC_PREFIXES) ─────────────────────
router.get('/refund-audit', async (req, res) => {
  try {
    const fix = req.query.fix === '1' || req.query.fix === 'true'
    const candidates = getAll().filter(h => h.bondOutcome === 'refunded' || h.bondOutcome === 'refund_pending' || h.bondOutcome === 'refund_failed' || h.refundId)
    const results = []
    for (const h of candidates) {
      const row = {
        orderNumber: h.orderNumber,
        customerName: h.customerName,
        bondOutcome: h.bondOutcome,
        bondPaymentId: h.bondPaymentId,
        refundId: h.refundId || null,
        liveSquareStatus: null,
        actualMoneyMoved: null,
        verdict: null,
      }
      if (!isRealSquarePaymentId(h.bondPaymentId)) {
        row.verdict = 'PLACEHOLDER_PAYMENT_ID — never refundable via API. Process manually in Square dashboard.'
        results.push(row); continue
      }
      if (h.refundId) {
        try {
          const r = await getRefund(h.refundId)
          row.liveSquareStatus = r.status
          row.actualMoneyMoved = r.status === 'COMPLETED'
          row.verdict = r.status === 'COMPLETED' ? 'REFUNDED OK'
                       : r.status === 'PENDING' ? 'PENDING — money will move in 2–10 days'
                       : `${r.status} — NO MONEY MOVED. ${r.reason || ''}`.trim()
        } catch (e) { row.verdict = `Square getRefund failed: ${e.message}` }
      } else if (h.bondPaymentId) {
        try {
          const p = await getPayment(h.bondPaymentId)
          const refundedCents = p.refunded_money?.amount || 0
          row.liveSquareStatus = p.status
          row.actualMoneyMoved = refundedCents > 0
          row.verdict = refundedCents > 0 ? `Payment shows $${(refundedCents / 100).toFixed(2)} refunded` : 'NO REFUND AT SQUARE'
        } catch (e) { row.verdict = `Square getPayment failed: ${e.message}` }
      }
      if (fix && row.liveSquareStatus) {
        const patch = { refundStatus: row.liveSquareStatus, refundCheckedAt: new Date().toISOString() }
        if (row.liveSquareStatus === 'COMPLETED') patch.bondOutcome = 'refunded'
        else if (row.liveSquareStatus === 'PENDING') patch.bondOutcome = 'refund_pending'
        else if (['FAILED', 'REJECTED'].includes(row.liveSquareStatus)) patch.bondOutcome = 'refund_failed'
        update(h.id, patch); row.fixed = true
      }
      results.push(row)
    }
    const summary = {
      total: results.length,
      okRefunded: results.filter(r => r.actualMoneyMoved === true).length,
      pending: results.filter(r => r.liveSquareStatus === 'PENDING').length,
      failed: results.filter(r => ['FAILED', 'REJECTED'].includes(r.liveSquareStatus)).length,
      placeholder: results.filter(r => /PLACEHOLDER/.test(r.verdict || '')).length,
    }
    res.json({ ok: true, summary, results })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Helpers by order number (public — same auth pattern as TNT) ────────────
router.post('/mark-bond-paid-by-order', async (req, res) => {
  try {
    const { orderNumber, paymentId, autoFindPayment, manualOverride, manualReason } = req.body || {}
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' })
    const norm = String(orderNumber).replace(/^#/, '')
    const hire = getAll().find(h => h.orderNumber === `#${norm}` || h.orderNumber === norm)
    if (!hire) return res.status(404).json({ error: `No balloon hire for order ${norm}` })
    if (hire.bondStatus === 'paid') return res.json({ ok: true, alreadyPaid: true, orderNumber: hire.orderNumber })

    let recordedPaymentId = null
    let recordedOrderId = null
    let paidAt = new Date().toISOString()
    let verifiedPayment = null

    if (paymentId) {
      try {
        verifiedPayment = await verifyCompletedPayment(paymentId)
        recordedPaymentId = verifiedPayment.id
        recordedOrderId = verifiedPayment.order_id
        paidAt = verifiedPayment.created_at || paidAt
      } catch (e) {
        return res.status(400).json({ ok: false, error: `Square did not confirm payment ${paymentId}: ${e.message}` })
      }
    } else if (autoFindPayment === true) {
      const expectedCents = balloonBondCents(hire)
      const found = await findCompletedPaymentByOrder(hire.orderNumber, expectedCents).catch(e => { throw e })
      if (!found) return res.status(404).json({ ok: false, error: `No COMPLETED Square payment found for order ${hire.orderNumber}` })
      verifiedPayment = found
      recordedPaymentId = found.id
      recordedOrderId = found.order_id
      paidAt = found.created_at || paidAt
    } else if (manualOverride === true) {
      if (!manualReason || String(manualReason).trim().length < 8) {
        return res.status(400).json({ ok: false, error: 'manualOverride requires manualReason (min 8 chars).' })
      }
      recordedPaymentId = 'manual_' + Date.now().toString(36)
    } else {
      return res.status(400).json({
        ok: false,
        error: 'One of { paymentId } / { autoFindPayment: true } / { manualOverride: true, manualReason } is required.',
      })
    }

    const updated = update(hire.id, {
      status: 'bond_paid',
      bondStatus: 'paid',
      bondPaymentId: recordedPaymentId,
      bondOrderId: recordedOrderId || hire.bondOrderId || undefined,
      bondPaidAt: paidAt,
      bondManualOverride: manualOverride === true || undefined,
      bondManualReason: manualOverride === true ? String(manualReason).trim() : undefined,
    })
    notifyBalloonEvent('bond_paid', getById(hire.id)).catch(() => {})
    notifyStaffBondPaid('balloon', getById(hire.id), { amountCents: verifiedPayment?.amount_money?.amount, source: manualOverride === true ? 'manual' : 'manual-verified', paymentId: recordedPaymentId }).catch(() => {})
    let contract = null
    try { const r = await sendContractInternal(updated); contract = { sent: true, signingUrl: r.signingUrl } }
    catch (e) { contract = { sent: false, error: e.message } }
    res.json({
      ok: true,
      orderNumber: hire.orderNumber,
      bondPaymentId: recordedPaymentId,
      verified: Boolean(verifiedPayment),
      verifiedPayment: verifiedPayment ? { id: verifiedPayment.id, amountCents: verifiedPayment.amount_money?.amount, status: verifiedPayment.status } : null,
      contract,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/convert-to-historical-by-order', async (req, res) => {
  try {
    const { orderNumber } = req.body || {}
    if (!orderNumber) return res.status(400).json({ error: 'orderNumber required' })
    const norm = String(orderNumber).replace(/^#/, '')
    const hire = getAll().find(h => h.orderNumber === `#${norm}` || h.orderNumber === norm)
    if (!hire) return res.status(404).json({ error: `No balloon hire for order ${norm}` })
    update(hire.id, {
      status: 'returned', bondStatus: 'paid',
      bondPaymentId: hire.bondPaymentId || 'historical_backfill',
      bondPaidAt: hire.bondPaidAt || hire.createdAt,
      contractStatus: 'signed',
      contractSentAt: hire.contractSentAt || hire.createdAt,
      contractSignedAt: hire.contractSignedAt || hire.createdAt,
      emailSent: true, historical: true,
      historicalBackfillAt: new Date().toISOString(),
    })
    res.json({ ok: true, orderNumber: hire.orderNumber, customerName: hire.customerName })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Contracts register ─────────────────────────────────────────────────────
router.get('/contracts', (_req, res) => {
  const signed = getAll()
    .filter(h => h.contractStatus === 'signed' && h.contractSignedAt)
    .map(h => ({
      id: h.id, orderNumber: h.orderNumber, customerName: h.customerName,
      customerEmail: h.customerEmail, contractSignedAt: h.contractSignedAt,
      pdfUrl: `/api/balloon-contract/${h.id}/pdf`,
    }))
    .sort((a, b) => new Date(b.contractSignedAt) - new Date(a.contractSignedAt))
  res.json({ ok: true, contracts: signed })
})

// ── CRUD ───────────────────────────────────────────────────────────────────
router.get('/', (_req, res) => res.json({ hires: getAll() }))
router.delete('/', (_req, res) => { clearAll(); res.json({ ok: true }) })

router.get('/:id', (req, res) => {
  const hire = getById(req.params.id)
  if (!hire) return res.status(404).json({ error: 'Hire not found' })
  res.json({ hire })
})

router.put('/:id', (req, res) => {
  const hire = getById(req.params.id)
  if (!hire) return res.status(404).json({ error: 'Hire not found' })
  res.json({ hire: update(hire.id, req.body) })
})

router.post('/', async (req, res) => {
  try {
    const { orderNumber, customerName, customerEmail, customerPhone, eventDate, boxColor, boxQty } = req.body
    if (!orderNumber || !customerName || !customerEmail || !eventDate) {
      return res.status(400).json({ error: 'Missing required fields: orderNumber, customerName, customerEmail, eventDate' })
    }
    const hire = create({ orderNumber, customerName, customerEmail, customerPhone, eventDate, boxColor, boxQty })
    try { await sendBalloonEmail('confirmation', hire); update(hire.id, { emailSent: true, confirmationSentAt: new Date().toISOString() }); hire.emailSent = true } catch (e) { console.error('[balloons] confirm email fail:', e.message) }
    try {
      const checkoutUrl = buildBondCheckoutUrl('balloon', hire.orderNumber)
      update(hire.id, { bondPaymentUrl: checkoutUrl })
      hire.bondPaymentUrl = checkoutUrl
      await sendBalloonEmail('bond_link', hire, checkoutUrl)
    } catch (e) { console.error('[balloons] bond link fail:', e.message) }
    res.json({ hire })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/send-confirmation', async (req, res) => {
  try {
    const hire = getById(req.params.id)
    if (!hire) return res.status(404).json({ error: 'Hire not found' })
    await sendBalloonEmail('confirmation', hire)
    res.json({ hire: update(hire.id, { emailSent: true }) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/mark-bond-paid', async (req, res) => {
  const hire = getById(req.params.id)
  if (!hire) return res.status(404).json({ error: 'Hire not found' })
  if (hire.bondStatus === 'paid') return res.json({ ok: true, alreadyPaid: true, hire })

  const { paymentId, manualOverride, manualReason } = req.body || {}
  let recordedPaymentId = null
  let paidAt = new Date().toISOString()
  let verifiedPayment = null

  if (paymentId) {
    try {
      verifiedPayment = await verifyCompletedPayment(paymentId)
      recordedPaymentId = verifiedPayment.id
      paidAt = verifiedPayment.created_at || paidAt
    } catch (e) {
      return res.status(400).json({ ok: false, error: `Square did not confirm this payment: ${e.message}. For cash/bank transfer resend with { manualOverride:true, manualReason:"..." }.` })
    }
  } else if (manualOverride === true) {
    if (!manualReason || String(manualReason).trim().length < 8) {
      return res.status(400).json({ ok: false, error: 'manualOverride requires manualReason (min 8 chars).' })
    }
    recordedPaymentId = 'manual_' + Date.now().toString(36)
  } else {
    return res.status(400).json({
      ok: false,
      error: 'paymentId (real Square) OR { manualOverride:true, manualReason } is required. This endpoint no longer auto-generates a placeholder.',
    })
  }

  const updated = update(hire.id, {
    status: 'bond_paid', bondStatus: 'paid', bondPaymentId: recordedPaymentId, bondPaidAt: paidAt,
    bondManualOverride: manualOverride === true || undefined,
    bondManualReason: manualOverride === true ? String(manualReason).trim() : undefined,
  })
  notifyBalloonEvent('bond_paid', getById(hire.id)).catch(() => {})
  try { await sendContractInternal(updated) } catch (e) { console.error('[balloons] contract send fail:', e.message) }
  res.json({
    ok: true,
    hire: getById(hire.id),
    verified: Boolean(verifiedPayment),
    verifiedPayment: verifiedPayment ? { id: verifiedPayment.id, amountCents: verifiedPayment.amount_money?.amount, status: verifiedPayment.status } : null,
  })
})

router.post('/:id/send-bond-link', async (req, res) => {
  try {
    const hire = getById(req.params.id)
    if (!hire) return res.status(404).json({ error: 'Hire not found' })
    // Always generate a fresh checkout URL — token rotation invalidates old links
    const url = buildBondCheckoutUrl('balloon', hire.orderNumber)
    update(hire.id, { bondPaymentUrl: url })
    await sendBalloonEmail('bond_link', hire, url)
    res.json({ hire: getById(hire.id), paymentUrl: url })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Charge for damages (post-hire) ─────────────────────────────────────────
// Uses the card saved on file during the bond checkout to charge any
// additional amount — damage / replacement / late fees / re-bookings.
router.post('/:id/charge-damages', async (req, res) => {
  try {
    const hire = getById(req.params.id)
    if (!hire) return res.status(404).json({ ok: false, error: 'Hire not found' })
    const { amount, reason } = req.body || {}
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ ok: false, error: 'amount must be a positive number' })
    if (!reason || !reason.trim()) return res.status(400).json({ ok: false, error: 'reason required' })
    if (!hire.squareCardId || !hire.squareCustomerId) {
      return res.status(409).json({ ok: false, code: 'NO_CARD_ON_FILE',
        error: 'No card saved on file for this hire. The customer paid the bond via the old Quick Pay link, so we cannot auto-charge — process this damage charge manually in the Square dashboard.' })
    }
    const charge = await chargeCardOnFile({
      cardId: hire.squareCardId,
      customerId: hire.squareCustomerId,
      amountCents: Math.round(amt * 100),
      note: `Damage charge for balloon-box hire ${hire.orderNumber}: ${reason.trim()}`,
    }).catch(e => { throw e })
    const damageCharges = Array.isArray(hire.damageCharges) ? [...hire.damageCharges] : []
    damageCharges.push({
      amount: amt, reason: reason.trim(),
      paymentId: charge.paymentId, status: charge.status,
      receiptUrl: charge.receiptUrl,
      chargedAt: new Date().toISOString(),
    })
    const updated = update(hire.id, { damageCharges })
    res.json({ ok: true, hire: updated, charge })
  } catch (e) {
    res.status(502).json({ ok: false, code: 'CHARGE_FAIL', error: e.message, squareErrors: e.squareErrors || null })
  }
})

router.post('/:id/mark-picked-up', (req, res) => {
  const hire = getById(req.params.id)
  if (!hire) return res.status(404).json({ ok: false, error: 'Hire not found' })
  res.json({ ok: true, hire: update(hire.id, { status: 'active', pickedUpAt: new Date().toISOString() }) })
})

router.post('/:id/send-contract', async (req, res) => {
  try {
    const hire = getById(req.params.id)
    if (!hire) return res.status(404).json({ error: 'Hire not found' })
    const r = await sendContractInternal(hire)
    res.json({ ok: true, hire: getById(hire.id), signingUrl: r.signingUrl })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Process return (refund / withhold) — silent-fail guarded ───────────────
router.post('/:id/process-return', async (req, res) => {
  try {
    const hire = getById(req.params.id)
    if (!hire) return res.status(404).json({ error: 'Hire not found' })
    const { decision, forceManual, customAmount } = req.body || {}
    if (!['refund', 'withhold'].includes(decision)) return res.status(400).json({ error: 'decision must be refund or withhold' })
    const now = new Date().toISOString()

    if (decision === 'withhold') {
      const updated = update(hire.id, {
        status: 'withheld', bondOutcome: 'withheld', returnedAt: now, bondOutcomeAt: now,
      })
      try { await sendBalloonEmail('withheld', updated) } catch (e) { console.error('[balloons] withheld email fail:', e.message) }
      return res.json({ ok: true, hire: updated })
    }

    if (forceManual) {
      const updated = update(hire.id, {
        status: 'returned', bondOutcome: 'refunded_manual', returnedAt: now, bondOutcomeAt: now,
        refundManualNote: 'Operator marked refunded manually — money moved outside this system',
      })
      return res.json({ ok: true, hire: updated, manual: true, warning: 'Marked refunded_manual. NO Square refund sent, NO email to customer.' })
    }

    if (!isRealSquarePaymentId(hire.bondPaymentId)) {
      return res.status(409).json({
        ok: false, code: 'NO_SQUARE_PAYMENT',
        error: `Cannot auto-refund: bondPaymentId is "${hire.bondPaymentId || 'empty'}" which is a placeholder, not a real Square payment ID.`,
        hint: 'Refund this customer in the Square dashboard, then re-submit with forceManual:true.',
      })
    }

    // Partial refund supported via customAmount (dollars)
    const fullBondCents = balloonBondCents(hire)
    let refundCents = fullBondCents
    let isPartial = false
    if (customAmount !== undefined && customAmount !== null && customAmount !== '') {
      const parsed = parseFloat(customAmount)
      if (Number.isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ ok: false, error: `Invalid customAmount: ${customAmount}` })
      }
      const customCents = Math.round(parsed * 100)
      if (customCents > fullBondCents) {
        return res.status(400).json({ ok: false, error: `customAmount $${parsed.toFixed(2)} exceeds full bond $${(fullBondCents/100).toFixed(2)}. To charge more than the bond, use 'Charge for damages' on the saved card.` })
      }
      refundCents = customCents
      isPartial = customCents < fullBondCents
    }

    let refund
    try {
      refund = await refundBondPayment(hire.bondPaymentId, refundCents)
    } catch (refundErr) {
      return res.status(502).json({
        ok: false, code: 'SQUARE_REFUND_FAILED',
        error: refundErr.message, squareErrors: refundErr.squareErrors || null,
        hint: 'No money moved. Customer NOT emailed.',
      })
    }

    const isCompleted = refund.status === 'COMPLETED'
    const outcomeLabel = isPartial
      ? (isCompleted ? 'refunded_partial' : 'refund_pending_partial')
      : (isCompleted ? 'refunded' : 'refund_pending')
    const updated = update(hire.id, {
      status: 'returned',
      bondOutcome: outcomeLabel,
      returnedAt: now, bondOutcomeAt: now,
      refundId: refund.refundId, refundStatus: refund.status, refundCheckedAt: now,
      refundAmountCents: refundCents,
      withheldAmountCents: fullBondCents - refundCents,
    })
    try { await sendBalloonEmail('refund', updated) } catch (e) { console.error('[balloons] refund email fail:', e.message) }
    return res.json({ ok: true, hire: updated, refundStatus: refund.status,
      note: isCompleted ? 'Refund completed.' : 'Refund accepted PENDING. Will flip to refunded when Square confirms.' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
