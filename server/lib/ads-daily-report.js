/**
 * ads-daily-report.js
 * Morning coffee report: yesterday's Meta Ads performance via Telegram.
 * Sent daily at 8am AEST via Pablo's bot.
 */
import { fetchFullPerformance } from './meta-api.js'
import { calculateFatigueScore, prepareFatigueMetrics } from './fatigue-engine.js'
import { callClaude } from './claude-guard.js'
import { fetchShopifyOrders } from './shopify-sales.js'

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
    // Pull yesterday + last 7 days for context, plus real Shopify orders
    const [yesterdayData, weekData, shopifyYesterday] = await Promise.all([
      fetchFullPerformance('yesterday'),
      fetchFullPerformance('last_7d'),
      fetchShopifyOrders('yesterday')
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
    const shopifyBreakdown = shopifyYesterday ? {
      totalOrders: shopifyYesterday.totalOrders,
      totalRevenue: shopifyYesterday.totalRevenue,
      aov: shopifyYesterday.aov,
      sourceBreakdown: shopifyYesterday.sourceBreakdown,
      channelBreakdown: shopifyYesterday.channelBreakdown,
      topProducts: shopifyYesterday.topProducts,
      topLocations: shopifyYesterday.topLocations
    } : null

    const rawData = {
      date: aestDate,
      _NOTE: 'Meta data shows Meta-attributed purchases only. Shopify data shows ALL real orders from ALL channels. Use Shopify totals for actual order count and revenue.',
      shopify: shopifyBreakdown,
      blendedROAS: shopifyYesterday && yesterdayData.totals.spend > 0
        ? (shopifyYesterday.totalRevenue / yesterdayData.totals.spend).toFixed(2) + 'x'
        : 'N/A',
      metaAds: yesterdayData.totals,
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

Here is ALL the raw data including REAL Shopify orders (all channels) and Meta Ads data. Use ONLY real numbers. Do not invent or estimate anything.

IMPORTANT: The "shopify" section shows ACTUAL total orders from ALL channels (Meta, Google, organic, direct, email). The "metaAds" section shows only Meta-attributed purchases. Always use Shopify totals for the real order count and revenue. The difference = orders from other channels (Google Ads, organic, etc).

${JSON.stringify(rawData, null, 2)}

Produce a Telegram report using this EXACT structure (Telegram Markdown). Keep the ENTIRE message under 2500 characters:

📊 *GRI DAILY REPORT* — ${aestDate}

🛒 *Yesterday's Sales* (Shopify actual)
Orders: N | Revenue: $X | AOV: $X
Source split: Meta X, Google X, Organic X, Direct X, Other X

💰 *Meta Ads Performance*
Spend: $X | Meta Revenue: $X | Meta ROAS: Xx
Blended ROAS: Xx (total revenue / ad spend)
CPA: $X | Purchases (Meta): N
vs 7d avg: ROAS {up/down X%} | CPA {up/down X%}

🏆 *Top 3 Ads* (by ROAS)
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

🔥 *Top Products*
{top 3 products from Shopify data with quantities}

⚡ *Today's Move*
{The ONE thing to do today for biggest impact. Be specific.}

CRITICAL RULES (non-negotiable):
- NEVER recommend pausing or killing an ad or campaign with ROAS above 1.0x. It is profitable.
- Advantage+ Catalogue campaigns are algorithmically optimised by Meta. Individual ads within them showing 0 purchases may still be contributing. Judge Advantage+ by CAMPAIGN-level ROAS, not individual ad ROAS.
- Meta uses 7-day click / 1-day view attribution. An ad with 0 purchases may be assisting conversions attributed to other ads. Only flag an ad as "needs action" if it has spent over $50 with zero purchases AND zero add-to-carts AND CTR below 0.5% over 7+ days.
- When recommending "Worst Audience", only flag audiences with ROAS below 1.5x. If all audiences are profitable, say "All audiences profitable, monitor frequency."
- In "Today's Move", prefer scaling winners over killing losers. Only recommend pausing something if it genuinely meets kill criteria above.
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
