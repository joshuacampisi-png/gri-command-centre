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
 * Refund a Square payment by payment ID.
 * Returns { refundId, status }
 */
export async function refundBondPayment(paymentId, amountCents = 20000) {
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
    const errMsg = data.errors?.map(e => e.detail).join('; ') || res.statusText;
    throw new Error(`Square refund failed: ${errMsg}`);
  }

  return {
    refundId: data.refund.id,
    status: data.refund.status,
  };
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
