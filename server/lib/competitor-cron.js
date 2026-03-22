/**
 * Competitor Tracking Cron
 * Automated weekly scans + alerts
 */

import cron from 'node-cron'
import { runCompetitorScan, readCompetitorCache, COMPETITORS } from './competitor-tracker.js'
import { readCache as readKeywordCache } from './keyword-tracker.js'
import { env } from './env.js'

const JOSH_CHAT = '8040702286'

async function sendTelegramAlert(message) {
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
    console.error('[Competitor Cron] Telegram send failed:', err.message)
  }
}

/**
 * Weekly competitor scan (every Monday 4am AEST)
 */
export function scheduleCompetitorScan() {
  cron.schedule('0 4 * * 1', async () => {
    console.log('[Competitor Cron] Starting weekly competitor scan...')
    
    try {
      // Get tracked keywords from keyword tracker
      const kwCache = readKeywordCache()
      if (!kwCache || !kwCache.keywords || kwCache.keywords.length === 0) {
        console.log('[Competitor Cron] No keywords to scan - skipping')
        return
      }

      // Get previous competitor data for comparison
      const prevCache = readCompetitorCache()
      
      // Run scan on top 40 keywords by volume
      const topKeywords = kwCache.keywords
        .filter(k => k.volume !== null)
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 40)
      
      console.log(`[Competitor Cron] Scanning ${topKeywords.length} keywords...`)
      const newCache = await runCompetitorScan(topKeywords)
      
      // Generate comparison insights
      const insights = generateInsights(prevCache, newCache)
      
      // Send Telegram update
      const message = formatCompetitorUpdate(newCache, insights)
      await sendTelegramAlert(message)
      
      console.log('[Competitor Cron] Scan complete, alert sent')
      
    } catch (err) {
      console.error('[Competitor Cron] Scan failed:', err)
      await sendTelegramAlert(`⚠️ *Competitor Scan Failed*\n\nError: ${err.message}`)
    }
  }, {
    timezone: 'Australia/Brisbane'
  })

  console.log('[Competitor Cron] ✅ Weekly competitor scan scheduled (Mondays 4am AEST)')
}

/**
 * Compare previous vs current to find movement
 */
function generateInsights(prevCache, newCache) {
  if (!prevCache) return { isFirstRun: true }

  const insights = {
    isFirstRun: false,
    competitorGains: [], // keywords where competitors jumped ahead
    griGains: [],        // keywords where GRI improved
    newThreats: [],      // competitors appearing in top 3 for first time
  }

  const prevMap = {}
  if (prevCache.keywords) {
    prevCache.keywords.forEach(k => {
      prevMap[k.keyword] = k.positions
    })
  }

  newCache.keywords.forEach(k => {
    const prev = prevMap[k.keyword]
    if (!prev) return

    const griRank = k.positions.gri?.rank
    const griPrevRank = prev.gri?.rank

    // Check each competitor
    for (const [key, comp] of Object.entries(COMPETITORS)) {
      if (key === 'gri') continue

      const compRank = k.positions[key]?.rank
      const compPrevRank = prev[key]?.rank

      // Competitor jumped ahead of GRI
      if (compPrevRank && griPrevRank && compRank && griRank) {
        if (compPrevRank > griPrevRank && compRank < griRank) {
          insights.competitorGains.push({
            keyword: k.keyword,
            competitor: comp.name,
            griRank,
            compRank,
            wasBelow: true
          })
        }
      }

      // Competitor entered top 3 (wasn't there before)
      if (compRank && compRank <= 3 && (!compPrevRank || compPrevRank > 3)) {
        insights.newThreats.push({
          keyword: k.keyword,
          competitor: comp.name,
          rank: compRank
        })
      }
    }

    // GRI improved position
    if (griRank && griPrevRank && griRank < griPrevRank) {
      insights.griGains.push({
        keyword: k.keyword,
        fromRank: griPrevRank,
        toRank: griRank,
        improvement: griPrevRank - griRank
      })
    }
  })

  return insights
}

/**
 * Format Telegram update message
 */
function formatCompetitorUpdate(cache, insights) {
  const { summary } = cache

  let message = `🔍 *Weekly Competitor Scan Complete*\n\n`
  
  message += `**Keywords Scanned:** ${cache.keywords.length}\n`
  message += `**Successful:** ${cache.keywords.filter(k => !k.error).length}\n\n`

  message += `**Rankings Summary:**\n`
  for (const [key, comp] of Object.entries(COMPETITORS)) {
    const stats = summary[key]
    message += `• ${comp.name}: ${stats.top3} top-3, ${stats.top10} top-10`
    if (stats.avgRank) message += ` (avg: #${stats.avgRank})`
    message += `\n`
  }

  if (insights.isFirstRun) {
    message += `\n_First scan — baseline established_`
    return message
  }

  if (insights.competitorGains.length > 0) {
    message += `\n⚠️ *Competitors Moved Ahead:* ${insights.competitorGains.length}\n`
    insights.competitorGains.slice(0, 3).forEach(g => {
      message += `• "${g.keyword}": ${g.competitor} now #${g.compRank}, we're #${g.griRank}\n`
    })
  }

  if (insights.newThreats.length > 0) {
    message += `\n🚨 *New Top-3 Threats:* ${insights.newThreats.length}\n`
    insights.newThreats.slice(0, 3).forEach(t => {
      message += `• "${t.keyword}": ${t.competitor} entered top-3 (#${t.rank})\n`
    })
  }

  if (insights.griGains.length > 0) {
    message += `\n✅ *GRI Improvements:* ${insights.griGains.length}\n`
    insights.griGains.slice(0, 3).forEach(g => {
      message += `• "${g.keyword}": #${g.fromRank} → #${g.toRank} (+${g.improvement})\n`
    })
  }

  message += `\n— Competitor Tracker`
  return message
}

/**
 * Start all competitor tracking crons
 */
export function startCompetitorCrons() {
  scheduleCompetitorScan()
  console.log('[Competitor Cron] All competitor jobs scheduled and active.')
}
