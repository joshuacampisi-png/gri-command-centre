/**
 * Morning Brief — PABLO SYSTEM UPDATE
 * Fires at 5:00am AEST (19:00 UTC) daily.
 * GRI only. Sent to Josh via Telegram.
 *
 * Format:
 *   ☀️ PABLO MORNING BRIEF — [Day, Date] — GRI
 *   OVERNIGHT ACTIVITY
 *   TOP PRIORITY TODAY
 *   YOUR APPROVAL QUEUE
 *   SEO SCORE
 *   SYSTEM STATUS
 */

import { env } from './env.js'
import { getNotionSnapshot } from '../connectors/notion.js'
import { getFlywheelStatus } from './flywheel.js'
import { getExecutorStatus } from './executor.js'

const JOSH_CHAT = '8040702286'

async function sendTelegram(text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: JOSH_CHAT, text, parse_mode: 'Markdown' })
    })
    const data = await res.json()
    if (!data.ok) console.error('[Morning Brief] Telegram error:', data.description)
  } catch (e) {
    console.error('[Morning Brief] Telegram error:', e.message)
  }
}

/** Calculate ms until next occurrence of a UTC time */
function msUntilNextUTCTime(utcHour, utcMinute = 0) {
  const now = new Date()
  const target = new Date(now)
  target.setUTCHours(utcHour, utcMinute, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  return Math.max(0, target.getTime() - now.getTime())
}

let briefActive = false

export function startMorningBrief() {
  if (briefActive) return
  briefActive = true

  const scheduleBrief = () => {
    // 5am AEST = 19:00 UTC (Queensland, no daylight saving)
    const msUntil = msUntilNextUTCTime(19, 0)
    const nextRun = new Date(Date.now() + msUntil)
    console.log(`[Morning Brief] Next brief: ${nextRun.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)
    setTimeout(async () => {
      await sendMorningBrief()
      scheduleBrief() // reschedule for tomorrow
    }, msUntil)
  }
  scheduleBrief()
  console.log('[Morning Brief] ☀️ Scheduler active — fires at 5:00am AEST daily')
}

export async function sendMorningBrief() {
  console.log('[Morning Brief] Generating executive briefing...')
  
  // Use new executive briefing system
  const { sendExecutiveBriefing } = await import('./executive-briefing.js')
  const result = await sendExecutiveBriefing()
  
  if (result.ok) {
    console.log('[Morning Brief] ✅ Executive briefing sent successfully')
    return result.briefing
  }
  
  // Fallback to simple brief if executive briefing fails
  console.error('[Morning Brief] Executive briefing failed, sending fallback...')
  
  const aestNow = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  let briefText = `☀️ *PABLO MORNING BRIEF — ${aestNow} — GRI*\n\n`

  try {
    // Pull Notion snapshot for GRI
    const snapshot = await getNotionSnapshot('GRI')
    const tasks = snapshot.tasks || []

    // Count by status
    const backlog    = tasks.filter(t => t.status === 'Backlog')
    const approval   = tasks.filter(t => t.status === 'Approval')
    const inProgress = tasks.filter(t => t.status === 'In Progress')
    const completed  = tasks.filter(t => ['Completed', 'Done', 'Live'].includes(t.status))

    // Overnight: tasks created in last 8 hours
    const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000
    const overnight = tasks.filter(t => {
      if (!t.createdAt) return false
      return new Date(t.createdAt).getTime() > eightHoursAgo
    })
    const newIssues = overnight.length

    // Duplicates skipped (from flywheel stats)
    const flywheelStats = getFlywheelStatus().stats || {}
    const skipped = flywheelStats.tasksDeduplicated || 0

    briefText += `*OVERNIGHT ACTIVITY*\n`
    briefText += `• New issues found: ${newIssues}\n`
    briefText += `• Tasks queued for approval: ${approval.length}\n`
    briefText += `• Duplicate issues skipped: ${skipped} (already in your queue)\n\n`

    // Top priority: highest severity Backlog task
    const highPriority = [...backlog, ...approval]
      .filter(t => t.taskType === 'SEO')
      .sort((a, b) => {
        const order = { High: 0, Medium: 1, Low: 2 }
        return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
      })[0]

    if (highPriority) {
      const taskTitle = highPriority.title?.replace(/^\[SEO\]\s*/i, '').slice(0, 80)
      briefText += `*TOP PRIORITY TODAY*\n`
      briefText += `"${taskTitle}"\n\n`
    }

    // Approval queue
    const approvalTasks = approval.filter(t => t.taskType === 'SEO')
    briefText += `*YOUR APPROVAL QUEUE*\n`
    if (approvalTasks.length === 0) {
      briefText += `✅ Nothing waiting — all clear\n\n`
    } else {
      briefText += `${approvalTasks.length} task${approvalTasks.length > 1 ? 's' : ''} waiting → http://127.0.0.1:4173/\n`
      approvalTasks.slice(0, 3).forEach((t, i) => {
        briefText += `${i + 1}. ${t.title?.replace(/^\[SEO\]\s*/i, '').slice(0, 60)}\n`
      })
      briefText += '\n'
    }

    // SEO score (based on completed vs total tasks ratio as a proxy)
    const total = tasks.filter(t => t.taskType === 'SEO').length
    const done  = completed.filter(t => t.taskType === 'SEO').length
    const score = total > 0 ? Math.round(40 + (done / total) * 60) : 40
    briefText += `*SEO SCORE*\n`
    briefText += `Today: ${score}/100 | Target: 90/100\n\n`

    // System status
    const executorStatus = getExecutorStatus()
    const systemOk = executorStatus.active && getFlywheelStatus().active
    briefText += `*SYSTEM STATUS*\n`
    briefText += systemOk
      ? `✅ All systems running normally\n`
      : `⚠️ Check dashboard — one or more systems may need attention\n`

    briefText += `\n— Pablo Escobot 🚀`

  } catch (e) {
    console.error('[Morning Brief] Error generating brief:', e.message)
    briefText += `⚠️ Brief generation partially failed: ${e.message}\n\nCheck dashboard: http://127.0.0.1:4173/\n\n— Pablo Escobot`
  }

  await sendTelegram(briefText)
  console.log('[Morning Brief] ☀️ Brief sent to Josh')
  return briefText
}
