import crypto from 'crypto';

const BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';

const headers = () => ({
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-12-18',
});

/**
 * Create a Square payment link for bond collection ($200 AUD).
 * Returns { url, paymentLinkId, orderId }
 */
export async function createBondPaymentLink(hire) {
  const idempotencyKey = crypto.randomUUID();
  const bondCents = (hire.kitQty || 1) >= 2 ? 40000 : 20000;

  const body = {
    idempotency_key: idempotencyKey,
    quick_pay: {
      name: `TNT Cannon Bond${(hire.kitQty || 1) >= 2 ? ' (x2 Kits)' : ''} — ${hire.orderNumber}`,
      price_money: {
        amount: bondCents,
        currency: 'AUD',
      },
      location_id: process.env.SQUARE_LOCATION_ID,
    },
    checkout_options: {
      allow_tipping: false,
    },
    payment_note: `Bond $${bondCents / 100} for TNT Gender Reveal Cannon hire ${hire.orderNumber} — ${hire.customerName}`,
  };

  const res = await fetch(`${BASE_URL}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data.errors?.map(e => e.detail).join('; ') || res.statusText;
    throw new Error(`Square payment link failed: ${errMsg}`);
  }

  return {
    url: data.payment_link.url,
    paymentLinkId: data.payment_link.id,
    orderId: data.related_resources?.orders?.[0]?.id || null,
  };
}

/**
 * Recognise placeholder / non-Square payment IDs. Square real IDs are
 * 25–32 char base32-style strings (e.g. "abCdEfGh1234567890ABCDEfg").
 * Anything else is something we generated locally and CANNOT be refunded
 * via the Square API.
 */
export function isRealSquarePaymentId(paymentId) {
  if (!paymentId || typeof paymentId !== 'string') return false;
  const fakePrefixes = ['sq_terminal_', 'manual_', 'historical_', 'historical_backfill', 'test_'];
  if (fakePrefixes.some(p => paymentId.startsWith(p))) return false;
  if (paymentId === 'historical_backfill') return false;
  // Real Square payment IDs are 20+ chars, alphanumeric. Reject obvious junk.
  if (paymentId.length < 20) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(paymentId)) return false;
  return true;
}

/**
 * Refund a Square payment by payment ID.
 * Returns { refundId, status, raw } where status is one of:
 *   PENDING   — Square is still processing (can take hours, up to 14 days for cards)
 *   COMPLETED — money has been sent back to the buyer
 *   FAILED    — refund failed, no money moved
 *   REJECTED  — refund rejected by Square / card network, no money moved
 *
 * IMPORTANT: callers MUST treat anything other than COMPLETED/PENDING as a
 * failure, and must NOT tell the customer they have been refunded until the
 * status reaches COMPLETED (typically via the refund.updated webhook).
 */
export async function refundBondPayment(paymentId, amountCents = 20000) {
  if (!isRealSquarePaymentId(paymentId)) {
    throw new Error(
      `Cannot refund: bondPaymentId "${paymentId}" is a local placeholder, not a real Square payment ID. ` +
      `This happens when the bond was marked paid manually or as a historical backfill. ` +
      `Process the refund manually in the Square dashboard.`
    );
  }

  const idempotencyKey = crypto.randomUUID();

  const body = {
    idempotency_key: idempotencyKey,
    payment_id: paymentId,
    amount_money: {
      amount: amountCents,
      currency: 'AUD',
    },
    reason: 'TNT Cannon bond refund — equipment returned in good condition',
  };

  const res = await fetch(`${BASE_URL}/v2/refunds`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data.errors?.map(e => `${e.code || ''}: ${e.detail || ''}`.trim()).join('; ') || res.statusText;
    const err = new Error(`Square refund API rejected request: ${errMsg}`);
    err.squareErrors = data.errors || [];
    err.httpStatus = res.status;
    throw err;
  }

  const refund = data.refund || {};
  const status = refund.status; // PENDING | COMPLETED | FAILED | REJECTED

  if (status === 'FAILED' || status === 'REJECTED') {
    const err = new Error(
      `Square refund returned ${status}. Reason: ${refund.reason || 'no reason given'}. ` +
      `No money has been moved. Check the Square dashboard.`
    );
    err.refundId = refund.id;
    err.status = status;
    throw err;
  }

  return {
    refundId: refund.id,
    status, // PENDING or COMPLETED
    amountCents: refund.amount_money?.amount,
    raw: refund,
  };
}

/**
 * Look up a refund by ID — used by webhook + audit endpoints to confirm
 * the actual current status with Square (not just what we cached locally).
 */
export async function getRefund(refundId) {
  const res = await fetch(`${BASE_URL}/v2/refunds/${refundId}`, {
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Square get refund failed: ${data.errors?.[0]?.detail || res.statusText}`);
  }
  return data.refund;
}

/**
 * Get payment details by payment ID.
 */
export async function getPayment(paymentId) {
  const res = await fetch(`${BASE_URL}/v2/payments/${paymentId}`, {
    headers: headers(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Square get payment failed: ${data.errors?.[0]?.detail || res.statusText}`);
  }

  return data.payment;
}
