/**
 * /api/ads/* routes — Meta Ads performance data, fatigue engine, AI recommendations.
 */
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  isMetaConfigured,
  fetchFullPerformance,
  fetchAccountInsights,
  fetchCampaigns,
  fetchAdInsights,
  fetchAdInsightsByDay,
  pauseAd as metaPauseAd
} from '../lib/meta-api.js'
import {
  calculateFatigueScore,
  prepareFatigueMetrics,
  STATUS_COLORS
} from '../lib/fatigue-engine.js'
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

  const token = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID
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

    // One full fetch for the selected range (campaigns + ads + fatigue)
    const perfData = await fetchFullPerformance(preset)
    const campaigns = perfData.campaigns || perfData

    // Enrich with fatigue scores
    for (const campaign of campaigns) {
      for (const ad of campaign.ads || []) {
        const metrics = prepareFatigueMetrics(ad)
        ad.fatigue = calculateFatigueScore(metrics)
      }

      // Campaign-level health score = average of ad fatigue scores
      const activeAds = (campaign.ads || []).filter(a => a.status === 'ACTIVE')
      campaign.healthScore = activeAds.length > 0
        ? Math.round(activeAds.reduce((s, a) => s + a.fatigue.score, 0) / activeAds.length)
        : 100
    }

    // Aggregate KPI for the selected date range
    const rangeKPI = aggregateKPI(campaigns)

    // Lightweight account-level fetches for today/yesterday/prev (1 API call each, not full fetches)
    const [todayKPI, yesterdayKPI, prevKPI] = await Promise.all([
      fetchAccountInsights('today').catch(e => { console.warn('[Ads] Today insights failed:', e.message); return null }),
      fetchAccountInsights('yesterday').catch(e => { console.warn('[Ads] Yesterday insights failed:', e.message); return null }),
      fetchPrevPeriodInsights(preset).catch(e => { console.warn('[Ads] Prev period fetch failed:', e.message); return null })
    ])

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

    const token = process.env.META_ACCESS_TOKEN
    const accountId = process.env.META_AD_ACCOUNT_ID
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

export default router
