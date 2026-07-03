import { Router } from 'express';
import crypto from 'crypto';
import { getAll, getById, update } from '../lib/hire-store.js';
import { sendHireEmail } from '../lib/hire-mailer.js';
import { notifyTNTEvent } from '../lib/tnt-telegram.js';
import { env } from '../lib/env.js';
import { buildSigningUrl } from '../lib/contract-signing-token.js';
import { getAll as getAllBalloons, getById as getBalloonById, update as updateBalloon } from '../lib/balloon-store.js';
import { sendBalloonEmail } from '../lib/balloon-mailer.js';
import { notifyBalloonEvent } from '../lib/balloon-telegram.js';
import { balloonBondCents } from '../lib/balloon-square.js';

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

    // ── Refund events ────────────────────────────────────────────────
    // Square fires refund.created → refund.updated as the refund moves
    // PENDING → COMPLETED (or FAILED/REJECTED). We MUST listen so a refund
    // that fails after we already told the customer it was on the way gets
    // flagged for Josh, instead of being silently invisible.
    if (eventType === 'refund.created' || eventType === 'refund.updated') {
      const refund = event.data?.object?.refund;
      if (!refund) {
        console.log('[square-webhook] No refund data in event');
        return;
      }
      const refundId = refund.id;
      const refundStatus = refund.status; // PENDING | COMPLETED | FAILED | REJECTED
      const paymentId = refund.payment_id;

      console.log(`[square-webhook] Refund ${refundId} payment=${paymentId} status=${refundStatus}`);

      // Try TNT first, then balloon hires
      const hires = getAll();
      let hire = hires.find(h => h.refundId === refundId || (h.bondPaymentId && h.bondPaymentId === paymentId));
      let isBalloon = false;
      if (!hire) {
        const bHires = getAllBalloons();
        hire = bHires.find(h => h.refundId === refundId || (h.bondPaymentId && h.bondPaymentId === paymentId));
        if (hire) isBalloon = true;
      }
      if (!hire) {
        console.log(`[square-webhook] No matching hire for refund ${refundId}`);
        return;
      }

      const now = new Date().toISOString();
      const patch = { refundStatus, refundCheckedAt: now, refundId };
      if (refundStatus === 'COMPLETED') {
        patch.bondOutcome = 'refunded';
        patch.bondOutcomeAt = patch.bondOutcomeAt || now;
      } else if (refundStatus === 'FAILED' || refundStatus === 'REJECTED') {
        patch.bondOutcome = 'refund_failed';
        patch.refundFailureReason = refund.reason || `Square reported ${refundStatus}`;
      } else if (refundStatus === 'PENDING') {
        patch.bondOutcome = 'refund_pending';
      }
      if (isBalloon) {
        updateBalloon(hire.id, patch);
        if (refundStatus === 'FAILED' || refundStatus === 'REJECTED') {
          notifyBalloonEvent('refund_failed', { ...getBalloonById(hire.id), refundId, refundStatus }).catch(() => {});
        }
      } else {
        update(hire.id, patch);
        if (refundStatus === 'FAILED' || refundStatus === 'REJECTED') {
          notifyTNTEvent('refund_failed', { ...getById(hire.id), refundId, refundStatus }).catch(() => {});
        }
      }
      return;
    }

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

      // ── Try BALLOON hires FIRST. The payment note for balloon bonds
      // contains the literal string "Helium Balloon Box" so we can route
      // unambiguously even when an order has both products.
      const isBalloonPayment = /Helium Balloon Box|Balloon Box Bond/i.test(note);
      if (isBalloonPayment) {
        const bHires = getAllBalloons();
        let b = null;
        if (orderId) b = bHires.find(h => h.bondStatus !== 'paid' && h.bondOrderId === orderId);
        if (!b) {
          for (const h of bHires) {
            if (h.bondStatus === 'paid') continue;
            if (h.orderNumber && note.includes(h.orderNumber.replace('#', ''))) { b = h; break; }
          }
        }
        // (Removed: amount-only fallback for balloons — could route an unrelated
        //  $200 payment to any pending balloon hire with the same bond amount.)
        if (b) {
          console.log(`[square-webhook] Matched BALLOON payment → hire ${b.id} (${b.orderNumber})`);
          updateBalloon(b.id, {
            bondStatus: 'paid', bondPaymentId: paymentId, bondPaidAt: new Date().toISOString(),
            status: b.status === 'confirmed' ? 'bond_paid' : b.status,
          });
          const updated = getBalloonById(b.id);
          // Auto-send balloon contract
          try {
            const orderNum = (updated.orderNumber || '').replace(/^#/, '');
            const signingUrl = buildSigningUrl(orderNum).replace('/sign/', '/sign-balloon/');
            await sendBalloonEmail('contract', updated, signingUrl);
            updateBalloon(updated.id, { contractStatus: 'sent', contractSentAt: new Date().toISOString(), status: 'contract_sent' });
          } catch (e) { console.error('[square-webhook] balloon contract send failed:', e.message); }
          notifyBalloonEvent('bond_paid', getBalloonById(b.id)).catch(() => {});
          return;
        }
        console.log('[square-webhook] Balloon-tagged payment did not match any pending balloon hire — falling through to TNT match');
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

      // Strategy 3 (REMOVED — used to match any pending hire with the correct
      // bond amount. That risks routing an unrelated $200 Square payment to a
      // pending hire that happens to have the same bond. Only strict order-id
      // + order-number-in-note matches are allowed now.)

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
