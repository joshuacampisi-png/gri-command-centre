/**
 * /api/ads/* routes — Meta Ads performance data, fatigue engine, AI recommendations.
 */
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  isMetaConfigured,
  metaToken,
  fetchFullPerformance,
  fetchAccountInsights,
  fetchCampaigns,
  fetchAdInsights,
  fetchAdInsightsByDay,
  pauseAd as metaPauseAd,
  updateCampaignStatus,
  updateCampaignBudget,
  updateAdSetStatus,
  updateAdSetBudget,
  updateAdStatus
} from '../lib/meta-api.js'
import { getShopifyOrdersRange } from '../connectors/shopify.js'
import {
  GRI_ADS,
  calculateMER,
  calculateTrueCAC,
  calculateCPA,
  calculateNCAC,
  calculateFOVCAC,
  calculateCM,
  calculateCostOfDelivery,
  calculateAcquisitionMER,
  calculateAMER,
  calculateNPOAS,
  calculateCampaignHealth,
  generateAlerts,
  calculateScalePath,
  generateSurgicalActions,
  getNcacThresholds,
  getNcacStatus,
  getFovCacStatus,
  getCmStatus,
  getAcquisitionMerStatus,
  getNewCustomerTrendStatus,
} from '../lib/ads-metrics.js'
import {
  getIndex,
  classifyOrders,
  bootstrapIndex as bootstrapCustomerIndex,
  getCustomerStats,
} from '../lib/customer-index.js'
import {
  calculateFatigueScore,
  prepareFatigueMetrics,
  STATUS_COLORS
} from '../lib/fatigue-engine.js'
import {
  verifySecret,
  recordGoogleSpend,
  getGoogleSpend,
  getLatestGoogleDate,
  getAllGoogleSpend,
} from '../lib/google-ads-spend.js'
import { callClaude } from '../lib/claude-guard.js'
import { sendAdsDailyReport } from '../lib/ads-telegram-report.js'
import { sendAdsDaily } from '../lib/ads-daily-report.js'
import { sendAdsWeekly } from '../lib/ads-weekly-report.js'
import { dataFile } from '../lib/data-dir.js'

const router = Router()
const SNAPSHOT_FILE = dataFile('ads-snapshots.json')
const REFRESH_LOG_FILE = dataFile('ads-creative-refreshes.json')

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(file) {
  if (!existsSync(file)) return []
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return [] }
}

function saveJSON(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2))
}

// ── In-memory cache (avoids hammering Meta API on every page load) ──────────

const cache = new Map()
const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() })
}

// ── Fetch previous period insights (single lightweight API call) ────────────

async function fetchPrevPeriodInsights(preset) {
  if (preset === 'today') {
    return fetchAccountInsights('yesterday')
  }
  if (!preset.startsWith('last_')) return null

  const days = parseInt(preset.replace('last_', '').replace('d', ''))
  const end = new Date()
  end.setDate(end.getDate() - days)
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  const since = start.toISOString().slice(0, 10)
  const until = end.toISOString().slice(0, 10)

  const token = metaToken()
  const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528'
  const url = `https://graph.facebook.com/v20.0/${accountId}/insights?fields=spend,impressions,clicks,actions,action_values&time_range={"since":"${since}","until":"${until}"}&access_token=${token}`
  const resp = await fetch(url)
  const prevData = await resp.json()

  if (!prevData.data?.[0]) return null
  const p = prevData.data[0]
  const pSpend = parseFloat(p.spend || 0)
  const pActions = {}
  for (const a of (p.actions || [])) pActions[a.action_type] = parseInt(a.value)
  const pValues = {}
  for (const a of (p.action_values || [])) pValues[a.action_type] = parseFloat(a.value)
  const pPurchases = pActions.purchase || 0
  const pRevenue = pValues.purchase || 0
  return {
    spend: pSpend,
    impressions: parseInt(p.impressions || 0),
    clicks: parseInt(p.clicks || 0),
    purchases: pPurchases,
    purchaseValue: pRevenue,
    roas: pSpend > 0 ? pRevenue / pSpend : 0,
    cpa: pPurchases > 0 ? pSpend / pPurchases : 0,
    ctr: parseInt(p.impressions || 0) > 0 ? (parseInt(p.clicks || 0) / parseInt(p.impressions || 0)) * 100 : 0,
    cpm: parseInt(p.impressions || 0) > 0 ? (pSpend / parseInt(p.impressions || 0)) * 1000 : 0,
  }
}

// ── GET /api/ads/performance ─────────────────────────────────────────────────

