/**
 * Competitor Tracking Routes
 */

import { Router } from 'express'
import { runCompetitorScan, readCompetitorCache, COMPETITORS } from '../lib/competitor-tracker.js'
import { readCache as readKeywordCache } from '../lib/keyword-tracker.js'

const router = Router()

// Get competitor comparison status
router.get('/status', (req, res) => {
  try {
    const cache = readCompetitorCache()
    
    if (!cache || !cache.keywords) {
      return res.json({
        keywords: [],
        summary: {},
        competitors: COMPETITORS,
        updatedAt: null
      })
    }

    res.json({
      keywords: cache.keywords,
      summary: cache.summary,
      competitors: cache.competitors || COMPETITORS,
      updatedAt: cache.updatedAt
    })
  } catch (err) {
    console.error('[Competitor Route] Status error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Trigger manual competitor scan
router.post('/scan', async (req, res) => {
  try {
    // Get keywords to scan
    const kwCache = readKeywordCache()
    
    if (!kwCache || !kwCache.keywords || kwCache.keywords.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No keywords available. Run keyword tracker first.'
      })
    }

    // Get top keywords by volume (cap at 40 to be respectful)
    const topKeywords = kwCache.keywords
      .filter(k => k.volume !== null)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 40)

    console.log(`[Competitor Route] Starting scan for ${topKeywords.length} keywords...`)
    
    const cache = await runCompetitorScan(topKeywords)
    
    res.json({
      ok: true,
      message: `Scanned ${cache.keywords.length} keywords`,
      summary: cache.summary,
      updatedAt: cache.updatedAt
    })
  } catch (err) {
    console.error('[Competitor Route] Scan error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Get head-to-head comparison for specific keyword
router.get('/keyword/:keyword', (req, res) => {
  try {
    const cache = readCompetitorCache()
    
    if (!cache) {
      return res.status(404).json({ ok: false, error: 'No competitor data available' })
    }

    const keyword = decodeURIComponent(req.params.keyword)
    const data = cache.keywords.find(k => k.keyword.toLowerCase() === keyword.toLowerCase())
    
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Keyword not found in scan data' })
    }

    res.json({
      ok: true,
      keyword: data.keyword,
      positions: data.positions,
      scrapedAt: data.scrapedAt,
      competitors: cache.competitors
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Get dominance stats (who beats who)
router.get('/dominance', (req, res) => {
  try {
    const cache = readCompetitorCache()
    
    if (!cache || !cache.keywords) {
      return res.json({ ok: true, dominance: {} })
    }

    const dominance = {}
    
    for (const key of Object.keys(COMPETITORS)) {
      if (key === 'gri') continue
      
      const wins = cache.keywords.filter(k => {
        const griRank = k.positions.gri?.rank
        const compRank = k.positions[key]?.rank
        return griRank && compRank && griRank < compRank
      }).length
      
      const losses = cache.keywords.filter(k => {
        const griRank = k.positions.gri?.rank
        const compRank = k.positions[key]?.rank
        return griRank && compRank && compRank < griRank
      }).length

      const both = cache.keywords.filter(k => {
        const griRank = k.positions.gri?.rank
        const compRank = k.positions[key]?.rank
        return griRank && compRank
      }).length

      dominance[key] = {
        wins,
        losses,
        total: both,
        winRate: both > 0 ? Math.round((wins / both) * 100) : 0
      }
    }

    res.json({ ok: true, dominance })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router

// ── GSC-Based Competitor Analysis ────────────────────────────────────────────

router.get('/visibility', async (req, res) => {
  try {
    const { analyzeCompetitorVisibility } = await import('../lib/gsc-competitor-analysis.js')
    const result = analyzeCompetitorVisibility()
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/dominance', async (req, res) => {
  try {
    const { getKeywordDominance } = await import('../lib/gsc-competitor-analysis.js')
    const result = getKeywordDominance()
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})


// ── DataForSEO Competitor Scan (New) ──────────────────────────────────────────

router.post('/scan-dataforseo', async (req, res) => {
  try {
    const { getCompetitorRankings } = await import('../lib/dataforseo-client.js')
    const fs = await import('fs')
    const path = await import('path')
    
    // Get top 20 keywords from GSC data
    const gscFile = path.join(process.cwd(), 'data/gsc/queries-2026-03.csv')
    const csv = fs.readFileSync(gscFile, 'utf8')
    const lines = csv.split('\n').slice(1, 21) // Top 20 keywords
    
    const keywords = lines.map(line => {
      const [query] = line.split(',')
      return query?.replace(/^"|"$/g, '')
    }).filter(Boolean)
    
    const competitors = [
      { id: 'gri', domain: 'genderrevealideas.com.au', name: 'Gender Reveal Ideas' },
      { id: 'celebration', domain: 'celebrationhq.com.au', name: 'CelebrationHQ' },
      { id: 'babyHints', domain: 'babyhintsandtips.com', name: 'Baby Hints & Tips' },
      { id: 'aussie', domain: 'aussiereveals.com.au', name: 'Aussie Reveals' },
      { id: 'express', domain: 'genderrevealexpress.com.au', name: 'Gender Reveal Express' },
    ]
    
    console.log(`[DataForSEO] Starting scan for ${keywords.length} keywords...`)
    const result = await getCompetitorRankings(keywords, competitors)
    
    // Save to cache
    const cacheFile = path.join(process.cwd(), 'data', 'competitor-dataforseo.json')
    fs.writeFileSync(cacheFile, JSON.stringify({
      keywords: result.keywords,
      competitors,
      updatedAt: new Date().toISOString()
    }, null, 2))
    
    res.json({
      ok: true,
      message: `DataForSEO scan complete: ${keywords.length} keywords checked`,
      keywords: result.keywords.length,
      competitors: competitors.length
    })
  } catch (e) {
    console.error('[DataForSEO] Scan error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── DataForSEO Rankings ───────────────────────────────────────────────────────

router.get('/rankings-dataforseo', async (req, res) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const cacheFile = path.join(process.cwd(), 'data', 'competitor-dataforseo.json')
    
    if (!fs.existsSync(cacheFile)) {
      return res.json({ status: 'empty', message: 'No DataForSEO scan yet. Click "Scan with DataForSEO".' })
    }
    
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    res.json({ status: 'ok', ...data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

