/**
 * square-cards.js
 * Card-on-file capability for Square via Customers + Cards + Payments APIs.
 *
 * Replaces the one-shot Quick Pay link with a flow that:
 *   1. Creates (or reuses) a Square Customer record for the hire's customer
 *   2. Tokenises the customer's card via the Web Payments SDK (client-side)
 *   3. Saves the tokenised card against the Customer record (Cards API)
 *   4. Charges the bond now (Payments API with source_id = saved card_id)
 *   5. Later, lets us charge ANY additional amount against that saved card
 *      for damage / late fees / re-bookings — no customer involvement.
 *
 * SAQ-A PCI: raw card data never touches our server. The Web Payments
 * SDK posts an iframe to Square and returns a short-lived nonce. We send
 * that nonce here and convert it into a long-lived card_id.
 *
 * Required env:
 *   SQUARE_ACCESS_TOKEN     — server-side Bearer
 *   SQUARE_LOCATION_ID      — for charging
 *   SQUARE_APPLICATION_ID   — exposed to client for the Web Payments SDK
 *   SQUARE_ENVIRONMENT      — 'sandbox' | 'production' (defaults to prod)
 */
import crypto from 'crypto'

const BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com'

const headers = () => ({
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-12-18',
})

/**
 * Find an existing Square Customer by email, or create one. Returns
 * { customerId, created: boolean }. Idempotent against subsequent
 * orders from the same email.
 */
export async function createOrGetCustomer({ email, firstName, lastName, phone, referenceId }) {
  if (!email) throw new Error('email is required to create/lookup a Square customer')

  // 1. Search by exact email first
  const searchRes = await fetch(`${BASE_URL}/v2/customers/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      query: {
        filter: { email_address: { exact: email.toLowerCase().trim() } },
      },
      limit: 1,
    }),
  })
  const searchBody = await searchRes.json()
  if (!searchRes.ok) {
    const msg = searchBody.errors?.map(e => e.detail).join('; ') || searchRes.statusText
    throw new Error(`Square customer search failed: ${msg}`)
  }
  const existing = searchBody.customers?.[0]
  if (existing) return { customerId: existing.id, created: false }

  // 2. Create a new customer
  const createRes = await fetch(`${BASE_URL}/v2/customers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      given_name: firstName || undefined,
      family_name: lastName || undefined,
      email_address: email.toLowerCase().trim(),
      phone_number: phone || undefined,
      reference_id: referenceId || undefined,
    }),
  })
  const createBody = await createRes.json()
  if (!createRes.ok) {
    const msg = createBody.errors?.map(e => e.detail).join('; ') || createRes.statusText
    throw new Error(`Square customer create failed: ${msg}`)
  }
  return { customerId: createBody.customer.id, created: true }
}

/**
 * Save a tokenised card (from the Web Payments SDK) against a Customer.
 * Returns { cardId, last4, expMonth, expYear, brand }.
 *
 * @param {string} customerId   the Square Customer ID
 * @param {string} sourceNonce  the cnon: token from Web Payments SDK
 * @param {string} verifyToken  optional Strong Customer Authentication token
 */
export async function saveCardForCustomer(customerId, sourceNonce, verifyToken) {
  if (!customerId) throw new Error('customerId required')
  if (!sourceNonce) throw new Error('sourceNonce required')

  const body = {
    idempotency_key: crypto.randomUUID(),
    source_id: sourceNonce,
    card: { customer_id: customerId },
  }
  if (verifyToken) body.verification_token = verifyToken

  const res = await fetch(`${BASE_URL}/v2/cards`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.errors?.map(e => `${e.code || ''}: ${e.detail || ''}`.trim()).join('; ') || res.statusText
    const err = new Error(`Square save card failed: ${msg}`)
    err.squareErrors = data.errors || []
    throw err
  }
  const c = data.card || {}
  return {
    cardId: c.id,
    last4: c.last_4,
    expMonth: c.exp_month,
    expYear: c.exp_year,
    brand: c.card_brand,
    cardholderName: c.cardholder_name || null,
  }
}

/**
 * Charge a saved card on file. Use this for the initial bond AND for any
 * later damage / late-fee charges. Idempotent on (cardId, amountCents,
 * idempotencyKey).
 *
 * Returns { paymentId, status, amountCents, receiptUrl }.
 */
export async function chargeCardOnFile({ cardId, customerId, amountCents, note, idempotencyKey }) {
  if (!cardId) throw new Error('cardId required')
  if (!amountCents || amountCents <= 0) throw new Error('amountCents must be positive')

  const body = {
    idempotency_key: idempotencyKey || crypto.randomUUID(),
    source_id: cardId, // saved-card ID acts as the source for the charge
    amount_money: { amount: amountCents, currency: 'AUD' },
    customer_id: customerId,
    location_id: process.env.SQUARE_LOCATION_ID,
    autocomplete: true, // capture immediately (no auth/capture split)
    note: note || 'GRI hire charge',
  }

  const res = await fetch(`${BASE_URL}/v2/payments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.errors?.map(e => `${e.code || ''}: ${e.detail || ''}`.trim()).join('; ') || res.statusText
    const err = new Error(`Square charge failed: ${msg}`)
    err.squareErrors = data.errors || []
    err.httpStatus = res.status
    throw err
  }
  const p = data.payment || {}
  return {
    paymentId: p.id,
    status: p.status,
    amountCents: p.amount_money?.amount,
    receiptUrl: p.receipt_url || null,
    raw: p,
  }
}

/**
 * Disable a saved card (e.g. customer requests removal or card expires).
 */
export async function disableCard(cardId) {
  if (!cardId) throw new Error('cardId required')
  const res = await fetch(`${BASE_URL}/v2/cards/${cardId}/disable`, {
    method: 'POST',
    headers: headers(),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.errors?.map(e => e.detail).join('; ') || res.statusText
    throw new Error(`Square disable card failed: ${msg}`)
  }
  return data.card
}

export function squareWebPaymentsEnv() {
  return {
    applicationId: process.env.SQUARE_APPLICATION_ID || '',
    locationId: process.env.SQUARE_LOCATION_ID || '',
    environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
  }
}
