/**
 * ads-weekly-report.js
 * Weekly strategic Meta Ads review sent Monday 8am AEST via Pablo's bot.
 */
import { fetchFullPerformance } from './meta-api.js'
import { calculateFatigueScore, prepareFatigueMetrics } from './fatigue-engine.js'
import { callClaude } from './claude-guard.js'

const PABLO_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const JOSH_CHAT = process.env.TELEGRAM_JOSH_CHAT_ID || '8040702286'

async function sendTelegram(text) {
  if (!PABLO_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set')
  const res = await fetch(`https://api.telegram.org/bot${PABLO_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: JOSH_CHAT,
      text,
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true }
    })
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram: ${data.description || 'Unknown error'}`)
  return data
}

export async function sendAdsWeekly() {
  try {
    // Pull last 14 days to split into this week vs last week
    const fourteenDayData = await fetchFullPerformance('last_14d')
    const sevenDayData = await fetchFullPerformance('last_7d')

    // Compute fatigue on all active ads from 7d data
    const allAds = []
    for (const c of sevenDayData.campaigns) {
      for (const ad of c.ads || []) {
        if (ad.status !== 'ACTIVE') continue
        const metrics = prepareFatigueMetrics(ad)
        const fatigue = calculateFatigueScore(metrics)
        allAds.push({
          name: ad.name,
          adsetName: ad.adsetName || 'Unknown',
          targeting: ad.targeting,
          daysRunning: ad.daysRunning,
          insights: ad.insights,
          fatigue
        })
      }
    }

    // Adset/audience data from 7d
    const allAdsets = []
    for (const c of sevenDayData.campaigns) {
      for (const adset of c.adsets || []) {
        allAdsets.push({
          name: adset.name,
          targeting: adset.targeting,
          insights: adset.insights
        })
      }
    }

    // Week-over-week: 14d totals minus 7d totals = last week
    const thisWeek = sevenDayData.totals
    const lastWeek = {
      spend: fourteenDayData.totals.spend - sevenDayData.totals.spend,
      impressions: fourteenDayData.totals.impressions - sevenDayData.totals.impressions,
      clicks: fourteenDayData.totals.clicks - sevenDayData.totals.clicks,
      purchases: fourteenDayData.totals.purchases - sevenDayData.totals.purchases,
      purchaseValue: fourteenDayData.totals.purchaseValue - sevenDayData.totals.purchaseValue,
      reach: fourteenDayData.totals.reach - sevenDayData.totals.reach
    }
    // Derived metrics for last week
    lastWeek.roas = lastWeek.spend > 0 ? lastWeek.purchaseValue / lastWeek.spend : 0
    lastWeek.cpa = lastWeek.purchases > 0 ? lastWeek.spend / lastWeek.purchases : 0
    lastWeek.ctr = lastWeek.impressions > 0 ? (lastWeek.clicks / lastWeek.impressions) * 100 : 0
    lastWeek.cpm = lastWeek.impressions > 0 ? (lastWeek.spend / lastWeek.impressions) * 1000 : 0

    // Fatigue counts
    const healthy = allAds.filter(a => a.fatigue.status === 'HEALTHY').length
    const watching = allAds.filter(a => a.fatigue.status === 'WATCH').length
    const fatiguing = allAds.filter(a => a.fatigue.status === 'FATIGUING').length
    const dead = allAds.filter(a => a.fatigue.status === 'DEAD').length

    const aestDate = new Date().toLocaleDateString('en-AU', {
      timeZone: 'Australia/Brisbane',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })

    const rawData = {
      weekOf: aestDate,
      thisWeek,
      lastWeek,
      fatigueBreakdown: { healthy, watching, fatiguing, dead, total: allAds.length },
      ads: allAds.map(a => ({
        name: a.name,
        adsetName: a.adsetName,
        roas: a.insights?.roas || 0,
        cpa: a.insights?.cpa || 0,
        spend: a.insights?.spend || 0,
        revenue: a.insights?.purchaseValue || 0,
        purchases: a.insights?.purchases || 0,
        ctr: a.insights?.ctr || 0,
        frequency: a.insights?.frequency || 0,
        daysRunning: a.daysRunning,
        fatigueScore: a.fatigue.score,
        fatigueStatus: a.fatigue.status,
        fatigueSignals: a.fatigue.signals
      })),
      adsets: allAdsets.map(a => ({
        name: a.name,
        targeting: a.targeting,
        roas: a.insights?.roas || 0,
        cpa: a.insights?.cpa || 0,
        spend: a.insights?.spend || 0,
        revenue: a.insights?.purchaseValue || 0,
        purchases: a.insights?.purchases || 0
      }))
    }

    const claudePrompt = `You are Josh's personal media buyer doing the weekly Meta Ads strategic review for Gender Reveal Ideas (Australian DTC e-commerce). No fluff. Data-driven. Australian English, no em dashes.

Here is ALL the raw data. Use ONLY real numbers. Do not invent or estimate. If last week data is zero or negative (not enough data), say so honestly.

${JSON.stringify(rawData, null, 2)}

Produce a Telegram report using this EXACT structure (Telegram Markdown). Keep under 3000 characters:

📊 *WEEKLY META ADS REVIEW* — Week of ${aestDate}

💰 *This Week vs Last Week*
Spend: $X vs $X (X%)
Revenue: $X vs $X (X%)
ROAS: Xx vs Xx
CPA: $X vs $X
Purchases: N vs N

🏆 *Top 5 Ads This Week*
1. {name} — {ROAS}x, {purchases} sales, ${'{'}revenue}
2. ...
(Show fewer if fewer exist)

💀 *Kill List* (pause these)
• {ad name} — {reason}, wasting $X
(If none, say "No kills needed this week")

🎯 *Audience Insights*
Best: {adset} — {targeting summary} — {ROAS}x
Worst: {adset} — {targeting summary} — {ROAS}x
Recommendation: {specific action}

🔄 *Creative Health*
{N} healthy, {N} watching, {N} fatiguing, {N} dead
Refresh priority: {ad names that need new creative}

📋 *This Week's Action Plan*
1. {Highest impact action with specific steps}
2. {Second action}
3. {Third action}

💡 *Strategic Note*
{One paragraph: patterns spotted, opportunities, risks. Based on actual data trends.}

Rules:
- Use real ad names and numbers only
- Round dollars to 2 decimal places, ROAS to 2 decimal places
- Percentage changes: calculate from the data provided
- If last week data is all zeros, note insufficient data for comparison
- Be honest about what the data shows
- Output ONLY the report text, no preamble`

    const claudeRes = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: claudePrompt }]
    }, 'ads-weekly-report')

    const report = claudeRes.content[0].text.trim()

    await sendTelegram(report)
    console.log('[AdsWeeklyReport] Sent to Telegram')
    return { ok: true, report }
  } catch (err) {
    console.error('[AdsWeeklyReport] Failed:', err.message)
    return { ok: false, error: err.message }
  }
}
