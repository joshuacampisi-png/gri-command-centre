/**
 * staff-notify.js
 *
 * Fires a "money landed" email to staff whenever a bond payment lands or a
 * refund is issued. Separate from customer emails so we don't have to piggy-
 * back on BCC of contract emails to notice a real payment. Fires alongside
 * the existing Telegram notifications, so Josh gets both channels.
 *
 * Recipients: comma-separated STAFF_NOTIFY_EMAILS env var, or defaults to
 * hello@genderrevealideas.com.au + joshuacampisi@gmail.com.
 */

const DEFAULT_STAFF = ['hello@genderrevealideas.com.au', 'joshuacampisi@gmail.com']

function staffRecipients() {
  const env = process.env.STAFF_NOTIFY_EMAILS
  if (!env) return DEFAULT_STAFF
  return env.split(',').map(s => s.trim()).filter(Boolean)
}

function fromAddress() {
  const name = process.env.GMAIL_FROM_NAME || 'Gender Reveal Ideas'
  const email = process.env.RESEND_FROM_EMAIL || process.env.GMAIL_USER || 'hello@genderrevealideas.com.au'
  return `${name} <${email}>`
}

async function sendViaResendHttp({ from, to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${body.message || JSON.stringify(body).slice(0, 200)}`)
  return { messageId: body.id }
}

function fmtMoney(cents) {
  if (typeof cents !== 'number') return '?'
  return `$${(cents / 100).toFixed(2)} AUD`
}

/**
 * Send a bond-paid alert to staff.
 * @param {'tnt'|'balloon'} type
 * @param {object} hire
 * @param {object} extras { amountCents, source: 'checkout'|'webhook'|'poller'|'manual', paymentId }
 */
export async function notifyStaffBondPaid(type, hire, extras = {}) {
  try {
    const to = staffRecipients()
    if (!to.length) return
    const product = type === 'tnt' ? 'TNT Cannon' : 'Helium Balloon Box'
    const source = extras.source || 'unknown'
    const amount = fmtMoney(extras.amountCents)
    const paymentId = extras.paymentId || hire.bondPaymentId || '(none)'
    const isManual = String(paymentId).startsWith('manual_')
    const subject = `💰 BOND PAID — ${product} ${hire.orderNumber} — ${hire.customerName} — ${amount}`

    const lines = [
      `Bond payment received for ${product} hire ${hire.orderNumber}.`,
      ``,
      `Customer:      ${hire.customerName}`,
      `Email:         ${hire.customerEmail}`,
      `Phone:         ${hire.customerPhone || '(none)'}`,
      `Event date:    ${hire.eventDate || '(not set on order — call customer!)'}`,
      `Pickup:        ${hire.pickupLocation || 'Gold Coast HQ (default)'}`,
      ``,
      `Amount:        ${amount}`,
      `Source:        ${source}${isManual ? ' — MANUAL OVERRIDE (no Square money on record)' : ''}`,
      `Payment ID:    ${paymentId}`,
      `Paid at:       ${hire.bondPaidAt || new Date().toISOString()}`,
    ]

    if (hire.bondManualOverride) {
      lines.push(``, `Manual reason: ${hire.bondManualReason || '(not recorded)'}`)
    }

    lines.push(
      ``,
      `Order status: ${hire.status}`,
      `Contract: ${hire.contractStatus || 'not sent yet'}`,
      ``,
      `— Auto-notified by the Command Centre bond pipeline.`,
    )

    await sendViaResendHttp({ from: fromAddress(), to, subject, text: lines.join('\n') })
    console.log(`[staff-notify] Bond-paid email sent to ${to.join(', ')} for ${hire.orderNumber}`)
  } catch (e) {
    console.error(`[staff-notify] Failed to send bond-paid email for ${hire?.orderNumber}: ${e.message}`)
  }
}
