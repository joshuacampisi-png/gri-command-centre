/**
 * square-payment-verify.js
 *
 * The single source of truth for "has Square actually seen this bond payment
 * COMPLETED?". Every path that flips bondStatus → 'paid' must consult this
 * module — either via `verifyCompletedPayment(paymentId)` when the caller
 * already has a Square payment ID, or via `findCompletedPaymentByOrder(...)`
 * when it only has the hire's order number + expected bond amount.
 *
 * Why this exists: we were flipping bonds to paid based on:
 *   - staff clicking "mark paid" with an auto-generated placeholder ID
 *   - the tenders array on a Square Order (which fills up the moment a
 *     customer opens the hosted checkout, before any money changes hands)
 * Both mechanics generated bond-paid notifications with no real payment,
 * causing us to refund money we never received.
 *
 * Everything here talks to LIVE Square. No local caching. Read-only.
 */

const BASE_URL = () => process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com'

const headers = () => ({
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-12-18',
})

// Real Square payment IDs are 22+ alphanumeric chars.
// Anything else (sq_terminal_xxx, manual_xxx, historical_backfill, cash_xxx)
// is a locally-generated placeholder that cannot be verified via API.
export function isRealSquarePaymentId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]{20,}$/.test(id)
}

/**
 * Verify a Square payment ID actually exists AND is COMPLETED.
 * Throws with a descriptive error on any non-COMPLETED status or lookup failure.
 * Returns the raw payment object on success.
 */
export async function verifyCompletedPayment(paymentId) {
  if (!paymentId) throw new Error('paymentId required')
  if (!isRealSquarePaymentId(paymentId)) {
    throw new Error(`Not a real Square payment ID: ${JSON.stringify(paymentId)}`)
  }
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN not configured')

  const res = await fetch(`${BASE_URL()}/v2/payments/${paymentId}`, { headers: headers() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.errors?.map(e => e.detail).join('; ') || res.statusText
    throw new Error(`Square GET payment failed (${res.status}): ${msg}`)
  }
  const p = data.payment
  if (!p) throw new Error('Square returned no payment body')
  if (p.status !== 'COMPLETED') {
    throw new Error(`Payment ${paymentId} status is ${p.status}, not COMPLETED — bond NOT paid`)
  }
  return p
}

/**
 * Look for a real COMPLETED payment matching this hire.
 * Matches on payment.note containing the order number (stripped of leading #),
 * AND (if expectedCents is provided) the payment amount matching.
 *
 * Only returns a payment if status === COMPLETED. Returns null when nothing matches.
 */
export async function findCompletedPaymentByOrder(orderNumber, expectedCents = null, limit = 50) {
  if (!orderNumber) throw new Error('orderNumber required')
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN not configured')

  const norm = String(orderNumber).replace(/^#/, '')
  const res = await fetch(
    `${BASE_URL()}/v2/payments?sort_order=DESC&limit=${limit}`,
    { headers: headers() },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.errors?.map(e => e.detail).join('; ') || res.statusText
    throw new Error(`Square LIST payments failed (${res.status}): ${msg}`)
  }
  const payments = data.payments || []
  const match = payments.find(p =>
    p.status === 'COMPLETED' &&
    p.note && p.note.includes(norm) &&
    (expectedCents == null || p.amount_money?.amount === expectedCents)
  )
  return match || null
}
