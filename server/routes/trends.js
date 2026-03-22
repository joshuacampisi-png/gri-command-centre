/**
 * Google Trends Intelligence API Routes
 */
import { Router } from 'express'
import { readTrendsCache, runTrendsScan, isTrendsScanning, GENDER_REVEAL_KEYWORDS, hasDfsCredentials, TIME_RANGE_MAP } from '../lib/google-trends.js'
import { generateBlogBrief } from '../lib/trends-blog-generator.js'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const router = Router()
const CACHE_FILE = join(process.cwd(), 'data', 'trends-cache.json')

// GET /api/trends — full timeseries data for charts
router.get('/', (_req, res) => {
  const cache = readTrendsCache()
  if (!cache) return res.json({ ok: true, data: null, message: 'No scan data yet. Run a scan first.' })
  res.json({ ok: true, data: cache })
})

// GET /api/trends/spikes — detected spikes
router.get('/spikes', (_req, res) => {
  const cache = readTrendsCache()
  res.json({ ok: true, spikes: cache?.spikes || [] })
})

// GET /api/trends/blog-briefs — generated blog briefs
router.get('/blog-briefs', (_req, res) => {
  const cache = readTrendsCache()
  res.json({ ok: true, briefs: cache?.blogBriefs || [] })
})

// GET /api/trends/status — scan status + health
router.get('/status', (_req, res) => {
  const cache = readTrendsCache()
  const lastScan = cache?.scanHistory?.slice(-1)[0] || null
  const hasDataForSeo = hasDfsCredentials()
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY)

  res.json({
    ok: true,
    scanning: isTrendsScanning(),
    lastUpdated: cache?.lastUpdated || null,
    lastScan,
    activeRange: cache?.activeRange || '12mo',
    keywordCount: GENDER_REVEAL_KEYWORDS.length,
    spikeCount: (cache?.spikes || []).length,
    briefCount: (cache?.blogBriefs || []).length,
    hasDataForSeo,
    hasAnthropicKey,
    demoMode: !hasDataForSeo,
    availableRanges: Object.keys(TIME_RANGE_MAP),
  })
})

// POST /api/trends/scan-now — trigger manual scan
// Body: { range: '24h' | '7d' | '30d' | '12mo' }
router.post('/scan-now', async (req, res) => {
  if (isTrendsScanning()) return res.json({ ok: false, message: 'Scan already in progress' })

  const range = req.body?.range || '12mo'
  if (!TIME_RANGE_MAP[range]) return res.status(400).json({ ok: false, error: `Invalid range. Use: ${Object.keys(TIME_RANGE_MAP).join(', ')}` })

  res.json({ ok: true, message: `Scan started (${range})` })

  // Run in background (don't block response)
  runTrendsScan(range).catch(e => console.error('[Trends] Manual scan failed:', e.message))
})

// POST /api/trends/generate-brief — generate blog brief for a spike keyword
router.post('/generate-brief', async (req, res) => {
  const { keyword } = req.body
  if (!keyword) return res.status(400).json({ ok: false, error: 'Missing keyword' })

  const cache = readTrendsCache()
  const spike = (cache?.spikes || []).find(s => s.keyword === keyword)
  if (!spike) return res.status(404).json({ ok: false, error: 'Spike not found for this keyword' })

  // Check if brief already exists
  const existing = (cache?.blogBriefs || []).find(b => b.spikeKeyword === keyword)
  if (existing && !existing.error) {
    return res.json({ ok: true, brief: existing, cached: true })
  }

  try {
    const brief = await generateBlogBrief(spike)

    // Save to cache
    cache.blogBriefs = [...(cache.blogBriefs || []).filter(b => b.spikeKeyword !== keyword), brief]
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))

    res.json({ ok: true, brief, cached: false })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
