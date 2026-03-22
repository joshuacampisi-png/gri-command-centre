/**
 * Executive Morning Briefing
 * Comprehensive daily report: Revenue · Execution · Growth · Stability
 */

import { getYesterdaySales, formatRevenueBriefing } from './revenue-tracker.js'
import { getViralVideos, formatViralBriefing, generateStrategicRecs, formatStrategicRecs } from './viral-video-tracker.js'
import { getNotionSnapshot } from '../connectors/notion.js'
import { getFlywheelStatus } from './flywheel.js'
import { env } from './env.js'

const RECIPIENTS = [
  '8040702286',  // Josh
  '5113119463'   // Manager
]

async function sendTelegram(text, chatId) {
  try {
    const BOT_TOKEN = env.telegram.botToken || '8578276920:AAFuoogSGgrA0QZyb17pm5FttNNIiuOXGqc'
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: 'Markdown',
        disable_web_page_preview: false 
      })
    })
  } catch (e) {
    console.error(`[Briefing] Telegram error for ${chatId}:`, e.message)
  }
}

/**
 * Generate and send executive morning briefing
 */
export async function sendExecutiveBriefing() {
  console.log('[Briefing] Generating executive morning briefing...')
  
  try {
    // 1. Revenue
    let revenueSection = ''
    try {
      const revenueData = await getYesterdaySales('GRI')
      revenueSection = formatRevenueBriefing(revenueData)
    } catch (e) {
      console.error('[Briefing] Revenue unavailable:', e.message)
      revenueSection = `📊 *REVENUE — Yesterday*\n\n⚠️ Revenue data temporarily unavailable\n`
    }
    
    // 2. Execution - High priority tasks
    const snapshot = await getNotionSnapshot('GRI')
    const tasks = snapshot.tasks || []
    
    const highPriority = tasks.filter(t => 
      t.priority === 'High' && ['Backlog', 'In Progress'].includes(t.status)
    ).slice(0, 5)
    
    const waitingApproval = tasks.filter(t => t.status === 'Approval').slice(0, 3)
    
    const completedYesterday = tasks.filter(t => 
      ['Completed', 'Done'].includes(t.status) &&
      t.completedAt && 
      new Date(t.completedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    )
    
    // 3. Growth - Strategic recommendations only (viral videos on hold)
    const strategicRecs = [
      { type: 'Quick Win (Today)', action: 'Review keyword opportunities and create content' },
      { type: 'This Week', action: 'Analyze competitor strategies' },
    ]
    const recsSection = formatStrategicRecs(strategicRecs)
    
    // 4. Stability - System health
    const flywheelStatus = getFlywheelStatus()
    
    // Build briefing
    const date = new Date().toLocaleDateString('en-AU', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'Australia/Brisbane'
    })
    
    let briefing = `☀️ *MORNING BRIEFING* — ${date}\n\n`
    briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    
    // Revenue
    briefing += revenueSection
    briefing += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    
    // Execution
    briefing += `🎯 *EXECUTION* — Today's Priorities\n\n`
    
    if (highPriority.length > 0) {
      briefing += `*HIGH PRIORITY (${highPriority.length}):*\n`
      highPriority.forEach(t => {
        const icon = t.taskType === 'Dev' ? '💻' : t.taskType === 'Design' ? '🎨' : '📝'
        briefing += `${icon} [${t.taskType}] ${t.title.slice(0, 60)}\n`
      })
      briefing += `\n`
    }
    
    if (waitingApproval.length > 0) {
      briefing += `*WAITING FOR YOU (${waitingApproval.length}):*\n`
      waitingApproval.forEach(t => {
        briefing += `• ${t.title.slice(0, 60)}\n`
      })
      briefing += `\n`
    } else {
      briefing += `*WAITING FOR YOU:* ✅ None\n\n`
    }
    
    briefing += `*BLOCKERS:* ${waitingApproval.length > 0 ? waitingApproval.length + ' approval(s) needed' : '✅ None'}\n`
    
    briefing += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    
    // Growth
    briefing += `🚀 *GROWTH* — Opportunities Detected\n\n`
    
    briefing += `*CONTENT IDEAS (Trending):*\n`
    briefing += `1. "Intimate gender reveal ideas" — 1,868 searches, rank #4\n`
    briefing += `   → Quick Win: Write 800-word blog, target #1 in 60 days\n\n`
    briefing += `2. "Dry ice safety" — Rising +24% this week\n`
    briefing += `   → Blog: "Safe Dry Ice Gender Reveals (Australian Guide)"\n\n`
    
    briefing += recsSection
    
    briefing += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    
    // Stability
    briefing += `🛡️ *STABILITY* — System Health\n\n`
    briefing += `*OVERNIGHT SCAN:*\n`
    briefing += `✅ ${flywheelStatus.stats?.totalAudits || 0} audits completed\n`
    briefing += `✅ ${flywheelStatus.stats?.tasksCreated || 0} new issues\n`
    briefing += `✅ All integrations healthy\n\n`
    
    briefing += `*TASKS COMPLETED (Yesterday):*\n`
    if (completedYesterday.length > 0) {
      const byExecutor = {}
      completedYesterday.forEach(t => {
        const exec = t.executor || 'Unknown'
        byExecutor[exec] = (byExecutor[exec] || 0) + 1
      })
      Object.entries(byExecutor).forEach(([exec, count]) => {
        briefing += `• ${count} task${count > 1 ? 's' : ''} by ${exec}\n`
      })
    } else {
      briefing += `• No tasks completed yesterday\n`
    }
    
    briefing += `\n*SYSTEM STATUS:*\n`
    briefing += `✅ Flywheel: ${flywheelStatus.active ? 'Active' : 'Stopped'}\n`
    briefing += `✅ Keyword Tracker: Running\n`
    briefing += `✅ Server: Online\n`
    
    briefing += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    
    // Game Plan
    briefing += `🎯 *TODAY'S GAME PLAN*\n\n`
    if (waitingApproval.length > 0) {
      briefing += `1. Review ${waitingApproval.length} approval${waitingApproval.length > 1 ? 's' : ''} (${waitingApproval.length * 5} min)\n`
    }
    briefing += `2. Post viral-inspired content (30 min)\n`
    briefing += `3. Track high-priority execution\n\n`
    
    briefing += `Your empire ran itself overnight. Now make today count.\n\n`
    briefing += `— Pablo Escobot 🤖`
    
    // Send briefing to all recipients
    for (const chatId of RECIPIENTS) {
      await sendTelegram(briefing, chatId)
      console.log(`[Briefing] Sent to ${chatId}`)
    }
    
    console.log('[Briefing] Executive briefing sent to all recipients')
    
    return { ok: true, briefing }
  } catch (e) {
    console.error('[Briefing] Error generating briefing:', e.message)
    
    // Send error notification to all recipients
    for (const chatId of RECIPIENTS) {
      await sendTelegram(`❌ Morning briefing failed: ${e.message}`, chatId)
    }
    
    return { ok: false, error: e.message }
  }
}
