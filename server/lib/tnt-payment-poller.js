import cron from 'node-cron'
import { getAll, getById, update } from './hire-store.js'
import { sendHireEmail } from './hire-mailer.js'
import { notifyTNTEvent } from './tnt-telegram.js'
import { notifyStaffBondPaid } from './staff-notify.js'
import { findCompletedPaymentByOrder } from './square-payment-verify.js'

let cronJob = null

/**
 * Poll Square PAYMENTS API for pending bonds. This function ONLY flips a hire
 * to "paid" when a real COMPLETED payment exists in Square whose note contains
 * the order number AND whose amount matches the expected bond.
 *
 * The old implementation queried the Orders API and considered a bond paid if
 * the order had ANY tender other than NO_SALE — but Square creates a tender the
 * moment a customer opens the hosted checkout, before any card is charged. That
 * caused false-positive bond-paid notifications and downstream refunds of money
 * that had never been collected.
 */
async function checkPendingBonds() {
  const hires = getAll()
  const pending = hires.filter(h => h.bondStatus === 'pending')
  if (pending.length === 0) return

  const tntBase = parseInt(process.env.TNT_BOND_AMOUNT || '200', 10)

  for (const hire of pending) {
    try {
      const expectedCents = tntBase * 100 * (hire.kitQty || 1)
      const match = await findCompletedPaymentByOrder(hire.orderNumber, expectedCents)
      if (!match) continue

      console.log(`[TNT-Poller] Real COMPLETED payment found for ${hire.orderNumber} — payment ${match.id}`)

      update(hire.id, {
        bondStatus: 'paid',
        bondPaymentId: match.id,
        bondOrderId: match.order_id,
        bondPaidAt: match.created_at || new Date().toISOString(),
        status: hire.status === 'confirmed' ? 'bond_paid' : hire.status,
      })

      const updatedHire = getById(hire.id)
      const { buildSigningUrl } = await import('./contract-signing-token.js')
      const orderNum = (hire.orderNumber || '').replace(/^#/, '')
      const signingUrl = buildSigningUrl(orderNum)

      try {
        await sendHireEmail('contract', updatedHire, signingUrl)
        update(hire.id, {
          contractStatus: 'sent',
          contractSentAt: new Date().toISOString(),
          status: 'contract_sent',
        })
        console.log(`[TNT-Poller] Contract auto-sent for ${hire.id}`)
      } catch (e) {
        console.error(`[TNT-Poller] Contract send failed for ${hire.id}:`, e.message)
      }

      notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {})
      notifyStaffBondPaid('tnt', getById(hire.id), { amountCents: match.amount_money?.amount, source: 'poller', paymentId: match.id }).catch(() => {})
    } catch (e) {
      console.error(`[TNT-Poller] Error checking ${hire.orderNumber}:`, e.message)
    }
  }
}

export function startTNTPaymentPoller() {
  // Every 5 minutes
  cronJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await checkPendingBonds()
    } catch (e) {
      console.error('[TNT-Poller] Poll failed:', e.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[TNT-Poller] Payment poller started (every 5 min)')

  // Boot-time sync: pull any missing TNT orders from Shopify + reconcile Square payments
  setTimeout(async () => {
    try {
      const baseUrl = `http://127.0.0.1:${process.env.PORT || 8787}`
      const syncRes = await fetch(`${baseUrl}/api/hires/sync`, { method: 'POST' })
      const syncData = await syncRes.json()
      console.log(`[TNT-Poller] Boot sync: created=${syncData.created}, skipped=${syncData.skipped}`)

      const reconcileRes = await fetch(`${baseUrl}/api/hires/reconcile-payments`, { method: 'POST' })
      const reconcileData = await reconcileRes.json()
      console.log(`[TNT-Poller] Boot reconcile: matched=${reconcileData.reconciled}`)
    } catch (e) {
      console.error('[TNT-Poller] Boot sync failed:', e.message)
    }
  }, 15000)
}

export function stopTNTPaymentPoller() {
  if (cronJob) { cronJob.stop(); cronJob = null }
}
