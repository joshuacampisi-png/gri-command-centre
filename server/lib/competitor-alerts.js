/**
 * Competitor Intelligence Alerts
 * Telegram alerts for 4 trigger types:
 * 1. Competitor starts bidding on a new keyword you're on
 * 2. Competitor launches a new Meta ad campaign
 * 3. Competitor overtakes you on a keyword organically
 * 4. Competitor's estimated ad spend jumps significantly
 */

import { env } from './env.js'
import { detectChanges } from './competitor-history.js'

const JOSH_CHAT = env.telegram?.joshChatId || '8040702286'
const BOT_TOKEN = env.telegram?.botToken || ''

async function sendTelegram(message) {
  if (!BOT_TOKEN) {
    console.log('[CompAlerts] No Telegram bot token, skipping alert')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: JOSH_CHAT,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
  } catch (e) {
    console.error('[CompAlerts] Telegram send failed:', e.message)
  }
}

/**
 * Check for new keyword bids by competitors
 * Trigger: competitor starts bidding on a keyword you're also bidding on
 */
export function checkNewKeywordBids(currentScan) {
  const { hasChanges, current, previous } = detectChanges('paid')
  if (!hasChanges || !previous) return []

  const alerts = []
  const griKeywords = new Set(
    (current.competitors?.gri?.paidKeywords || []).map(k => k.keyword.toLowerCase())
  )

  for (const [id, comp] of Object.entries(current.competitors || {})) {
    if (id === 'gri') continue

    const prevKeywords = new Set(
      (previous.competitors?.[id]?.paidKeywords || []).map(k => k.keyword.toLowerCase())
    )
    const currentKeywords = (comp.paidKeywords || [])

    for (const kw of currentKeywords) {
      const kwLower = kw.keyword.toLowerCase()
      if (!prevKeywords.has(kwLower) && griKeywords.has(kwLower)) {
        alerts.push({
          type: 'new_keyword_bid',
          competitor: comp.name,
          keyword: kw.keyword,
          position: kw.position,
          cpc: kw.cpc,
        })
      }
    }
  }

  return alerts
}

/**
 * Check for new Meta ad campaigns
 * Trigger: competitor has new ads that weren't in the previous scan
 */
export function checkNewMetaCampaigns(currentScan) {
  const { hasChanges, current, previous } = detectChanges('meta')
  if (!hasChanges || !previous) return []

  const alerts = []

  for (const [id, comp] of Object.entries(current.competitors || {})) {
    if (id === 'gri') continue

    const prevAdIds = new Set(
      (previous.competitors?.[id]?.ads || []).map(a => a.id)
    )

    const newAds = (comp.ads || []).filter(a => !prevAdIds.has(a.id))

    if (newAds.length > 0) {
      alerts.push({
        type: 'new_meta_campaign',
        competitor: comp.name,
        newAdsCount: newAds.length,
        ads: newAds.slice(0, 3).map(a => ({
          headline: a.headline,
          adText: a.adText?.substring(0, 100),
        })),
      })
    }
  }

  return alerts
}

/**
 * Check for organic rank overtakes
 * Trigger: competitor now ranks higher than GRI on a keyword where GRI was ahead
 */
export function checkOrganicOvertakes(currentScan) {
  const { hasChanges, current, previous } = detectChanges('organic')
  if (!hasChanges || !previous) return []

  const alerts = []
  const prevKeywordMap = {}
  ;(previous.keywords || []).forEach(k => { prevKeywordMap[k.keyword] = k.positions })

  for (const kw of (current.keywords || [])) {
    const prev = prevKeywordMap[kw.keyword]
    if (!prev) continue

    const griRank = kw.positions?.gri?.rank
    const griPrevRank = prev?.gri?.rank
    if (!griRank || !griPrevRank) continue

    for (const [id, pos] of Object.entries(kw.positions)) {
      if (id === 'gri') continue
      const compRank = pos?.rank
      const compPrevRank = prev[id]?.rank

      // Competitor overtook us (they were behind, now they're ahead)
      if (compPrevRank && griPrevRank && compRank && griRank) {
        if (compPrevRank > griPrevRank && compRank < griRank) {
          const comp = current.competitors?.[id]
          alerts.push({
            type: 'organic_overtake',
            competitor: comp?.name || id,
            keyword: kw.keyword,
            griRank,
            compRank,
            griPrevRank,
            compPrevRank,
          })
        }
      }
    }
  }

  return alerts
}

/**
 * Check for significant ad spend jumps
 * Trigger: competitor's estimated spend increases by 50%+
 */
export function checkSpendJumps(currentScan) {
  const { hasChanges, current, previous } = detectChanges('paid')
  if (!hasChanges || !previous) return []

  const alerts = []
  const THRESHOLD = 0.5 // 50% increase

  for (const [id, comp] of Object.entries(current.competitors || {})) {
    if (id === 'gri') continue

    const currentSpend = comp.metrics?.estimatedCost || 0
    const prevSpend = previous.competitors?.[id]?.metrics?.estimatedCost || 0

    if (prevSpend > 0 && currentSpend > 0) {
      const increase = (currentSpend - prevSpend) / prevSpend
      if (increase >= THRESHOLD) {
        alerts.push({
          type: 'spend_jump',
          competitor: comp.name,
          previousSpend: prevSpend,
          currentSpend,
          increasePercent: Math.round(increase * 100),
        })
      }
    }
  }

  return alerts
}

/**
 * Run all alert checks and send Telegram notifications
 */
export async function runAlertChecks() {
  console.log('[CompAlerts] Running alert checks...')

  const allAlerts = [
    ...checkNewKeywordBids(),
    ...checkNewMetaCampaigns(),
    ...checkOrganicOvertakes(),
    ...checkSpendJumps(),
  ]

  if (allAlerts.length === 0) {
    console.log('[CompAlerts] No alerts to send')
    return []
  }

  // Format and send Telegram message
  let message = `🔔 *Competitor Intelligence Alert*\n\n`

  const keywordBids = allAlerts.filter(a => a.type === 'new_keyword_bid')
  if (keywordBids.length > 0) {
    message += `💰 *New Keyword Bids (${keywordBids.length}):*\n`
    keywordBids.slice(0, 5).forEach(a => {
      message += `• ${a.competitor} now bidding on "${a.keyword}" (pos #${a.position || '?'})\n`
    })
    message += '\n'
  }

  const newMeta = allAlerts.filter(a => a.type === 'new_meta_campaign')
  if (newMeta.length > 0) {
    message += `📱 *New Meta Ads:*\n`
    newMeta.forEach(a => {
      message += `• ${a.competitor}: ${a.newAdsCount} new ad(s)\n`
    })
    message += '\n'
  }

  const overtakes = allAlerts.filter(a => a.type === 'organic_overtake')
  if (overtakes.length > 0) {
    message += `⚠️ *Organic Overtakes (${overtakes.length}):*\n`
    overtakes.slice(0, 5).forEach(a => {
      message += `• "${a.keyword}": ${a.competitor} #${a.compRank} vs you #${a.griRank}\n`
    })
    message += '\n'
  }

  const spendJumps = allAlerts.filter(a => a.type === 'spend_jump')
  if (spendJumps.length > 0) {
    message += `📈 *Ad Spend Increases:*\n`
    spendJumps.forEach(a => {
      message += `• ${a.competitor}: +${a.increasePercent}% ($${a.previousSpend.toFixed(0)} → $${a.currentSpend.toFixed(0)})\n`
    })
  }

  await sendTelegram(message)
  console.log(`[CompAlerts] Sent ${allAlerts.length} alerts via Telegram`)

  return allAlerts
}
