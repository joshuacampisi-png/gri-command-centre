import { Router } from 'express';
import crypto from 'crypto';
import { getAll, getById, update } from '../lib/hire-store.js';
import { sendHireEmail } from '../lib/hire-mailer.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';
import { env } from '../lib/env.js';

const router = Router();

const JOSH_CHAT = '8040702286';

/**
 * Send contract email after bond is paid.
 */
async function sendContractAfterBond(hire) {
  const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8787}`;
  const signingUrl = `${baseUrl}/api/contract/${hire.id}/sign`;

  await sendHireEmail('contract', hire, signingUrl);

  update(hire.id, {
    contractStatus: 'sent',
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
      // 1. bondPaymentLinkId or bondPaymentId
      // 2. Order number in the payment note
      const hires = getAll();
      let matchedHire = null;

      // Try matching by payment note (contains order number)
      for (const h of hires) {
        if (h.bondStatus === 'paid') continue; // Already processed

        // Match by order number in note
        if (h.orderNumber && note.includes(h.orderNumber)) {
          matchedHire = h;
          break;
        }
      }

      // Fallback — match any pending hire with bond amount $200
      if (!matchedHire && amountCents === 20000) {
        matchedHire = hires.find(h =>
          h.bondStatus === 'pending' && h.bondPaymentUrl
        );
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
