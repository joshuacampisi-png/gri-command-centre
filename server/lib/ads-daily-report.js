/**
 * ads-daily-report.js
 * Morning coffee report: yesterday's Meta Ads performance via Telegram.
 * Sent daily at 8am AEST via Pablo's bot.
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

export async function sendAdsDaily() {
  try {
    // Pull yesterday + last 7 days for context
    const [yesterdayData, weekData] = await Promise.all([
      fetchFullPerformance('yesterday'),
      fetchFullPerformance('last_7d')
    ])

    // Compute fatigue scores for all active ads
    const allAds = []
    for (const c of yesterdayData.campaigns) {
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

    // Adset/audience data
    const allAdsets = []
    for (const c of yesterdayData.campaigns) {
      for (const adset of c.adsets || []) {
        allAdsets.push({
          name: adset.name,
          targeting: adset.targeting,
          insights: adset.insights
        })
      }
    }

    const aestDate = new Date().toLocaleDateString('en-AU', {
      timeZone: 'Australia/Brisbane',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })

    // Build raw data payload for Claude
    const rawData = {
      date: aestDate,
      yesterday: yesterdayData.totals,
      last7d: weekData.totals,
      last7dAvg: {
        spend: (weekData.totals.spend / 7),
        roas: weekData.totals.roas,
        cpa: weekData.totals.cpa,
        purchases: (weekData.totals.purchases / 7)
      },
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

    const claudePrompt = `You are Josh's personal media buyer for Gender Reveal Ideas (Australian DTC e-commerce). No fluff. Every line is actionable or a key metric. Australian English, no em dashes.

Here is ALL the raw Meta Ads data. Use ONLY real numbers from this data. Do not invent or estimate anything.

${JSON.stringify(rawData, null, 2)}

Produce a Telegram report using this EXACT structure (Telegram Markdown). Keep the ENTIRE message under 2000 characters:

📊 *META ADS DAILY* — ${aestDate}

💰 *Yesterday*
Spend: $X | Revenue: $X
ROAS: Xx | CPA: $X | Purchases: N
vs 7d avg: ROAS {up/down X%} | CPA {up/down X%}

🏆 *Top 3 Performers* (by ROAS)
1. {ad name} — {ROAS}x, $X revenue, CPA $X
2. {ad name} — {ROAS}x, $X revenue, CPA $X
3. {ad name} — {ROAS}x, $X revenue, CPA $X

🚨 *Needs Action*
• {ad name} — {problem}. Fix: {one line fix}
(If nothing needs action, say so. Don't invent problems.)

📈 *Best Audience*
{adset name}: {ROAS}x, CPA $X — {targeting summary}

📉 *Worst Audience*
{adset name}: {ROAS}x, CPA $X — {what to do}

⚡ *Today's Move*
{The ONE thing to do today for biggest impact. Be specific: "Pause X, duplicate Y into Z audience, set budget to $N"}

Rules:
- Use real ad names and real numbers only
- Round dollars to 2 decimal places, ROAS to 2 decimal places
- If there are fewer than 3 ads, show what you have
- If there are no adsets with data, skip those sections
- If nothing needs action, say "All clear, no fires today"
- Keep it punchy. This is a morning coffee read.
- Output ONLY the report text, no preamble or explanation`

    const claudeRes = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: claudePrompt }]
    }, 'ads-daily-report-v2')

    const report = claudeRes.content[0].text.trim()

    await sendTelegram(report)
    console.log('[AdsDailyReport] Sent to Telegram')
    return { ok: true, report }
  } catch (err) {
    console.error('[AdsDailyReport] Failed:', err.message)
    return { ok: false, error: err.message }
  }
}
