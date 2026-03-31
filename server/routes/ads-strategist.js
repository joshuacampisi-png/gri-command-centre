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

    const perfData = await fetchFullPerformance('last_7d')
    enrichWithFatigue(perfData)

    const metricsSummary = buildMetricsSummary(perfData)
    const totalDailyBudget = perfData.campaigns
      .filter(c => c.status === 'ACTIVE' && c.dailyBudget)
      .reduce((sum, c) => sum + c.dailyBudget, 0)

    const prompt = `You are a senior Meta Ads media buyer acting as Josh's trusted marketing advisor. Josh runs Gender Reveal Ideas (genderrevealideas.com.au), an Australian DTC e-commerce business selling smoke bombs, confetti cannons, powder extinguishers, balloon boxes, and TNT cannons to expectant parents aged 22-40 (predominantly female, Australia-wide).

Josh is NOT a marketer. He is a hands-on business owner who manages his own Meta Ads account. Talk to him like a trusted friend who happens to be brilliant at media buying. Explain everything in plain English. Be honest about problems but always constructive. Never be vague. Always reference specific ad names, campaign names, and actual numbers.

Here are Josh's REAL Meta Ads metrics right now:

${metricsSummary}

Current estimated total daily budget across active campaigns: $${totalDailyBudget.toFixed(2)}

IMPORTANT RULES:
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
- Frequency above 2.5 is concerning for this niche (event-based, one-time purchase)

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

    // Fetch yesterday and day-before data
    const [yesterdayData, prevData] = await Promise.all([
      fetchFullPerformance('yesterday'),
      fetchFullPerformance('last_7d')
    ])

    enrichWithFatigue(yesterdayData)
    enrichWithFatigue(prevData)

    const yTotals = yesterdayData.totals
    const pTotals = prevData.totals

    // Build a concise summary for Claude
    const briefingContext = `YESTERDAY'S PERFORMANCE:
Spend: $${yTotals.spend.toFixed(2)} | Revenue: $${yTotals.purchaseValue.toFixed(2)} | Purchases: ${yTotals.purchases}
ROAS: ${yTotals.roas.toFixed(2)}x | CPA: $${yTotals.cpa.toFixed(2)} | CTR: ${yTotals.ctr.toFixed(2)}%

7-DAY AVERAGES (for comparison):
Avg Daily Spend: $${(pTotals.spend / 7).toFixed(2)} | Avg Daily Revenue: $${(pTotals.purchaseValue / 7).toFixed(2)}
Avg Daily Purchases: ${(pTotals.purchases / 7).toFixed(1)} | Avg ROAS: ${pTotals.roas.toFixed(2)}x

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

IMPORTANT RULES:
- Use Australian English (colour, optimise, etc.)
- Do NOT use em dashes
- Be conversational and encouraging but honest
- Keep it scannable, Josh reads this first thing in the morning
- Reference specific ad names and numbers
- Gender reveal products: impulse/event purchases, good ROAS is 3x+, good CPA is under $25 AUD

Respond with ONLY valid JSON (no markdown, no code fences):

{
  "greeting": "<warm morning greeting with Josh's name>",
  "yesterdayVsPrevious": {
    "spend": "<change like +$12 or -$5>",
    "roas": "<change like +0.3 or -0.5>",
    "purchases": "<change like +2 or -1>"
  },
  "headline": "<one sentence summary of yesterday>",
  "attentionNeeded": ["<things that need action today>"],
  "workingWell": ["<things that are performing well>"],
  "todaysPlan": ["<ordered list of what Josh should do today>"],
  "marketPulse": "<brief note on trends or patterns>"
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
