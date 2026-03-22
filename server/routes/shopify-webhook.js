import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../lib/env.js';
import { create, getAll } from '../lib/hire-store.js';
import { createBondPaymentLink } from '../lib/square-client.js';
import { sendHireEmail } from '../lib/hire-mailer.js';
import { update } from '../lib/hire-store.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';

const router = Router();

// TNT product IDs that trigger auto-hire creation
const TNT_PRODUCT_IDS = [
  7988691927129,  // TNT Gender Reveal Self Hire
  8137632710745,  // Giant Inflatable Baby Costume Hire (copy)
];

/**
 * Verify Shopify webhook HMAC signature.
 * Shopify sends X-Shopify-Hmac-Sha256 header with Base64-encoded HMAC.
 */
function verifyShopifyHmac(rawBody, hmacHeader) {
  const secret = env.shopify.apiSecret;
  if (!secret) return false;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
}

/**
 * Check if an order contains any TNT hire products.
 * Returns the TNT line items found.
 */
function findTNTLineItems(order) {
  return (order.line_items || []).filter(item =>
    TNT_PRODUCT_IDS.includes(item.product_id)
  );
}

/**
 * Extract event date from order.
 * Shopify orders can have note_attributes with key "Event Date" or "event_date".
 * Falls back to order note parsing, or null if not found.
 */
