/**
 * Competitor Intelligence Routes
 * Unified API for organic rankings, Google Ads intel, Meta ads, and historical data
 */

import { Router } from 'express'
import { existsSync } from 'fs'
import { getCompetitors, addCompetitor, removeCompetitor, getCompetitorArray } from '../lib/competitor-config.js'
import { runOrganicScan, getLatestOrganicData, getTopKeywordsByVolume } from '../lib/organic-scan.js'
import { runGoogleAdsScan, getLatestGoogleAdsData } from '../lib/google-ads-intel.js'
import { runMetaAdsScan, getLatestMetaAdsData, getAdImagePath } from '../lib/meta-ads-scraper.js'
import { getHistory, getCompetitorHistory, getLatestScan } from '../lib/competitor-history.js'
import { runFullCompetitorScan } from '../lib/competitor-intel-cron.js'

const router = Router()

// 26 tracked keywords
const TRACKED_KEYWORDS = [
  'gender reveal', 'gender reveal ideas', 'gender reveal party',
  'gender reveal box', 'gender reveal balloons', 'gender reveal cake',
  'gender reveal smoke', 'gender reveal confetti', 'gender reveal cannon',
  'gender reveal poppers', 'gender reveal fireworks', 'gender reveal powder',
  'gender reveal games', 'gender reveal decorations', 'gender reveal invitations',
  'gender reveal photoshoot', 'gender reveal outfit', 'gender reveal gifts',
  'gender reveal themes', 'gender reveal australia', 'unique gender reveal ideas',
  'creative gender reveal', 'big gender reveal ideas', 'outdoor gender reveal',
  'indoor gender reveal', 'gender reveal volcano cannon',
]

// ── Competitor Config ────────────────────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json({ ok: true, competitors: getCompetitors() })
})

router.post('/config/add', (req, res) => {
  try {
    const { id, name, domain, color } = req.body
    if (!id || !name || !domain) {
      return res.status(400).json({ ok: false, error: 'id, name, and domain are required' })
    }
    const competitors = addCompetitor(id, { name, domain, color: color || '#6b7280' })
    res.json({ ok: true, competitors })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.delete('/config/:id', (req, res) => {
  try {
    const competitors = removeCompetitor(req.params.id)
    res.json({ ok: true, competitors })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

// ── Overview (all latest data combined) ──────────────────────────────────────

router.get('/overview', (req, res) => {
  try {
    const competitors = getCompetitors()
    const organic = getLatestScan('organic')
    const paid = getLatestScan('paid')
    const meta = getLatestScan('meta')

    res.json({
      ok: true,
      competitors,
      organic: organic || null,
      paid: paid || null,
      meta: meta || null,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Organic Rankings ─────────────────────────────────────────────────────────

router.get('/organic', (req, res) => {
  try {
    const data = getLatestScan('organic')
    if (!data) return res.json({ ok: true, status: 'empty', message: 'No organic scan yet. Click Scan Now.' })
    res.json({ ok: true, ...data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post('/organic/scan', async (req, res) => {
  try {
    res.json({ ok: true, message: 'Organic scan started', status: 'scanning' })
    // Run async after response
    runOrganicScan(TRACKED_KEYWORDS).catch(e => console.error('[OrganicScan] Error:', e))
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Google Ads Intelligence ──────────────────────────────────────────────────

router.get('/google-ads', (req, res) => {
  try {
    const data = getLatestScan('paid')
    if (!data) return res.json({ ok: true, status: 'empty', message: 'No Google Ads scan yet. Click Scan Now.' })
    res.json({ ok: true, ...data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post('/google-ads/scan', async (req, res) => {
  try {
    res.json({ ok: true, message: 'Google Ads scan started', status: 'scanning' })
    const topKw = await getTopKeywordsByVolume(TRACKED_KEYWORDS, 15)
    runGoogleAdsScan(topKw.map(k => k.keyword)).catch(e => console.error('[GoogleAds] Error:', e))
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Meta Ad Library ──────────────────────────────────────────────────────────

router.get('/meta-ads', (req, res) => {
  try {
    const data = getLatestScan('meta')
    if (!data) return res.json({ ok: true, status: 'empty', message: 'No Meta Ads scan yet. Click Scan Now.' })
    res.json({ ok: true, ...data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post('/meta-ads/scan', async (req, res) => {
  try {
    res.json({ ok: true, message: 'Meta Ads scan started', status: 'scanning' })
    runMetaAdsScan().catch(e => console.error('[MetaAds] Error:', e))
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Serve stored Meta ad images
router.get('/meta-ad-image/:filename', (req, res) => {
  try {
    const filepath = getAdImagePath(req.params.filename)
    if (!existsSync(filepath)) return res.status(404).json({ error: 'Image not found' })
    res.sendFile(filepath)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Historical Data ──────────────────────────────────────────────────────────

router.get('/history/:type', (req, res) => {
  try {
    const { type } = req.params
    if (!['organic', 'paid', 'meta'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'Type must be organic, paid, or meta' })
    }
    const history = getHistory(type)
    res.json({ ok: true, type, entries: history.length, history })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/history/:type/:competitorId', (req, res) => {
  try {
    const { type, competitorId } = req.params
    const history = getCompetitorHistory(type, competitorId)
    res.json({ ok: true, type, competitorId, entries: history.length, history })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Full Scan (all 3 types) ──────────────────────────────────────────────────

router.post('/scan-all', async (req, res) => {
  try {
    res.json({ ok: true, message: 'Full competitor scan started (organic + ads + meta)', status: 'scanning' })
    runFullCompetitorScan().catch(e => console.error('[FullScan] Error:', e))
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Scan Status (polling endpoint) ───────────────────────────────────────────

router.get('/scan-status', (req, res) => {
  try {
    const organic = getLatestScan('organic')
    const paid = getLatestScan('paid')
    const meta = getLatestScan('meta')

    res.json({
      ok: true,
      organic: organic ? { scannedAt: organic.scannedAt, keywords: organic.keywords?.length || 0 } : null,
      paid: paid ? { scannedAt: paid.scannedAt } : null,
      meta: meta ? { scannedAt: meta.scannedAt, totalAds: meta.totalAdsFound || 0 } : null,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Legacy endpoints (backward compat) ───────────────────────────────────────

router.get('/status', (req, res) => {
  try {
    const data = getLatestScan('organic')
    if (!data) {
      return res.json({
        keywords: [],
        summary: {},
        competitors: getCompetitors(),
        updatedAt: null,
      })
    }
    res.json({
      keywords: data.keywords || [],
      summary: data.summary || {},
      competitors: getCompetitors(),
      updatedAt: data.scannedAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/rankings', (req, res) => {
  try {
    const data = getLatestScan('organic')
    if (!data) return res.json({ status: 'empty' })
    res.json({
      status: 'ok',
      keywords: data.keywords || [],
      summary: data.summary || {},
      competitors: getCompetitors(),
      updatedAt: data.scannedAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post('/scan', async (req, res) => {
  try {
    res.json({ ok: true, message: 'Organic scan started' })
    runOrganicScan(TRACKED_KEYWORDS).catch(e => console.error('[Scan] Error:', e))
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
