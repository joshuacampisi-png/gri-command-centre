import { Router } from 'express';
import crypto from 'crypto';
import { getAll, getById, update } from '../lib/hire-store.js';
import { sendHireEmail } from '../lib/hire-mailer.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';
import { env } from '../lib/env.js';
import { buildSigningUrl } from '../lib/contract-signing-token.js';

const router = Router();

const JOSH_CHAT = '8040702286';

/**
 * Send contract email after bond is paid.
 */
async function sendContractAfterBond(hire) {
  const orderNum = (hire.orderNumber || '').replace(/^#/, '');
  const signingUrl = buildSigningUrl(orderNum);

  await sendHireEmail('contract', hire, signingUrl);

  update(hire.id, {
    contractStatus: 'sent',
    contractSentAt: new Date().toISOString(),
    status: 'contract_sent',
  });

  console.log(`[square-webhook] Contract auto-sent for hire ${hire.id} — signing URL: ${signingUrl}`);
}

/**
 * POST /api/square/webhook
 * Square sends payment events here.
 * Handles: payment.completed
 */
router.post('/', async (req, res) => {
  // Respond 200 immediately — Square requires fast response
  res.status(200).json({ ok: true });

  try {
    const event = req.body;
    const eventType = event.type;

    console.log(`[square-webhook] Received event: ${eventType}`);

    if (eventType === 'payment.completed' || eventType === 'payment.updated') {
      const payment = event.data?.object?.payment;
      if (!payment) {
        console.log('[square-webhook] No payment data in event');
        return;
      }

      const paymentId = payment.id;
      const orderId = payment.order_id;
      const status = payment.status;
      const note = payment.note || '';
      const amountCents = payment.amount_money?.amount;

      console.log(`[square-webhook] Payment ${paymentId} — status: ${status}, amount: ${amountCents}, note: ${note}`);

      // Only process COMPLETED payments
      if (status !== 'COMPLETED') {
        console.log(`[square-webhook] Payment not completed (${status}) — skipping`);
        return;
      }

      // Find the matching hire by:
      // 1. Match by payment.order_id against hire.bondOrderId
      // 2. Order number in the payment note
      // 3. Fallback: match any pending hire with correct bond amount
      const hires = getAll();
      let matchedHire = null;

      // Strategy 1: Match by Square order_id against stored bondOrderId
      if (orderId) {
        matchedHire = hires.find(h =>
          h.bondStatus !== 'paid' && h.bondOrderId && h.bondOrderId === orderId
        );
        if (matchedHire) console.log(`[square-webhook] Matched by bondOrderId: ${orderId}`);
      }

      // Strategy 2: Match by order number in payment note
      if (!matchedHire) {
        for (const h of hires) {
          if (h.bondStatus === 'paid') continue;
          if (h.orderNumber && note.includes(h.orderNumber)) {
            matchedHire = h;
            console.log(`[square-webhook] Matched by note containing: ${h.orderNumber}`);
            break;
          }
        }
      }

      // Strategy 3: Fallback — match any pending hire with correct bond amount
      // $200 (20000c) for 1 kit, $400 (40000c) for 2 kits
      if (!matchedHire) {
        matchedHire = hires.find(h => {
          if (h.bondStatus !== 'pending' || !h.bondPaymentUrl) return false;
          const expectedCents = (h.kitQty || 1) >= 2 ? 40000 : 20000;
          return amountCents === expectedCents;
        });
        if (matchedHire) console.log(`[square-webhook] Matched by fallback amount: ${amountCents}c`);
      }

      if (!matchedHire) {
        console.log(`[square-webhook] No matching hire found for payment ${paymentId}`);
        return;
      }

      console.log(`[square-webhook] Matched payment to hire ${matchedHire.id} (${matchedHire.orderNumber})`);

      // Update hire — bond is paid
      update(matchedHire.id, {
        bondStatus: 'paid',
        bondPaymentId: paymentId,
        bondPaidAt: new Date().toISOString(),
        status: matchedHire.status === 'confirmed' ? 'bond_paid' : matchedHire.status,
      });

      const updatedHire = getById(matchedHire.id);

      // Auto-send contract email
      try {
        await sendContractAfterBond(updatedHire);
      } catch (contractErr) {
        console.error('[square-webhook] Auto-send contract failed:', contractErr.message);
      }

      // Telegram notification — bond paid
      notifyTNTEvent('bond_paid', getById(matchedHire.id)).catch(() => {});
    }
  } catch (err) {
    console.error('[square-webhook] Processing error:', err);
  }
});

export default router;