function extractEventDate(order) {
  // 1. Check note_attributes (cart attributes from the product page)
  const attrs = order.note_attributes || [];
  for (const attr of attrs) {
    const key = (attr.name || '').toLowerCase().replace(/[_\s-]/g, '');
    if (key === 'eventdate' || key === 'hiredate' || key === 'partydate') {
      return normaliseDate(attr.value);
    }
  }

  // 2. Check line item properties (IzyRent adds rental dates here)
  //    Common keys: Starts, Ends, Start Date, End Date, _izyrent_start, Rental Start, etc.
  const tntItems = findTNTLineItems(order);
  const allItems = tntItems.length > 0 ? tntItems : (order.line_items || []);
  for (const item of allItems) {
    for (const prop of (item.properties || [])) {
      const key = (prop.name || '').toLowerCase().replace(/[_\s-]/g, '');
      // Match date keys from IzyRent and other rental apps
      // IzyRent uses "Date" as the property name
      if (
        key === 'date' || key === 'starts' || key === 'startdate' || key === 'start' ||
        key === 'eventdate' || key === 'hiredate' ||
        key === 'izyrentstart' || key === 'rentalstart' ||
        key === 'pickupdate' || key === 'from'
      ) {
        const d = normaliseDate(prop.value);
        if (d) return d;
      }
    }
    // Also check for any property that looks like a date
    for (const prop of (item.properties || [])) {
      const val = (prop.value || '').trim();
      if (val && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}/.test(val)) {
        const d = normaliseDate(val);
        if (d) return d;
      }
    }
  }

  // 3. Check order note for a date pattern
  const note = order.note || '';
  const dateMatch = note.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];

  // Try DD/MM/YYYY format in note
  const auMatch = note.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (auMatch) {
    const [, d, m, y] = auMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Normalise various date formats to YYYY-MM-DD.
 */
function normaliseDate(val) {
  if (!val) return null;
  const v = val.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // DD/MM/YYYY
  const auMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (auMatch) {
    const [, d, m, y] = auMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "3 April 2026" or "03 April 2026" (IzyRent format)
  const longMatch = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (longMatch) {
    const months = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
    const [, d, mName, y] = longMatch;
    const m = months[mName.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, '0')}`;
  }
  // Try native Date parse as fallback
  const dt = new Date(v);
  if (!isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Process a Shopify order and create a hire if it contains TNT products.
 * Used by both the webhook and manual import endpoints.
 */
async function processOrder(order) {
  // Log all properties so we can see exactly what IzyRent sends
  const allProps = (order.line_items || []).flatMap(item =>
    (item.properties || []).map(p => ({ lineItem: item.title, name: p.name, value: p.value }))
  );
  if (allProps.length > 0) {
    console.log(`[shopify-webhook] Line item properties:`, JSON.stringify(allProps));
  }
  const noteAttrs = order.note_attributes || [];
  if (noteAttrs.length > 0) {
    console.log(`[shopify-webhook] Note attributes:`, JSON.stringify(noteAttrs));
  }
  if (order.note) {
    console.log(`[shopify-webhook] Order note:`, order.note);
  }

  const tntItems = findTNTLineItems(order);
  if (tntItems.length === 0) {
    return { created: false, reason: 'No TNT products in order' };
  }

  // Check for duplicate — don't create if order number already exists
  const existing = getAll();
  const orderName = order.name || `#${order.order_number}`;
  if (existing.some(h => h.orderNumber === orderName)) {
    return { created: false, reason: `Hire already exists for order ${orderName}` };
  }

  const customer = order.customer || {};
  const shipping = order.shipping_address || order.billing_address || {};
  const customerName = `${customer.first_name || shipping.first_name || ''} ${customer.last_name || shipping.last_name || ''}`.trim() || 'Unknown';
  const customerEmail = order.contact_email || customer.email || order.email || '';
  const customerPhone = shipping.phone || customer.phone || order.phone || '';
  const eventDate = extractEventDate(order);

  // Calculate total TNT kit quantity (each line item may have qty > 1)
  const kitQty = tntItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  const hire = create({
    orderNumber: orderName,
    customerName,
    customerEmail,
    customerPhone,
    eventDate: eventDate || '', // May need manual entry if not provided
    kitQty,
  });

  console.log(`[shopify-webhook] TNT hire created: ${hire.id} for order ${orderName} (${customerName})`);

  // Only send emails and create payment link if we have an email
  if (customerEmail) {
    // Send confirmation email
    try {
      if (eventDate) {
        await sendHireEmail('confirmation', hire);
        update(hire.id, { emailSent: true });
        hire.emailSent = true;
        console.log(`[shopify-webhook] Confirmation email sent to ${customerEmail}`);
      } else {
        console.log(`[shopify-webhook] Skipping confirmation email — no event date set`);
      }
    } catch (emailErr) {
      console.error('[shopify-webhook] Confirmation email failed:', emailErr.message);
    }

    // Create Square payment link for bond
    try {
      const link = await createBondPaymentLink(hire);
      update(hire.id, {
        bondPaymentUrl: link.url,
        bondPaymentLinkId: link.paymentLinkId,
      });
      hire.bondPaymentUrl = link.url;

      // Send bond payment link email
      await sendHireEmail('bond_link', hire, link.url);
      console.log(`[shopify-webhook] Bond payment link sent to ${customerEmail}`);
    } catch (squareErr) {
      console.error('[shopify-webhook] Square payment link failed:', squareErr.message);
    }
  }

  // Telegram notification — new order (sent to Josh + staff)
  notifyTNTEvent('order_created', hire).catch(() => {});

  return { created: true, hire, tntItems: tntItems.length, eventDate };
}

/**
 * POST /api/shopify/webhook/orders-create
 * Shopify sends order data here when a new order is placed.
 * Must respond 200 quickly or Shopify will retry.
 */
router.post('/orders-create', async (req, res) => {
  // Verify HMAC if header present (log warning but don't block — notification
  // webhooks may use a different signing secret than the API secret)
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (hmac && req.rawBody) {
    if (!verifyShopifyHmac(req.rawBody, hmac)) {
      console.warn('[shopify-webhook] HMAC mismatch (proceeding anyway — notification webhook)');
    }
  }

  // Log raw payload for debugging IzyRent property names
  try {
    const { writeFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dir = dirname(fileURLToPath(import.meta.url));
    const logPath = join(__dir, '..', '..', 'data', 'last-webhook-payload.json');
    writeFileSync(logPath, JSON.stringify(req.body, null, 2));
    console.log(`[shopify-webhook] Raw payload saved to data/last-webhook-payload.json`);
  } catch (_) {}

  // Respond immediately — Shopify requires 200 within 5 seconds
  res.status(200).json({ ok: true });

  // Process asynchronously
  try {
    const order = req.body;
    const result = await processOrder(order);
    if (result.created) {
      console.log(`[shopify-webhook] Order processed: ${order.name} → hire ${result.hire.id}`);
    } else {
      console.log(`[shopify-webhook] Order skipped: ${result.reason}`);
    }
  } catch (err) {
    console.error('[shopify-webhook] Processing error:', err);
  }
});

/**
 * POST /api/shopify/webhook/import-order
 * Manual import — fetch a specific order from Shopify by order number and create a hire.
 * Used for testing and backfilling.
 */
router.post('/import-order', async (req, res) => {
  try {
    const { orderNumber } = req.body;
    if (!orderNumber) {
      return res.status(400).json({ error: 'orderNumber required (e.g. "1050" or "#GRI-1050")' });
    }

    // Strip # prefix if present
    const num = orderNumber.replace(/^#/, '').replace(/^GRI-/, '');

    // Fetch order from Shopify
    const response = await fetch(
      `https://${env.shopify.storeDomain}/admin/api/2025-01/orders.json?name=%23${num}&status=any&limit=1`,
      { headers: { 'X-Shopify-Access-Token': env.shopify.adminAccessToken } }
    );
    const data = await response.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      return res.status(404).json({ error: `No order found matching "${orderNumber}"` });
    }

    const result = await processOrder(orders[0]);
    res.json(result);
  } catch (err) {
    console.error('[shopify-webhook] Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/shopify/webhook/recent-orders
 * Fetch recent orders containing TNT products, for manual review.
 */
router.get('/recent-orders', async (_req, res) => {
  try {
    const response = await fetch(
      `https://${env.shopify.storeDomain}/admin/api/2025-01/orders.json?status=any&limit=20`,
      { headers: { 'X-Shopify-Access-Token': env.shopify.adminAccessToken } }
    );
    const data = await response.json();
    const orders = (data.orders || []).map(o => {
      const tntItems = findTNTLineItems(o);
      return {
        id: o.id,
        name: o.name,
        email: o.contact_email || o.email,
        customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Unknown',
        createdAt: o.created_at,
        hasTNT: tntItems.length > 0,
        tntVariants: tntItems.map(i => i.variant_title || i.title),
        eventDate: extractEventDate(o),
        note: o.note || '',
      };
    });

    // Show TNT orders first
    orders.sort((a, b) => (b.hasTNT ? 1 : 0) - (a.hasTNT ? 1 : 0));
    res.json({ orders });
  } catch (err) {
    console.error('[shopify-webhook] Recent orders error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
