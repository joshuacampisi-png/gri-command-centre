/**
 * SEO Learning Cron Jobs
 * Automated weekly research and daily learning cycles
 */

import cron from 'node-cron'
import { runLearningCycle, analyzeCompetitors } from './seo-education-system.js'
import { generateLearningInsights, generateWeeklyReport } from './seo-learning-system.js'
import { getCompetitors } from './competitors.js'
import { env } from './env.js'

const JOSH_CHAT = '8040702286'

/**
 * Send update to Josh via Telegram
 */
async function sendTelegramUpdate(message) {
  try {
    await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: JOSH_CHAT,
        text: message,
        parse_mode: 'Markdown'
      })
    })
  } catch (err) {
    console.error('[SEO Cron] Telegram send failed:', err.message)
  }
}

/**
 * Weekly research cycle (runs every Monday at 3am)
 */
export function scheduleWeeklyResearch() {
  // Every Monday at 3:00 AM AEST
  cron.schedule('0 3 * * 1', async () => {
    console.log('[SEO Cron] Starting weekly research cycle...')
    
    try {
      const result = await runLearningCycle()
      
      const message = `📚 *SEO Weekly Research Complete*

New Discoveries: ${result.newDiscoveries}
Total Knowledge: ${result.totalKnowledge}

Topics researched:
• Latest Google algorithm updates
• Meta description CTR optimization
• E-commerce SEO Australia
• SERP snippet best practices

Agents will use this knowledge in next optimization cycle.

— SEO Education System`

      await sendTelegramUpdate(message)
      console.log('[SEO Cron] Weekly research completed.')
    } catch (err) {
      console.error('[SEO Cron] Research cycle failed:', err)
      await sendTelegramUpdate(`⚠️ *SEO Research Failed*\n\nError: ${err.message}\n\nCheck logs for details.`)
    }
  }, {
    timezone: 'Australia/Brisbane'
  })

  console.log('[SEO Cron] ✅ Weekly research scheduled (Mondays 3am AEST)')
}

/**
 * Daily learning insights generation (runs every day at 2am)
 */
export function scheduleDailyInsights() {
  // Every day at 2:00 AM AEST
  cron.schedule('0 2 * * *', async () => {
    console.log('[SEO Cron] Generating daily learning insights...')
    
    try {
      const insights = await generateLearningInsights()
      
      if (insights.totalChanges < 5) {
        console.log('[SEO Cron] Not enough data for insights yet.')
        return
      }

      const topInsight = insights.insights[0]
      const message = `🧠 *SEO Learning Update*

Analyzed: ${insights.totalChanges} SEO changes
Insights generated: ${insights.insights.length}

Top performing change type: *${topInsight.changeType}*
Avg CTR: ${topInsight.avgCTR.toFixed(2)}%

Best keywords:
${topInsight.bestKeywords.slice(0, 3).map(k => `• ${k.keyword} (${k.avgCTR.toFixed(1)}% CTR)`).join('\n')}

Agents will prioritize these patterns.

— SEO Learning System`

      await sendTelegramUpdate(message)
      console.log('[SEO Cron] Daily insights generated.')
    } catch (err) {
      console.error('[SEO Cron] Insights generation failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane'
  })

  console.log('[SEO Cron] ✅ Daily insights scheduled (2am AEST)')
}

/**
 * Weekly summary report (runs every Monday at 9am - after Josh wakes up)
 */
export function scheduleWeeklySummary() {
  // Every Monday at 9:00 AM AEST
  cron.schedule('0 9 * * 1', async () => {
    console.log('[SEO Cron] Generating weekly summary...')
    
    try {
      const report = await generateWeeklyReport()
      
      const message = `📊 *SEO Weekly Summary*

Period: Last 7 days

**Changes Made:**
• Total: ${report.totalChanges}
• Measured: ${report.measuredChanges}
• Avg CTR improvement: ${report.avgCTRImprovement}

**Top Performers:**
${report.topPerformers.slice(0, 3).map((p, i) => `${i + 1}. ${p.page} (${p.metrics.ctr}% CTR)`).join('\n')}

**Agents Used:**
${report.agentsUsed.join(', ')}

**Recommendations:**
${report.recommendations.join('\n• ')}

— SEO Learning System`

      await sendTelegramUpdate(message)
      console.log('[SEO Cron] Weekly summary sent.')
    } catch (err) {
      console.error('[SEO Cron] Summary generation failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane'
  })

  console.log('[SEO Cron] ✅ Weekly summary scheduled (Mondays 9am AEST)')
}

/**
 * Monthly competitor analysis (runs first Monday of each month at 4am)
 */
export function scheduleCompetitorAnalysis() {
  // First Monday of month at 4:00 AM AEST
  cron.schedule('0 4 1-7 * 1', async () => {
    console.log('[SEO Cron] Starting competitor analysis...')
    
    try {
      const competitors = getCompetitors('GRI')
      const analysis = await analyzeCompetitors(competitors)
      
      const message = `🔍 *Competitor Analysis Complete*

Analyzed: ${competitors.length} competitors

**Common Keywords:**
${analysis.commonKeywords?.slice(0, 5).join(', ') || 'None found'}

**Patterns Detected:**
${analysis.patterns?.slice(0, 3).join('\n• ') || 'None'}

**Recommendations:**
${analysis.recommendations?.slice(0, 3).join('\n• ') || 'None'}

Full analysis stored in knowledge base.

— SEO Education System`

      await sendTelegramUpdate(message)
      console.log('[SEO Cron] Competitor analysis completed.')
    } catch (err) {
      console.error('[SEO Cron] Competitor analysis failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane'
  })

  console.log('[SEO Cron] ✅ Competitor analysis scheduled (1st Monday 4am AEST)')
}

/**
 * Start all SEO learning cron jobs
 */
export function startSEOLearningCrons() {
  scheduleWeeklyResearch()
  scheduleDailyInsights()
  scheduleWeeklySummary()
  scheduleCompetitorAnalysis()
  console.log('[SEO Cron] All learning jobs scheduled and active.')
}
