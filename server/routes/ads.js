/**
 * /api/ads/* routes — Meta Ads performance data, fatigue engine, AI recommendations.
 */
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  isMetaConfigured,
  fetchFullPerformance,
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

    const campaigns = await fetchFullPerformance(preset)

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

    // Aggregate KPI totals
    const todayCampaigns = await fetchFullPerformance('today').catch(() => campaigns)
    const yesterdayCampaigns = await fetchFullPerformance('yesterday').catch(() => null)

    const todayKPI = aggregateKPI(todayCampaigns)
    const yesterdayKPI = yesterdayCampaigns ? aggregateKPI(yesterdayCampaigns) : null

    res.json({
      ok: true,
      kpi: {
        today: todayKPI,
        yesterday: yesterdayKPI
      },
      campaigns,
      lastSynced: new Date().toISOString()
    })
  } catch (err) {
    console.error('[Ads] Performance fetch error:', err.message)
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

    const campaigns = await fetchFullPerformance('today')
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
