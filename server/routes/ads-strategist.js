/**
 * /api/ads/strategist/* routes — AI-powered ads strategy, health checks, daily briefings.
 * Claude acts as a senior media buyer coaching Josh through Meta ad management.
 */
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fetchFullPerformance, isMetaConfigured } from '../lib/meta-api.js'
import { calculateFatigueScore, prepareFatigueMetrics } from '../lib/fatigue-engine.js'
import { callClaude } from '../lib/claude-guard.js'
import { dataFile } from '../lib/data-dir.js'
import { fetchShopifyOrders, formatShopifySalesForPrompt } from '../lib/shopify-sales.js'
import { getShopifyOrdersRange } from '../connectors/shopify.js'
import { getIndex, classifyOrders, getCustomerStats } from '../lib/customer-index.js'
import { calculateNCAC, calculateFOVCAC, calculateCM, calculateCostOfDelivery, calculateAcquisitionMER, GRI_ADS } from '../lib/ads-metrics.js'

const router = Router()
const HEALTH_LOG_FILE = dataFile('ads-health-log.json')

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(file) {
  if (!existsSync(file)) return []
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return [] }
}

function saveJSON(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2))
}

function buildMetricsSummary(perfData) {
  const { campaigns, totals } = perfData
  const lines = []

  lines.push('=== ACCOUNT TOTALS (Last 7 Days) ===')
  lines.push(`Total Spend: $${totals.spend.toFixed(2)} AUD`)
  lines.push(`Total Revenue: $${totals.purchaseValue.toFixed(2)} AUD`)
  lines.push(`Total Purchases: ${totals.purchases}`)
  lines.push(`Overall ROAS: ${totals.roas.toFixed(2)}x`)
  lines.push(`Overall CPA: $${totals.cpa.toFixed(2)}`)
  lines.push(`Overall CTR: ${totals.ctr.toFixed(2)}%`)
  lines.push(`Overall CPM: $${totals.cpm.toFixed(2)}`)
  lines.push(`Total Reach: ${totals.reach}`)
  lines.push('')

  for (const campaign of campaigns) {
    lines.push(`=== CAMPAIGN: ${campaign.name} ===`)
    lines.push(`Status: ${campaign.status}`)
    lines.push(`Daily Budget: ${campaign.dailyBudget ? '$' + campaign.dailyBudget.toFixed(2) : 'Not set'}`)

    if (campaign.insights) {
      const ci = campaign.insights
      lines.push(`Spend: $${ci.spend.toFixed(2)} | ROAS: ${ci.roas.toFixed(2)}x | CPA: $${ci.cpa.toFixed(2)}`)
      lines.push(`Clicks: ${ci.clicks} | Impressions: ${ci.impressions} | CTR: ${ci.ctr.toFixed(2)}%`)
      lines.push(`Purchases: ${ci.purchases} | Revenue: $${ci.purchaseValue.toFixed(2)}`)
      lines.push(`Frequency: ${ci.frequency.toFixed(1)} | CPM: $${ci.cpm.toFixed(2)}`)
    }

    // Adset/audience data
    for (const adset of campaign.adsets || []) {
      lines.push(`  ADSET: ${adset.name}`)
      lines.push(`    Status: ${adset.status}`)
      if (adset.dailyBudget) lines.push(`    Daily Budget: $${adset.dailyBudget.toFixed(2)}`)
      if (adset.lifetimeBudget) lines.push(`    Lifetime Budget: $${adset.lifetimeBudget.toFixed(2)}`)
      if (adset.optimizationGoal) lines.push(`    Optimisation Goal: ${adset.optimizationGoal}`)
      if (adset.targeting) {
        const t = adset.targeting
        if (t.ageMin || t.ageMax) lines.push(`    Age: ${t.ageMin || '?'}-${t.ageMax || '?'}`)
        if (t.genders?.length) lines.push(`    Gender: ${t.genders.map(g => g === 1 ? 'Male' : g === 2 ? 'Female' : 'All').join(', ')}`)
        if (t.geoLocations?.countries?.length) lines.push(`    Countries: ${t.geoLocations.countries.join(', ')}`)
        if (t.geoLocations?.cities?.length) lines.push(`    Cities: ${t.geoLocations.cities.map(c => c.name).join(', ')}`)
        if (t.geoLocations?.regions?.length) lines.push(`    Regions: ${t.geoLocations.regions.map(r => r.name).join(', ')}`)
        if (t.interests?.length) lines.push(`    Interests: ${t.interests.join(', ')}`)
        if (t.customAudiences?.length) lines.push(`    Custom Audiences: ${t.customAudiences.map(a => a.name).join(', ')}`)
        if (t.excludedCustomAudiences?.length) lines.push(`    Excluded Audiences: ${t.excludedCustomAudiences.map(a => a.name).join(', ')}`)
        if (t.lookalikes?.length) lines.push(`    Lookalikes: ${t.lookalikes.join(', ')}`)
        if (t.placements?.length) lines.push(`    Placements: ${t.placements.join(', ')}`)
        if (t.devicePlatforms?.length) lines.push(`    Devices: ${t.devicePlatforms.join(', ')}`)
      }
      if (adset.insights) {
        const asi = adset.insights
        lines.push(`    Spend: $${asi.spend.toFixed(2)} | ROAS: ${asi.roas.toFixed(2)}x | CPA: $${asi.cpa.toFixed(2)}`)
        lines.push(`    Purchases: ${asi.purchases} | Revenue: $${asi.purchaseValue.toFixed(2)}`)
        lines.push(`    Frequency: ${asi.frequency.toFixed(1)} | CTR: ${asi.ctr.toFixed(2)}%`)
      }
    }

    for (const ad of campaign.ads || []) {
      const ai = ad.insights
      const fatigue = ad.fatigue || {}
      lines.push(`  AD: ${ad.name}`)
      lines.push(`    Status: ${ad.status} | Days Running: ${ad.daysRunning}`)
      if (ad.adsetName) lines.push(`    Adset: ${ad.adsetName}`)
      if (ad.targeting) {
        const t = ad.targeting
        if (t.interests?.length) lines.push(`    Audience Interests: ${t.interests.join(', ')}`)
        if (t.customAudiences?.length) lines.push(`    Custom Audiences: ${t.customAudiences.map(a => a.name).join(', ')}`)
        if (t.ageMin) lines.push(`    Age Target: ${t.ageMin}-${t.ageMax}`)
      }
      if (ai) {
        lines.push(`    Spend: $${ai.spend.toFixed(2)} | ROAS: ${ai.roas.toFixed(2)}x | CPA: $${ai.cpa.toFixed(2)}`)
        lines.push(`    Clicks: ${ai.clicks} | Impressions: ${ai.impressions} | CTR: ${ai.ctr.toFixed(2)}%`)
        lines.push(`    Purchases: ${ai.purchases} | Revenue: $${ai.purchaseValue.toFixed(2)}`)
        lines.push(`    Frequency: ${ai.frequency.toFixed(1)} | CPM: $${ai.cpm.toFixed(2)} | Reach: ${ai.reach}`)
      }
      lines.push(`    Fatigue Score: ${fatigue.score ?? 'N/A'} | Status: ${fatigue.status ?? 'N/A'}`)
      if (fatigue.signals?.length) {
        lines.push(`    Fatigue Signals: ${fatigue.signals.join(', ')}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

function enrichWithFatigue(perfData) {
  for (const campaign of perfData.campaigns) {
    let campaignScoreSum = 0
    let campaignAdCount = 0

    for (const ad of campaign.ads || []) {
      const metrics = prepareFatigueMetrics(ad)
      ad.fatigue = calculateFatigueScore(metrics)
      if (ad.status === 'ACTIVE') {
        campaignScoreSum += ad.fatigue.score
        campaignAdCount++
      }
    }

    campaign.healthScore = campaignAdCount > 0
      ? Math.round(campaignScoreSum / campaignAdCount)
      : null
  }
  return perfData
}

// ── GET /health-check ────────────────────────────────────────────────────────

router.get('/health-check', async (_req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    const [perfData, shopify7d] = await Promise.all([
      fetchFullPerformance('last_7d'),
      fetchShopifyOrders('last_7d')
    ])
    enrichWithFatigue(perfData)

    const metricsSummary = buildMetricsSummary(perfData)
    const shopifyContext = formatShopifySalesForPrompt(shopify7d)
    const totalDailyBudget = perfData.campaigns
      .filter(c => c.status === 'ACTIVE' && c.dailyBudget)
      .reduce((sum, c) => sum + c.dailyBudget, 0)

    // Build profitability context (nCAC framework)
    let profitabilityContext = ''
    try {
      const now = new Date()
      const to = now.toISOString().slice(0, 10)
      const from = new Date(now - 7 * 86400000).toISOString().slice(0, 10)
      const shopifyRange = await getShopifyOrdersRange(from, to, { includeOrderDetails: true })
      if (shopifyRange.ok && shopifyRange.orderDetails) {
        const index = getIndex()
        const { newCustomers, returningOrders, newCustomerRevenue } = classifyOrders(shopifyRange.orderDetails, index)
        const totalSpend = perfData.totals?.spend || 0
        const ncac = calculateNCAC(totalSpend, newCustomers)
        const stats = getCustomerStats(index, from, to)
        const fovCac = calculateFOVCAC(stats.avgFirstOrderAov || shopifyRange.revenue / shopifyRange.orders, GRI_ADS.grossMargin, ncac)
        const costOfDelivery = calculateCostOfDelivery(shopifyRange.revenue, shopifyRange.shipping, shopifyRange.orders, GRI_ADS.grossMargin)
        const cm = calculateCM(shopifyRange.revenue, costOfDelivery, totalSpend)
        const amer = calculateAcquisitionMER(newCustomerRevenue, totalSpend)
        profitabilityContext = `
PROFITABILITY METRICS (nCAC Framework - 7 day):
- CM$ (Contribution Margin): $${cm.toFixed(2)} ${cm > 0 ? '(POSITIVE - profitable)' : '(NEGATIVE - losing money)'}
- nCAC (New Customer Acquisition Cost): $${ncac.toFixed(2)} (${newCustomers} new customers)
- FOV/CAC: ${fovCac.toFixed(2)}x ${fovCac >= 3 ? '(strong first-order profit)' : fovCac >= 1 ? '(marginal)' : '(UNDERWATER - losing money on first order)'}
- aMER (Acquisition MER): ${amer.toFixed(2)}x (new customer revenue / total ad spend)
- Repeat Rate: ${shopifyRange.orders > 0 ? ((returningOrders / shopifyRange.orders) * 100).toFixed(1) : 0}%
- New Customer Revenue: $${newCustomerRevenue.toFixed(2)}

IMPORTANT FRAMEWORK RULE: Always evaluate profitability in this order: CM$ first (is the business profitable?), then nCAC (is acquisition cost sustainable?), then FOV/CAC (is the first order profitable?). Channel metrics (Meta ROAS, CPA) are proxies only.
`
      }
    } catch (e) {
      console.error('[Health Check] Profitability context error:', e.message)
    }

    const prompt = `You are a senior Meta Ads media buyer acting as Josh's trusted marketing advisor. Josh runs Gender Reveal Ideas (genderrevealideas.com.au), an Australian DTC e-commerce business selling smoke bombs, confetti cannons, powder extinguishers, balloon boxes, and TNT cannons to expectant parents aged 22-40 (predominantly female, Australia-wide).

Josh is NOT a marketer. He is a hands-on business owner who manages his own Meta Ads account. Talk to him like a trusted friend who happens to be brilliant at media buying. Explain everything in plain English. Be honest about problems but always constructive. Never be vague. Always reference specific ad names, campaign names, and actual numbers.

Here are Josh's REAL Meta Ads metrics right now:

${metricsSummary}

Current estimated total daily budget across active campaigns: $${totalDailyBudget.toFixed(2)}

IMPORTANT: Below is REAL Shopify order data (all channels, not just Meta). This shows the true business performance including Google Ads, organic search, direct, email, and other channels. Meta-attributed purchases are a SUBSET of total orders. Use both data sets for accurate analysis.

${shopifyContext}

Blended ROAS (total Shopify revenue / Meta ad spend) = ${shopify7d && perfData.totals.spend > 0 ? (shopify7d.totalRevenue / perfData.totals.spend).toFixed(2) + 'x' : 'N/A'}
${profitabilityContext}
CRITICAL ATTRIBUTION AND STRUCTURAL RULES:
These rules are non-negotiable. Every recommendation must pass these checks before being included.

1. NEVER RECOMMEND KILLING A PROFITABLE CAMPAIGN OR AD.
   If a campaign or ad has positive ROAS (above 1.0x), it is contributing revenue. You may suggest optimising it, but NEVER recommend pausing or removing it. A 7.38x ROAS campaign is a top performer, not a problem.

2. UNDERSTAND META ATTRIBUTION.
   Meta uses 7-day click / 1-day view attribution by default. This means:
   - An ad showing 0 purchases may still be contributing to conversions. The customer may have seen Ad A, then clicked Ad B and purchased. Ad A gets no credit but played a role.
   - Ads in Advantage+ campaigns work as a system. Individual ads with 0 purchases may be part of Meta's algorithmic rotation and assist other ads in the same campaign.
   - NEVER recommend killing an ad purely because it shows 0 purchases unless it has spent over $50 with zero engagement (clicks) AND has been running for 7+ days.
   - When flagging low-purchase ads, always note: "This ad may be contributing to purchases attributed to other ads in the account through view-through or assisted conversions."

3. ADVANTAGE+ CATALOGUE CAMPAIGNS.
   These are algorithmically optimised by Meta. They work differently from standard campaigns:
   - Meta automatically tests creative combinations, audiences, and placements
   - Individual ad performance within Advantage+ is less meaningful than overall campaign ROAS
   - NEVER recommend restructuring, pausing individual ads within, or removing an Advantage+ campaign that has positive ROAS
   - The correct advice for a strong Advantage+ campaign is to scale budget or leave it alone

4. KILL CRITERIA (the ONLY reasons to recommend pausing an ad):
   - Ad has spent over $50 in the last 7 days with 0 purchases AND 0 add-to-carts AND CTR below 0.5%
   - Ad ROAS is below 0.5x after spending at least $30 over 7+ days
   - Ad frequency is above 4.0 AND performance is declining week over week
   - NEVER recommend killing ads that are less than 5 days old or have spent under $20

5. CROSS-CAMPAIGN EFFECTS.
   Pausing ads in one campaign can negatively impact other campaigns because:
   - Remarketing audiences shrink when top-of-funnel ads stop
   - Lookalike seed audiences lose fresh data
   - Account-level learning is disrupted
   Always consider the full account ecosystem before recommending changes.

6. BUDGET REALLOCATION.
   When recommending budget moves, only suggest moving money FROM campaigns with ROAS below 1.5x TO campaigns with ROAS above 3.0x. Never recommend reducing budget on campaigns above 2.0x ROAS.

GENERAL RULES:
- Use Australian English (colour, optimise, etc.)
- Do NOT use em dashes
- Give specific, actionable steps, not vague advice
- Include Meta Ads Manager navigation steps (e.g. "Go to Ads Manager > Select campaign X > Click Edit > Change budget to $Y")
- Prioritise actions by impact on profitability
- Be realistic about expected results
- If an ad has 0 spend or no data, note it but do not over-analyse it
- Consider that gender reveal products are impulse/event purchases with short consideration windows
- A good ROAS for this business is 3x+, acceptable is 2x+, below 2x needs attention
- A good CPA is under $25 AUD, acceptable up to $40, above $40 needs fixing
- Frequency above 2.5 is worth monitoring, above 4.0 is concerning for this niche (event-based, one-time purchase)
- When in doubt, recommend MONITORING over KILLING. It is better to watch a mediocre ad for another week than to kill it and lose attribution data.

Respond with ONLY valid JSON (no markdown, no code fences) in this exact structure:

{
  "overallHealth": "HEALTHY|NEEDS_ATTENTION|CRITICAL",
  "healthScore": <number 0-100>,
  "summary": "<2-3 sentence plain English overview>",
  "topWins": [
    { "ad": "<ad name>", "campaign": "<campaign name>", "why": "<plain English reason>", "metric": "<key metric value>", "action": "<what to do with this winner>" }
  ],
  "problems": [
    { "ad": "<ad name>", "campaign": "<campaign name>", "issue": "<plain English problem>", "severity": "HIGH|MEDIUM|LOW", "fix": { "step1": "...", "step2": "...", "step3": "..." }, "expectedImpact": "<what fixing this should do>" }
  ],
  "nextMoves": [
    { "priority": <number>, "action": "<what to do>", "why": "<why this matters>", "howTo": "<step by step Meta Ads Manager instructions>", "urgency": "TODAY|THIS_WEEK|NEXT_WEEK" }
  ],
  "budgetAdvice": {
    "currentDaily": <number>,
    "recommendedDaily": <number>,
    "reasoning": "<plain English explanation>",
    "reallocation": [
      { "campaign": "<name>", "current": <number>, "recommended": <number>, "reason": "<why>" }
    ]
  },
  "creativeFreshness": {
    "status": "NEEDS_REFRESH|HEALTHY|STALE",
    "staleAds": ["<ad names that need replacing>"],
    "refreshBrief": "<what kind of creative to make next and why>"
  },
  "weeklyForecast": "<based on current trajectory, what to expect this week>"
}`

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    }, 'ads-strategist-health-check')

    const text = response.content?.[0]?.text || '{}'
    let result
    try {
      result = JSON.parse(text)
    } catch {
      // Try extracting JSON from response if it has extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Claude returned invalid JSON')
      }
    }

    // Save to health log
    const log = loadJSON(HEALTH_LOG_FILE)
    log.push({
      timestamp: new Date().toISOString(),
      healthScore: result.healthScore,
      overallHealth: result.overallHealth,
      totals: perfData.totals,
      result
    })
    // Keep last 90 entries
    if (log.length > 90) log.splice(0, log.length - 90)
    saveJSON(HEALTH_LOG_FILE, log)

    res.json({ ok: true, ...result, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[AdsStrategist] Health check error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /daily-briefing ──────────────────────────────────────────────────────

router.get('/daily-briefing', async (_req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    // Fetch yesterday Meta data + real Shopify orders in parallel
    const [yesterdayData, prevData, shopifyYesterday, shopify7d] = await Promise.all([
      fetchFullPerformance('yesterday'),
      fetchFullPerformance('last_7d'),
      fetchShopifyOrders('yesterday'),
      fetchShopifyOrders('last_7d')
    ])

    enrichWithFatigue(yesterdayData)
    enrichWithFatigue(prevData)

    const yTotals = yesterdayData.totals
    const pTotals = prevData.totals

    // Build a concise summary for Claude with BOTH Meta + Shopify data
    const shopifySection = formatShopifySalesForPrompt(shopifyYesterday)
    const shopify7dSection = shopify7d ? formatShopifySalesForPrompt(shopify7d) : ''

    const briefingContext = `IMPORTANT: There are TWO data sources below. Meta Ads shows only Meta-attributed purchases (7-day click / 1-day view). Shopify shows ALL actual orders from ALL channels (Meta, Google Ads, organic, direct, email, etc.). The Shopify numbers are the REAL total. Use both to give accurate analysis.

=== META ADS DATA (yesterday) ===
Spend: $${yTotals.spend.toFixed(2)} | Meta-Attributed Revenue: $${yTotals.purchaseValue.toFixed(2)} | Meta-Attributed Purchases: ${yTotals.purchases}
ROAS: ${yTotals.roas.toFixed(2)}x | CPA: $${yTotals.cpa.toFixed(2)} | CTR: ${yTotals.ctr.toFixed(2)}%

=== META ADS 7-DAY AVERAGES ===
Avg Daily Spend: $${(pTotals.spend / 7).toFixed(2)} | Avg Daily Revenue: $${(pTotals.purchaseValue / 7).toFixed(2)}
Avg Daily Purchases: ${(pTotals.purchases / 7).toFixed(1)} | Avg ROAS: ${pTotals.roas.toFixed(2)}x

${shopifySection}

${shopify7dSection ? `=== SHOPIFY 7-DAY COMPARISON ===\nTotal 7d Orders: ${shopify7d.totalOrders} | Total 7d Revenue: $${shopify7d.totalRevenue.toFixed(2)}\nAvg Daily Orders: ${(shopify7d.totalOrders / 7).toFixed(1)} | Avg Daily Revenue: $${(shopify7d.totalRevenue / 7).toFixed(2)}\n` : ''}

ACTIVE ADS YESTERDAY:
${yesterdayData.campaigns.map(c => {
  const activeAds = (c.ads || []).filter(a => a.status === 'ACTIVE')
  if (!activeAds.length) return ''
  return `Campaign: ${c.name}\n${activeAds.map(a => {
    const ai = a.insights
    const f = a.fatigue
    return `  - ${a.name}: ${ai ? `$${ai.spend.toFixed(2)} spend, ${ai.roas.toFixed(2)}x ROAS, ${ai.purchases} purchases` : 'No data'} | Fatigue: ${f?.status || 'N/A'} (${f?.score ?? 'N/A'})`
  }).join('\n')}`
}).filter(Boolean).join('\n\n')}`

    const prompt = `You are Josh's trusted Meta Ads advisor. Josh runs Gender Reveal Ideas, an Australian DTC e-commerce business. This is his morning briefing.

${briefingContext}

CRITICAL: You have BOTH Meta Ads data AND real Shopify order data. When reporting total orders and revenue, use the SHOPIFY numbers (they are the real total). Meta numbers only show Meta-attributed purchases. The difference between Shopify total and Meta-attributed = orders from Google Ads, organic, direct, email, and other channels. Always call this out so Josh sees the full picture.

IMPORTANT RULES:
- Use Australian English (colour, optimise, etc.)
- Do NOT use em dashes
- Be conversational and encouraging but honest
- Keep it scannable, Josh reads this first thing in the morning
- Reference specific ad names and numbers
- When saying "X purchases yesterday", use the SHOPIFY total, then break down by source
- Gender reveal products: impulse/event purchases, good ROAS is 3x+, good CPA is under $25 AUD
- Calculate blended ROAS as: total Shopify revenue / total Meta ad spend (gives the real return on ad investment including halo effect)

Respond with ONLY valid JSON (no markdown, no code fences):

{
  "greeting": "<warm morning greeting with Josh's name>",
  "totalOrders": <actual Shopify order count>,
  "totalRevenue": <actual Shopify revenue>,
  "metaAttributed": <Meta-attributed purchases>,
  "blendedROAS": <total Shopify revenue / Meta spend>,
  "sourceBreakdown": "<e.g. Meta: 7, Google: 5, Organic: 4, Direct: 3>",
  "yesterdayVsPrevious": {
    "spend": "<change like +$12 or -$5>",
    "roas": "<change like +0.3 or -0.5>",
    "purchases": "<change like +2 or -1 based on Shopify totals>"
  },
  "headline": "<one sentence summary using REAL Shopify order count>",
  "attentionNeeded": ["<things that need action today>"],
  "workingWell": ["<things that are performing well>"],
  "todaysPlan": ["<ordered list of what Josh should do today>"],
  "topProducts": ["<top selling products from Shopify data>"],
  "marketPulse": "<brief note on trends, channel mix, or patterns>"
}`

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    }, 'ads-strategist-daily-briefing')

    const text = response.content?.[0]?.text || '{}'
    let result
    try {
      result = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Claude returned invalid JSON')
      }
    }

    res.json({ ok: true, ...result, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[AdsStrategist] Daily briefing error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /health-log ──────────────────────────────────────────────────────────

router.get('/health-log', (_req, res) => {
  const log = loadJSON(HEALTH_LOG_FILE)
  res.json({ ok: true, entries: log })
})

export default router
