import cron from 'node-cron'
import { getAll, getById, update } from './hire-store.js'
import { sendHireEmail } from './hire-mailer.js'
import { notifyTNTEvent } from './tnt-telegram.js'

let cronJob = null

async function checkPendingBonds() {
  const hires = getAll()
  const pending = hires.filter(h => h.bondStatus === 'pending' && h.bondOrderId)

  if (pending.length === 0) return

  for (const hire of pending) {
    try {
      // Query Square for the order to check if it has a payment
      const BASE_URL = process.env.SQUARE_ENVIRONMENT === 'sandbox'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com'

      const res = await fetch(`${BASE_URL}/v2/orders/${hire.bondOrderId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Square-Version': '2024-12-18',
        }
      })
      const data = await res.json()
      const order = data.order

      if (!order) continue

      // Check if order is paid
      const isPaid = order.state === 'COMPLETED' ||
                     (order.tenders && order.tenders.length > 0 && order.tenders[0].type !== 'NO_SALE')

      if (!isPaid) continue

      // Get payment ID from tenders
      const paymentId = order.tenders?.[0]?.payment_id || null

      console.log(`[TNT-Poller] Bond paid for ${hire.id} (${hire.orderNumber}) — payment: ${paymentId}`)

      // Mark bond as paid
      update(hire.id, {
        bondStatus: 'paid',
        bondPaymentId: paymentId,
        bondPaidAt: new Date().toISOString(),
        status: hire.status === 'confirmed' ? 'bond_paid' : hire.status,
      })

      // Auto-send contract
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

      // Telegram notification
      notifyTNTEvent('bond_paid', getById(hire.id)).catch(() => {})

    } catch (e) {
      console.error(`[TNT-Poller] Error checking ${hire.id}:`, e.message)
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
  }, 15000) // 15s after boot to let server fully start
}

export function stopTNTPaymentPoller() {
  if (cronJob) { cronJob.stop(); cronJob = null }
}
