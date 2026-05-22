/**
 * balloon-square.js
 * Thin wrapper around square-client.js for balloon-box-specific bond
 * payment links. Uses different copy and bond amount, but shares the
 * exact same Refunds API + idempotency guards as TNT.
 */
import crypto from 'crypto';

const BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';

const headers = () => ({
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-12-18',
});

// Bond scales linearly with box quantity: $200 × boxQty.
// 1 box = $200, 2 boxes = $400, 3 boxes = $600, etc.
function bondCents(hire) {
  const base = parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10);
  return base * 100 * (hire.boxQty || 1);
}

/**
 * Create a Square payment link for balloon-box bond.
 * Returns { url, paymentLinkId, orderId }
 */
export async function createBalloonBondPaymentLink(hire) {
  const idempotencyKey = crypto.randomUUID();
  const amount = bondCents(hire);
  const dollars = (amount / 100).toFixed(0);
  const qtySuffix = (hire.boxQty || 1) >= 2 ? ` (x${hire.boxQty} Boxes)` : '';

  const body = {
    idempotency_key: idempotencyKey,
    quick_pay: {
      name: `Helium Balloon Box Bond${qtySuffix} — ${hire.orderNumber}`,
      price_money: { amount, currency: 'AUD' },
      location_id: process.env.SQUARE_LOCATION_ID,
    },
    checkout_options: { allow_tipping: false },
    payment_note: `Bond $${dollars} for Helium Balloon Box hire ${hire.orderNumber} — ${hire.customerName}`,
  };

  const res = await fetch(`${BASE_URL}/v2/online-checkout/payment-links`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
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

export function balloonBondCents(hire) { return bondCents(hire); }