router.get('/performance', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured. Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID.' })
    }

    const dateRange = req.query.dateRange || 'last_7d'
    const datePresetMap = {
      'today': 'today',
      'yesterday': 'yesterday',
      '7d': 'last_7d',
      '14d': 'last_14d',
      '30d': 'last_30d',
      'last_7d': 'last_7d',
      'last_14d': 'last_14d',
      'last_30d': 'last_30d'
    }
    const preset = datePresetMap[dateRange] || 'last_7d'

    // Check cache first
    const cacheKey = `perf:${preset}`
    const cached = getCached(cacheKey)
    if (cached) {
      return res.json(cached)
    }

    // Quick token validation — catch expired/invalid tokens early
    const token = metaToken()
    const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528'
    try {
      const check = await fetch(`https://graph.facebook.com/v20.0/${accountId}?fields=name,account_status&access_token=${token}`)
      const checkData = await check.json()
      if (checkData.error) {
        const msg = checkData.error.message || 'Unknown Meta API error'
        console.error('[Ads] Meta token/account check failed:', msg)
        return res.json({ ok: false, error: `Meta API error: ${msg}` })
      }
      // account_status: 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, 7 = PENDING_RISK_REVIEW, 8 = PENDING_SETTLEMENT, 9 = IN_GRACE_PERIOD, 100 = PENDING_CLOSURE, 101 = CLOSED, 201 = ANY_ACTIVE, 202 = ANY_CLOSED
      if (checkData.account_status && checkData.account_status !== 1) {
        console.warn(`[Ads] Account status is ${checkData.account_status} (not ACTIVE)`)
      }
    } catch (e) {
      console.error('[Ads] Could not reach Meta API:', e.message)
      return res.json({ ok: false, error: `Cannot reach Meta API: ${e.message}` })
    }

    // Track warnings from sub-fetches
    const warnings = []

    // One full fetch for the selected range (campaigns + ads + fatigue)
    const perfData = await fetchFullPerformance(preset)
    const campaigns = perfData.campaigns || perfData

    if (campaigns.length === 0) {
      warnings.push('No campaigns found. Check META_GRI_CAMPAIGN_IDS or ad account permissions.')
    }

    // Build portfolio context for revenue-aware health scoring
    let portfolioTotalSpend = 0, portfolioTotalPurchases = 0
    for (const c of campaigns) {
      portfolioTotalSpend += c.insights?.spend || 0
      portfolioTotalPurchases += c.insights?.purchases || 0
    }
    const portfolio = {
      totalSpend: portfolioTotalSpend,
      totalRevenue: portfolioTotalPurchases * GRI_ADS.aov,
      weeklyTarget: 10000
    }

    // Enrich with fatigue scores, health, and surgical actions
    for (const campaign of campaigns) {
      if (!campaign.insights) {
        warnings.push(`Campaign "${campaign.name}" returned no insights for ${preset}`)
      }
      for (const ad of campaign.ads || []) {
        const metrics = prepareFatigueMetrics(ad)
        ad.fatigue = calculateFatigueScore(metrics)
      }

      // Campaign-level health score (portfolio-aware — won't cull revenue pillars)
      const health = calculateCampaignHealth(campaign, portfolio)
      campaign.healthScore = health.score
      campaign.healthStatus = health.status
      campaign.healthReasons = health.reasons

      // Surgical actions: specific ad-set and ad-level recommendations
      campaign.surgicalActions = generateSurgicalActions(campaign)
    }

    // Aggregate KPI for the selected date range
    const rangeKPI = aggregateKPI(campaigns)

    // Lightweight account-level fetches for today/yesterday/prev (1 API call each, not full fetches)
    const [todayKPI, yesterdayKPI, prevKPI] = await Promise.all([
      fetchAccountInsights('today').catch(e => { warnings.push(`Today insights: ${e.message}`); return null }),
      fetchAccountInsights('yesterday').catch(e => { warnings.push(`Yesterday insights: ${e.message}`); return null }),
      fetchPrevPeriodInsights(preset).catch(e => { warnings.push(`Prev period: ${e.message}`); return null })
    ])

    // If everything is zero, flag it
    if (rangeKPI.spend === 0 && rangeKPI.impressions === 0 && !todayKPI && !yesterdayKPI) {
      warnings.push('All KPIs are zero — Meta may be returning empty data. Check token permissions and campaign status.')
    }

    if (warnings.length > 0) {
      console.warn('[Ads] Warnings:', warnings.join(' | '))
    }

    const result = {
      ok: true,
      kpi: {
        today: todayKPI,
        yesterday: yesterdayKPI,
        range: rangeKPI,
        prev: prevKPI,
        rangeLabel: preset
      },
      campaigns,
      warnings: warnings.length > 0 ? warnings : undefined,
      lastSynced: new Date().toISOString()
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (err) {
    console.error('[Ads] Performance fetch error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/ads/daily-breakdown ─────────────────────────────────────────────

router.get('/daily-breakdown', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }
    const days = parseInt(req.query.days) || 7

    // Check cache
    const cacheKey = `daily:${days}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const token = metaToken()
    const accountId = process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528'
    const url = `https://graph.facebook.com/v20.0/${accountId}/insights?fields=spend,impressions,clicks,actions,action_values,cpm,ctr,frequency&time_increment=1&date_preset=last_${days}d&access_token=${token}`
    const resp = await fetch(url)
    const data = await resp.json()

    if (data.error) throw new Error(data.error.message)

    const breakdown = (data.data || []).map(day => {
      const actions = {}
      for (const a of (day.actions || [])) actions[a.action_type] = parseInt(a.value)
      const values = {}
      for (const a of (day.action_values || [])) values[a.action_type] = parseFloat(a.value)
      const spend = parseFloat(day.spend || 0)
      const purchases = actions.purchase || 0
      const revenue = values.purchase || 0
      return {
        date: day.date_start,
        spend,
        impressions: parseInt(day.impressions || 0),
        clicks: parseInt(day.clicks || 0),
        purchases,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
        ctr: parseFloat(day.ctr || 0),
        cpm: parseFloat(day.cpm || 0),
        frequency: parseFloat(day.frequency || 0),
      }
    })

    const result = { ok: true, breakdown }
    setCache(cacheKey, result)
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/ads/debug — diagnose Meta API connectivity ─────────────────────

router.get('/debug', async (_req, res) => {
  const token = metaToken()
  const result = {
    configured: isMetaConfigured(),
    tokenSet: Boolean(token),
    tokenPreview: token ? `${token.slice(0, 12)}...${token.slice(-6)}` : 'NOT SET',
    accountId: process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528',
    campaignIds: process.env.META_GRI_CAMPAIGN_IDS || 'hardcoded defaults',
  }

  if (!result.configured) {
    return res.json({ ok: false, ...result, error: 'Meta API not configured' })
  }

  // Test 1: Can we reach Meta API at all?
  try {
    const accountId = result.accountId
    const tokenCheck = await fetch(`https://graph.facebook.com/v20.0/${accountId}?fields=name,account_status,currency,timezone_name&access_token=${token}`)
    const tokenData = await tokenCheck.json()
    if (tokenData.error) {
      result.tokenValid = false
      result.tokenError = tokenData.error.message
      result.tokenErrorCode = tokenData.error.code
      result.tokenErrorSubcode = tokenData.error.error_subcode
      return res.json({ ok: false, ...result, error: 'Meta token invalid or expired' })
    }
    result.tokenValid = true
    result.account = tokenData
  } catch (e) {
    result.tokenValid = false
    result.tokenError = e.message
    return res.json({ ok: false, ...result, error: 'Failed to reach Meta API' })
  }

  // Test 2: Can we fetch campaigns?
  try {
    const campaigns = await fetchCampaigns()
    result.campaignCount = campaigns.length
    result.campaigns = campaigns.map(c => ({ id: c.id, name: c.name, status: c.status }))
  } catch (e) {
    result.campaignError = e.message
  }

  // Test 3: Can we fetch account insights?
  try {
    const insights = await fetchAccountInsights('last_7d')
    result.last7dInsights = insights
  } catch (e) {
    result.insightsError = e.message
  }

  result.ok = true
  res.json(result)
})

// ── GET /api/ads/campaigns ───────────────────────────────────────────────────

router.get('/campaigns', async (_req, res) => {
  try {
    if (!isMetaConfigured()) return res.json({ ok: false, error: 'Meta API not configured' })
    const campaigns = await fetchCampaigns()
    res.json({ ok: true, campaigns })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/refresh-recommendation ─────────────────────────────────────

router.post('/refresh-recommendation', async (req, res) => {
  try {
    const { adName, campaignName, metrics } = req.body
    if (!adName) return res.status(400).json({ ok: false, error: 'Missing adName' })

    const prompt = `You are an expert Meta media buyer specialising in Australian DTC e-commerce, specifically gender reveal party products.

Ad: ${adName}
Campaign: ${campaignName || 'Unknown'}
Current metrics: Frequency ${metrics?.frequency || '?'}, CTR ${metrics?.ctr || '?'}%, ROAS ${metrics?.roas || '?'}, CPA $${metrics?.cpa || '?'} AUD, Days running: ${metrics?.daysRunning || '?'}
Fatigue score: ${metrics?.fatigueScore || '?'}/100

The brand is Gender Reveal Ideas (genderrevealideas.com.au). Products: smoke bombs, confetti cannons, balloon boxes, powder cannons, TNT cannons, gender reveal kits. Australian market. Target audience: expectant parents aged 22-40, predominantly female.

Provide:
1. One-line diagnosis of why this ad is fatiguing
2. Exact creative brief for a replacement ad (hook, visual direction, copy angle, format — Reel vs static vs carousel)
3. The one thing to change that will have the biggest impact on performance
4. Recommended testing budget for the refresh creative

Format response as JSON:
{
  "diagnosis": "",
  "creativeBrief": { "hook": "", "visual": "", "copyAngle": "", "format": "" },
  "biggestLever": "",
  "testBudget": ""
}`

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    }, 'ads-refresh-recommendation')

    const text = response.content[0].text.trim()
    let recommendation
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      recommendation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      recommendation = { diagnosis: text, creativeBrief: {}, biggestLever: '', testBudget: '' }
    }

    res.json({ ok: true, recommendation })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/pause/:adId ────────────────────────────────────────────────

router.post('/pause/:adId', async (req, res) => {
  try {
    if (!isMetaConfigured()) return res.status(400).json({ ok: false, error: 'Meta API not configured' })
    await metaPauseAd(req.params.adId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/report/send ────────────────────────────────────────────────

router.post('/report/send', async (_req, res) => {
  try {
    const result = await sendAdsDailyReport()
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/report/daily ────────────────────────────────────────────────

router.post('/report/daily', async (_req, res) => {
  try {
    const result = await sendAdsDaily()
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/report/weekly ───────────────────────────────────────────────

router.post('/report/weekly', async (_req, res) => {
  try {
    const result = await sendAdsWeekly()
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/ads/snapshots ───────────────────────────────────────────────────

router.get('/snapshots', (req, res) => {
  const snapshots = loadJSON(SNAPSHOT_FILE)
  const date = req.query.date
  if (date) {
    return res.json({ ok: true, snapshots: snapshots.filter(s => s.snapshotDate === date) })
  }
  // Return last 30 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  res.json({ ok: true, snapshots: snapshots.filter(s => s.snapshotDate >= cutoffStr) })
})

// ── POST /api/ads/snapshot/save ──────────────────────────────────────────────

router.post('/snapshot/save', async (_req, res) => {
  try {
    if (!isMetaConfigured()) return res.status(400).json({ ok: false, error: 'Meta not configured' })

    const snapData = await fetchFullPerformance('today')
    const campaigns = snapData.campaigns || snapData
    const today = new Date().toISOString().slice(0, 10)
    const snapshots = loadJSON(SNAPSHOT_FILE)

    for (const c of campaigns) {
      for (const ad of c.ads || []) {
        const metrics = prepareFatigueMetrics(ad)
        const fatigue = calculateFatigueScore(metrics)

        snapshots.push({
          snapshotDate: today,
          adId: ad.id,
          adName: ad.name,
          campaignId: c.id,
          campaignName: c.name,
          impressions: ad.insights?.impressions || 0,
          clicks: ad.insights?.clicks || 0,
          spend: ad.insights?.spend || 0,
          purchases: ad.insights?.purchases || 0,
          purchaseValue: ad.insights?.purchaseValue || 0,
          frequency: ad.insights?.frequency || 0,
          ctr: ad.insights?.ctr || 0,
          cpm: ad.insights?.cpm || 0,
          cpa: ad.insights?.cpa || 0,
          roas: ad.insights?.roas || 0,
          daysRunning: ad.daysRunning || 0,
          fatigueScore: fatigue.score,
          fatigueStatus: fatigue.status,
          createdAt: new Date().toISOString()
        })
      }
    }

    saveJSON(SNAPSHOT_FILE, snapshots)
    res.json({ ok: true, count: snapshots.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function aggregateKPI(campaigns) {
  let spend = 0, impressions = 0, clicks = 0, purchases = 0, purchaseValue = 0

  for (const c of campaigns) {
    if (c.insights) {
      spend += c.insights.spend || 0
      impressions += c.insights.impressions || 0
      clicks += c.insights.clicks || 0
      purchases += c.insights.purchases || 0
      purchaseValue += c.insights.purchaseValue || 0
    }
  }

  return {
    spend,
    impressions,
    clicks,
    purchases,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    cpa: purchases > 0 ? spend / purchases : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0
  }
}

// ── GET /api/ads/truth-metrics ───────────────────────────────────────────────
// Fetches BOTH Shopify revenue AND Meta spend for same period, calculates
// MER, True CAC, AMER, NPOAS — the numbers that actually matter.

router.get('/truth-metrics', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    const dateRange = req.query.dateRange || '7d'

    // AEST date (use Intl to get correct offset including daylight saving)
    const aestNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
    const todayStr = aestNow.toISOString().slice(0, 10)

    // For "today": just today. For Xd ranges: match Meta's last_Xd = X days ending yesterday.
    // This ensures Shopify revenue window aligns exactly with Meta spend window.
    let fromStr, toStr
    const daysMap = { 'today': 1, '7d': 7, '14d': 14, '30d': 30, 'last_7d': 7, 'last_14d': 14, 'last_30d': 30 }
    const days = daysMap[dateRange] || 7
    if (dateRange === 'today') {
      fromStr = todayStr
      toStr = todayStr
    } else {
      // Meta last_7d = 7 days ending yesterday, so Shopify should match
      const yesterday = new Date(aestNow)
      yesterday.setDate(yesterday.getDate() - 1)
      toStr = yesterday.toISOString().slice(0, 10)
      const fromDate = new Date(yesterday)
      fromDate.setDate(fromDate.getDate() - (days - 1))
      fromStr = fromDate.toISOString().slice(0, 10)
    }

    console.log(`[Truth] dateRange=${dateRange}, Shopify window: ${fromStr} to ${toStr}`)

    // Map to Meta preset
    const presetMap = { 'today': 'today', '7d': 'last_7d', '14d': 'last_14d', '30d': 'last_30d', 'last_7d': 'last_7d', 'last_14d': 'last_14d', 'last_30d': 'last_30d' }
    const preset = presetMap[dateRange] || 'last_7d'

    // Fetch Meta + Shopify in parallel
    const [metaInsights, shopifyData] = await Promise.all([
      fetchAccountInsights(preset),
      getShopifyOrdersRange(fromStr, toStr)
    ])

    const totalSpend = metaInsights?.spend || 0
    const shopifyRevenue = shopifyData?.ok ? shopifyData.revenue : 0
    const shopifyOrders = shopifyData?.ok ? shopifyData.orders : 0
    const shopifyAov = shopifyOrders > 0 ? shopifyRevenue / shopifyOrders : 0

    const mer = calculateMER(shopifyRevenue, totalSpend)
    const trueCac = calculateTrueCAC(totalSpend, shopifyOrders)
    const amer = calculateAMER(shopifyRevenue, totalSpend, GRI_ADS.grossMarginPct)
    const npoas = calculateNPOAS(shopifyRevenue, totalSpend, GRI_ADS.grossMarginPct)

    res.json({
      ok: true,
      truth: {
        mer,
        trueCac,
        amer,
        npoas,
        totalSpend,
        shopifyRevenue,
        shopifyOrders,
        shopifyAov,
        breakevenRoas: GRI_ADS.breakevenROAS,
        dateRange,
        days,
        from: fromStr,
        to: toStr
      }
    })
  } catch (err) {
    console.error('[Ads] Truth metrics error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/ads/profitability-metrics ──────────────────────────────────────
// The nCAC & LTGP framework endpoint. Returns 4-layer profitability hierarchy.
// Layer 1: CM$ (scoreboard). Layer 2: Business. Layer 3: Customer. Layer 4: Channel.

router.get('/profitability-metrics', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    const dateRange = req.query.dateRange || '7d'

    // AEST date
    const aestNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
    const todayStr = aestNow.toISOString().slice(0, 10)

    let fromStr, toStr
    const daysMap = { 'today': 1, '7d': 7, '14d': 14, '30d': 30, 'last_7d': 7, 'last_14d': 14, 'last_30d': 30 }
    const days = daysMap[dateRange] || 7
    if (dateRange === 'today') {
      fromStr = todayStr
      toStr = todayStr
    } else {
      const yesterday = new Date(aestNow)
      yesterday.setDate(yesterday.getDate() - 1)
      toStr = yesterday.toISOString().slice(0, 10)
      const fromDate = new Date(yesterday)
      fromDate.setDate(fromDate.getDate() - (days - 1))
      fromStr = fromDate.toISOString().slice(0, 10)
    }

    // Previous period for comparison (same length, immediately before)
    const prevToDate = new Date(fromStr + 'T00:00:00+10:00')
    prevToDate.setDate(prevToDate.getDate() - 1)
    const prevToStr = prevToDate.toISOString().slice(0, 10)
    const prevFromDate = new Date(prevToDate)
    prevFromDate.setDate(prevFromDate.getDate() - (days - 1))
    const prevFromStr = prevFromDate.toISOString().slice(0, 10)

    const presetMap = { 'today': 'today', '7d': 'last_7d', '14d': 'last_14d', '30d': 'last_30d' }
    const preset = presetMap[dateRange] || 'last_7d'

    console.log(`[Profitability] dateRange=${dateRange}, window: ${fromStr} to ${toStr}, prev: ${prevFromStr} to ${prevToStr}`)

    // Fetch Meta spend + Shopify orders (with details) + previous period in parallel
    const [metaInsights, shopifyData, prevShopifyData] = await Promise.all([
      fetchAccountInsights(preset),
      getShopifyOrdersRange(fromStr, toStr, { includeOrderDetails: true }),
      getShopifyOrdersRange(prevFromStr, prevToStr, { includeOrderDetails: true }),
    ])

    // Combine Meta + Google spend for real total
    const metaSpend = metaInsights?.spend || 0
    const googleSpendData = getGoogleSpend(fromStr, toStr)
    const googleSpend = googleSpendData.totalSpend || 0
    const totalSpend = metaSpend + googleSpend
    const shopifyRevenue = shopifyData?.ok ? shopifyData.revenue : 0
    const shopifyOrders = shopifyData?.ok ? shopifyData.orders : 0
    const shopifyShipping = shopifyData?.ok ? shopifyData.shipping : 0
    const shopifyAov = shopifyOrders > 0 ? shopifyRevenue / shopifyOrders : 0

    // Load customer index and classify orders
    const customerIndex = getIndex()
    const orderDetails = shopifyData?.orderDetails || []
    const prevOrderDetails = prevShopifyData?.orderDetails || []

    // Classify current period orders
    const current = classifyOrders(
      orderDetails.map(o => ({ ...o, total_price: o.aov, created_at: o.createdAt, contact_email: o.email })),
      customerIndex, fromStr, toStr
    )

    // Classify previous period for WoW comparison
    const prev = classifyOrders(
      prevOrderDetails.map(o => ({ ...o, total_price: o.aov, created_at: o.createdAt, contact_email: o.email })),
      customerIndex, prevFromStr, prevToStr
    )

    // ── Layer 1: Scoreboard (CM$) ──
    const costOfDelivery = calculateCostOfDelivery(shopifyRevenue, shopifyShipping, shopifyOrders)
    const cm = calculateCM(shopifyRevenue, costOfDelivery, totalSpend)
    const prevCostOfDelivery = calculateCostOfDelivery(
      prevShopifyData?.revenue || 0, prevShopifyData?.shipping || 0, prevShopifyData?.orders || 0
    )
    const prevCm = calculateCM(prevShopifyData?.revenue || 0, prevCostOfDelivery, totalSpend)
    const cmStatus = getCmStatus(cm, prevCm)

    // ── Layer 2: Business Metrics ──
    const mer = calculateMER(shopifyRevenue, totalSpend)

    // ── Layer 3: Customer Metrics ──
    const ncac = calculateNCAC(totalSpend, current.newCustomers)
    const ncacThresholds = getNcacThresholds(GRI_ADS.ncac) // TODO: replace with 90-day rolling avg once we have history
    const ncacStatus = getNcacStatus(ncac, ncacThresholds)

    const fovCac = calculateFOVCAC(current.firstOrderAov, GRI_ADS.grossMarginPct, ncac)
    const fovCacStatus = getFovCacStatus(fovCac)

    const amer = calculateAcquisitionMER(current.newCustomerRevenue, totalSpend)
    const amerStatus = getAcquisitionMerStatus(amer)

    const repeatRate = shopifyOrders > 0 ? current.returningCustomers / shopifyOrders : 0

    // New customer WoW trend
    const newCustWowChange = prev.newCustomers > 0
      ? ((current.newCustomers - prev.newCustomers) / prev.newCustomers) * 100
      : 0
    const newCustStatus = getNewCustomerTrendStatus(newCustWowChange)

    // ── Layer 4: Channel Proxies ──
    const metaRoas = metaInsights?.roas || 0
    const metaCpa = metaInsights?.purchases > 0 ? totalSpend / metaInsights.purchases : 0

    // CM trend
    const cmTrend = prevCm !== 0 ? ((cm - prevCm) / Math.abs(prevCm)) * 100 : 0

    res.json({
      ok: true,
      profitability: {
        layer1: {
          cm: Math.round(cm * 100) / 100,
          cmStatus,
          cmTrend: Math.round(cmTrend * 10) / 10,
          costOfDelivery: Math.round(costOfDelivery * 100) / 100,
        },
        layer2: {
          revenue: Math.round(shopifyRevenue * 100) / 100,
          adSpend: Math.round(totalSpend * 100) / 100,
          metaSpend: Math.round(metaSpend * 100) / 100,
          googleSpend: Math.round(googleSpend * 100) / 100,
          googleHasData: googleSpendData.hasData,
          mer: Math.round(mer * 100) / 100,
          aov: Math.round(shopifyAov * 100) / 100,
          orders: shopifyOrders,
        },
        layer3: {
          ncac: Math.round(ncac * 100) / 100,
          ncacStatus,
          ncacThresholds,
          fovCac: Math.round(fovCac * 100) / 100,
          fovCacStatus,
          firstOrderAov: Math.round(current.firstOrderAov * 100) / 100,
          amer: Math.round(amer * 100) / 100,
          amerStatus,
          newCustomers: current.newCustomers,
          returningCustomers: current.returningCustomers,
          unknownOrders: current.unknownOrders,
          newCustomerRevenue: Math.round(current.newCustomerRevenue * 100) / 100,
          newCustWowChange: Math.round(newCustWowChange * 10) / 10,
          newCustStatus,
          repeatRate: Math.round(repeatRate * 1000) / 10, // percentage
        },
        layer4: {
          metaRoas: Math.round(metaRoas * 100) / 100,
          metaCpa: Math.round(metaCpa * 100) / 100,
          metaPurchases: metaInsights?.purchases || 0,
        },
        dateRange,
        days,
        from: fromStr,
        to: toStr,
      }
    })
  } catch (err) {
    console.error('[Ads] Profitability metrics error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/google-spend/webhook ──────────────────────────────────────
// Receives daily spend data from Google Ads Scripts. No auth required (uses secret).

router.post('/google-spend/webhook', (req, res) => {
  try {
    const { secret, days } = req.body

    if (!verifySecret(secret)) {
      console.warn('[GoogleAds] Webhook: invalid secret')
      return res.status(403).json({ ok: false, error: 'Invalid secret' })
    }

    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ ok: false, error: 'No data provided' })
    }

    const updated = recordGoogleSpend(days)
    console.log(`[GoogleAds] Webhook received: ${updated} days of spend data`)

    res.json({ ok: true, updated })
  } catch (err) {
    console.error('[GoogleAds] Webhook error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/ads/google-spend ───────────────────────────────────────────────
// Returns stored Google Ads spend data for a date range.

router.get('/google-spend', (req, res) => {
  try {
    const { from, to } = req.query
    if (from && to) {
      const data = getGoogleSpend(from, to)
      return res.json({ ok: true, ...data })
    }

    // No range = return all + latest date
    const all = getAllGoogleSpend()
    const latestDate = getLatestGoogleDate()
    res.json({ ok: true, latestDate, entries: Object.keys(all).length, data: all })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/bootstrap-customer-index ─────────────────────────────────
// One-time (idempotent) endpoint to build the customer index from historical orders.

router.post('/bootstrap-customer-index', async (req, res) => {
  try {
    const aestNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
    const todayStr = aestNow.toISOString().slice(0, 10)

    // Fetch max available history (60 days)
    const fromDate = new Date(aestNow)
    fromDate.setDate(fromDate.getDate() - 60)
    const fromStr = fromDate.toISOString().slice(0, 10)

    console.log(`[Bootstrap] Fetching orders from ${fromStr} to ${todayStr}`)

    const shopifyData = await getShopifyOrdersRange(fromStr, todayStr, { includeOrderDetails: true })
    if (!shopifyData?.ok || !shopifyData.orderDetails) {
      return res.json({ ok: false, error: 'Failed to fetch Shopify orders' })
    }

    // Sort by date ascending (oldest first) so first purchases are correctly identified
    const orders = shopifyData.orderDetails
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(o => ({
        id: o.id,
        contact_email: o.email,
        total_price: o.aov,
        created_at: o.createdAt,
        name: o.name,
      }))

    console.log(`[Bootstrap] Processing ${orders.length} orders...`)
    const result = bootstrapCustomerIndex(orders)
    console.log(`[Bootstrap] Complete:`, result)

    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[Ads] Bootstrap customer index error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /api/ads/scale-path ─────────────────────────────────────────────────
// Returns scale path calculations based on last 30 days of data.

router.get('/scale-path', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    // Get last 30 days of Meta + Shopify data
    const toDate = new Date()
    toDate.setHours(toDate.getHours() + 10)
    const fromDate = new Date(toDate)
    fromDate.setDate(fromDate.getDate() - 30)
    const fromStr = fromDate.toISOString().slice(0, 10)
    const toStr = toDate.toISOString().slice(0, 10)

    const [metaInsights, shopifyData] = await Promise.all([
      fetchAccountInsights('last_30d'),
      getShopifyOrdersRange(fromStr, toStr)
    ])

    const monthlySpend = metaInsights?.spend || 0
    const monthlyRev = shopifyData?.ok ? shopifyData.revenue : 0
    const mer = calculateMER(monthlyRev, monthlySpend)

    const scalePath = calculateScalePath(monthlyRev, monthlySpend, mer)

    res.json({
      ok: true,
      current: {
        monthlyRev,
        monthlySpend,
        mer,
        dailySpend: monthlySpend / 30
      },
      targets: scalePath.targets
    })
  } catch (err) {
    console.error('[Ads] Scale path error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/budget ────────────────────────────────────────────────────
// Update daily budget for a campaign or ad set.

router.post('/budget', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    const { entityId, entityType, dailyBudget } = req.body
    if (!entityId || !entityType || dailyBudget == null) {
      return res.status(400).json({ ok: false, error: 'Missing entityId, entityType, or dailyBudget' })
    }
    if (!['campaign', 'adset'].includes(entityType)) {
      return res.status(400).json({ ok: false, error: 'entityType must be "campaign" or "adset"' })
    }
    if (typeof dailyBudget !== 'number' || dailyBudget < 0) {
      return res.status(400).json({ ok: false, error: 'dailyBudget must be a positive number' })
    }

    if (entityType === 'campaign') {
      await updateCampaignBudget(entityId, dailyBudget)
    } else {
      await updateAdSetBudget(entityId, dailyBudget)
    }

    res.json({ ok: true, newBudget: dailyBudget })
  } catch (err) {
    console.error('[Ads] Budget update error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/status ────────────────────────────────────────────────────
// Toggle status for a campaign, ad set, or ad.

router.post('/status', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    const { entityId, entityType, status } = req.body
    if (!entityId || !entityType || !status) {
      return res.status(400).json({ ok: false, error: 'Missing entityId, entityType, or status' })
    }
    if (!['campaign', 'adset', 'ad'].includes(entityType)) {
      return res.status(400).json({ ok: false, error: 'entityType must be "campaign", "adset", or "ad"' })
    }
    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'status must be "ACTIVE" or "PAUSED"' })
    }

    if (entityType === 'campaign') {
      await updateCampaignStatus(entityId, status)
    } else if (entityType === 'adset') {
      await updateAdSetStatus(entityId, status)
    } else {
      await updateAdStatus(entityId, status)
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[Ads] Status toggle error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/recommendation ────────────────────────────────────────────
// Get AI-powered campaign recommendation from Claude.

router.post('/recommendation', async (req, res) => {
  try {
    const { campaignData, shopifyData, dateRange } = req.body
    if (!campaignData) {
      return res.status(400).json({ ok: false, error: 'Missing campaignData' })
    }

    const shopifyRev = shopifyData?.revenue || 0
    const shopifyOrders = shopifyData?.orders || 0
    const shopifyAov = shopifyOrders > 0 ? (shopifyRev / shopifyOrders).toFixed(2) : GRI_ADS.aov

    const prompt = `You are the world's most successful DTC e-commerce operator. Think like a billionaire — ruthless about data, zero tolerance for wasted spend.

BRAND: Gender Reveal Ideas (genderrevealideas.com.au)
BUSINESS MODEL: One-time purchase (94% new customers), AOV $${shopifyAov} AUD, 40% gross margin
nCAC Baseline: $50.74 (fully loaded) | Media nCAC: $43.13 | Breakeven ROAS: 2.50x | Target MER: 4x+
Monthly spend: Meta $6,300 + Google $6,000 + Agency $2,200 = $14,500
IMPORTANT: Meta overcounts conversions by ~3x. Cross-reference with Shopify orders for truth.

CAMPAIGN DATA:
${JSON.stringify(campaignData, null, 2)}

SHOPIFY DATA: Revenue $${shopifyRev.toFixed(2)}, Orders ${shopifyOrders}, AOV $${shopifyAov}
DATE RANGE: ${dateRange || '7d'}

Give verdict, reasoning, and specific action. No hedging. Reference specific numbers.
If CPP > $50.74 on > $300 spend, flag as above nCAC breakeven.
If CPP > $50, recommend pausing immediately.
If frequency > 4, flag creative fatigue.

Respond in JSON only:
{ "verdict": "SCALE|HOLD|CUT|EMERGENCY", "urgency": "LOW|MEDIUM|HIGH|CRITICAL", "headline": "one-line summary", "reasoning": "detailed analysis referencing numbers", "specificAction": "exactly what to do right now", "budgetSuggestion": "specific dollar amount or percentage change", "estimatedImpact": "what this action should achieve" }`

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    }, 'ads-campaign-recommendation')

    const text = response.content[0].text.trim()
    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      parsed = {
        verdict: 'UNKNOWN',
        urgency: 'MEDIUM',
        headline: 'Could not parse recommendation',
        reasoning: text,
        specificAction: 'Review manually',
        budgetSuggestion: 'No change',
        estimatedImpact: 'Unknown'
      }
    }

    res.json({ ok: true, ...parsed })
  } catch (err) {
    console.error('[Ads] Recommendation error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── POST /api/ads/account-recommendation ────────────────────────────────────
// Full account-level strategic analysis from Claude.

router.post('/account-recommendation', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({ ok: false, error: 'Meta API not configured' })
    }

    // Gather last 7 days of data from both sources
    const toDate = new Date()
    toDate.setHours(toDate.getHours() + 10)
    const fromDate = new Date(toDate)
    fromDate.setDate(fromDate.getDate() - 7)
    const fromStr = fromDate.toISOString().slice(0, 10)
    const toStr = toDate.toISOString().slice(0, 10)

    const [perfData, shopifyData] = await Promise.all([
      fetchFullPerformance('last_7d'),
      getShopifyOrdersRange(fromStr, toStr)
    ])

    const campaigns = perfData.campaigns || perfData
    const totals = perfData.totals || {}

    // Enrich with health scores
    const campaignSummaries = campaigns.map(c => {
      const health = calculateCampaignHealth(c)
      return {
        name: c.name,
        status: c.status,
        spend: c.insights?.spend || 0,
        purchases: c.insights?.purchases || 0,
        roas: c.insights?.roas || 0,
        frequency: c.insights?.frequency || 0,
        cpp: (c.insights?.purchases || 0) > 0 ? (c.insights?.spend || 0) / c.insights.purchases : 0,
        healthScore: health.score,
        healthStatus: health.status,
        healthReasons: health.reasons
      }
    })

    const alerts = generateAlerts(campaigns)
    const shopifyRev = shopifyData?.ok ? shopifyData.revenue : 0
    const shopifyOrders = shopifyData?.ok ? shopifyData.orders : 0
    const mer = calculateMER(shopifyRev, totals.spend || 0)
    const trueCac = calculateTrueCAC(totals.spend || 0, shopifyOrders)

    const prompt = `You are the world's most successful DTC e-commerce operator. Think like a billionaire — ruthless about data, zero tolerance for wasted spend.

BRAND: Gender Reveal Ideas (genderrevealideas.com.au)
BUSINESS MODEL: One-time purchase (94% new customers), AOV $126.86 AUD, 40% gross margin
nCAC Baseline: $50.74 (fully loaded) | Media nCAC: $43.13 | Breakeven ROAS: 2.50x | Target MER: 4x+
IMPORTANT: Meta overcounts conversions by ~3x. Always cross-reference with Shopify.

LAST 7 DAYS ACCOUNT SUMMARY:
- Meta Spend: $${(totals.spend || 0).toFixed(2)}
- Meta Attributed Purchases: ${totals.purchases || 0}
- Meta ROAS: ${(totals.roas || 0).toFixed(2)}x
- Shopify Revenue: $${shopifyRev.toFixed(2)}
- Shopify Orders: ${shopifyOrders}
- MER (Shopify Rev / Meta Spend): ${mer.toFixed(2)}x
- True CAC (Meta Spend / Shopify Orders): $${trueCac.toFixed(2)}

CAMPAIGN BREAKDOWN:
${JSON.stringify(campaignSummaries, null, 2)}

ACTIVE ALERTS:
${JSON.stringify(alerts, null, 2)}

Provide a full account-level strategic analysis. Be specific. Reference exact numbers. No waffle.

Respond in JSON only:
{
  "situation": "2-3 sentence assessment of current state",
  "immediateActions": ["action 1 with specific numbers", "action 2"],
  "thisWeek": ["strategic priority 1", "strategic priority 2"],
  "scalePath": "what needs to happen to reach $1M/year based on current data",
  "generatedAt": "${new Date().toISOString()}"
}`

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    }, 'ads-account-recommendation')

    const text = response.content[0].text.trim()
    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text)
    } catch {
      parsed = {
        situation: text,
        immediateActions: ['Review manually — could not parse AI response'],
        thisWeek: [],
        scalePath: 'Unable to calculate',
        generatedAt: new Date().toISOString()
      }
    }

    res.json({ ok: true, ...parsed })
  } catch (err) {
    console.error('[Ads] Account recommendation error:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
