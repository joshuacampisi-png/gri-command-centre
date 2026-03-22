/**
 * Google Trends Intelligence Engine
 * ─────────────────────────────────────────────────────────────
 * DataForSEO integration for Gender Reveal Ideas.
 * Monitors 26 gender reveal keywords across Australia.
 * Detects volume surges, breakout queries, and new emergences.
 * Auto-generates blog briefs via Claude when spikes fire.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR   = join(process.cwd(), 'data')
const CACHE_FILE = join(DATA_DIR, 'trends-cache.json')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const LOCATION_CODE = 2036 // Australia

export const GENDER_REVEAL_KEYWORDS = [
  'gender reveal ideas',
  'gender reveal party',
  'gender reveal balloons',
  'gender reveal confetti cannon',
  'gender reveal powder cannon',
  'gender reveal smoke bomb',
  'gender reveal box',
  'gender reveal cake',
  'gender reveal decorations',
  'gender reveal games',
  'gender reveal TNT',
  'gender reveal silly string',
  'gender reveal poppers',
  'gender reveal pinata',
  'gender reveal banner',
  'gender reveal invitations',
  'baby gender reveal',
  'unique gender reveal ideas',
  'big gender reveal ideas',
  'outdoor gender reveal ideas',
  'gender reveal party supplies australia',
  'gender reveal australia',
  'gender reveal hire',
  'gender reveal cannon hire',
  'gender reveal props',
  'gender reveal photoshoot ideas',
]

// ── Cache ──────────────────────────────────────────────────────

function emptyCache() {
  return {
    lastUpdated: null,
    timeseries: {},
    risingQueries: [],
    seenRisingQueries: [],
    spikes: [],
    blogBriefs: [],
    scanHistory: [],
  }
}

export function readTrendsCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch { return null }
}

function writeTrendsCache(data) {
  data.lastUpdated = new Date().toISOString()
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

// ── DataForSEO API ─────────────────────────────────────────────

const delay = ms => new Promise(r => setTimeout(r, ms))

function getDfsAuth() {
  if (process.env.DATAFORSEO_AUTH) return process.env.DATAFORSEO_AUTH
  if (process.env.DATAFORSEO_EMAIL && process.env.DATAFORSEO_PASSWORD) {
    return Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
  }
  return null
}

export function hasDfsCredentials() { return Boolean(getDfsAuth()) }

/**
 * Fetch real-time trending queries related to "gender reveal" from DataForSEO.
 * Uses the explore endpoint with a single seed keyword + past_day to get
 * actual rising/top related search queries (not just our predefined list).
 */
export async function fetchTrendingQueries(seed = 'gender reveal', timeRange = 'past_day') {
  const auth = getDfsAuth()
  if (!auth) return { ok: false, queries: [], error: 'No DataForSEO credentials' }

  try {
    const res = await fetch(
      'https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live',
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          keywords:      [seed],
          location_code: LOCATION_CODE,
          type:          'web',
          time_range:    timeRange,
          language_code: 'en',
        }]),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const result = data.tasks?.[0]?.result?.[0]
    if (!result) return { ok: true, queries: [] }

    const queries = []

    for (const item of (result.items || [])) {
      // Related queries list (rising & top)
      if (item.type === 'google_trends_queries_list') {
        const queryType = (item.title || '').toLowerCase() // "rising" or "top"
        for (const q of (item.data || [])) {
          queries.push({
            query:  q.query,
            value:  q.value ?? 0,
            type:   queryType,
          })
        }
      }
    }

    // Sort: rising queries first (by value desc), then top queries
    queries.sort((a, b) => {
      if (a.type === 'rising' && b.type !== 'rising') return -1
      if (a.type !== 'rising' && b.type === 'rising') return 1
      return b.value - a.value
    })

    return { ok: true, queries }
  } catch (e) {
    console.error('[Trends] fetchTrendingQueries failed:', e.message)
    return { ok: false, queries: [], error: e.message }
  }
}

// Returns { timeseries: { keyword: [{date, value}] }, risingQueries: [] }
// DataForSEO Google Trends explore/live endpoint — weekly data, past 12 months, Australia
// Map UI range options to DataForSEO time_range values
export const TIME_RANGE_MAP = {
  '24h':  'past_day',
  '7d':   'past_7_days',
  '30d':  'past_month',
  '12mo': 'past_12_months',
}

async function fetchTrendsBatch(batch, timeRange = 'past_12_months') {
  const auth = getDfsAuth()
  if (!auth) throw new Error('No DataForSEO credentials')

  const res = await fetch(
    'https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live',
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keywords:      batch,
        location_code: LOCATION_CODE,
        type:          'web',
        time_range:    timeRange,
        language_code: 'en',
      }]),
      signal: AbortSignal.timeout(30000),
    }
  )

  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`)
  const data = await res.json()

  if (data.status_code !== 20000)
    throw new Error(`DataForSEO: ${data.status_message}`)

  const task = data.tasks?.[0]
  if (!task || task.status_code !== 20000)
    throw new Error(`DataForSEO task failed: ${task?.status_message || 'unknown'}`)

  const result = task.result?.[0]
  if (!result) return { timeseries: {}, risingQueries: [] }

  const timeseries = {}
  const risingQueries = []

  for (const item of (result.items || [])) {
    if (item.type === 'google_trends_graph') {
      const keywords = item.keywords || []
      for (let ki = 0; ki < keywords.length; ki++) {
        const kw = keywords[ki]
        if (!kw) continue
        // item.data: [{date_from, date_to, timestamp, missing_data, values:[v0,v1,...]}]
        // values are per-keyword at index ki; can be null — default to 0
        timeseries[kw] = (item.data || [])
          .filter(pt => !pt.missing_data)
          .map(pt => ({
            date:  pt.date_from,          // "YYYY-MM-DD"
            value: pt.values?.[ki] ?? 0,  // null → 0
          }))
      }
    }

    // Extract rising & top related queries from DataForSEO response
    if (item.type === 'google_trends_queries_list') {
      for (const q of (item.data || [])) {
        risingQueries.push({
          query:           q.query,
          extracted_value: q.value ?? 0,    // relative interest or % rise
          parentKeyword:   (item.keywords || batch)?.[0] || '',
          queryType:       item.title || '', // "Rising" or "Top"
        })
      }
    }
  }

  return { timeseries, risingQueries }
}

// ── Spike Detection ────────────────────────────────────────────

export function detectSpikes(currentTimeseries, currentRising, previousCache) {
  const spikes = []

  for (const keyword of Object.keys(currentTimeseries)) {
    const series = currentTimeseries[keyword]
    if (!series || series.length < 5) continue

    const latest = series[series.length - 1].value
    const prior4 = series.slice(-5, -1).map(p => p.value)
    const rollingAvg = prior4.reduce((a, b) => a + b, 0) / prior4.length

    // Rule 1 — Volume Surge: latest >= 25% above 4 week rolling avg
    if (rollingAvg > 0 && latest >= rollingAvg * 1.25) {
      spikes.push({
        keyword, type: 'VOLUME_SURGE',
        currentValue: latest,
        rollingAvg: Math.round(rollingAvg),
        changePercent: Math.round(((latest - rollingAvg) / rollingAvg) * 100),
        detectedAt: new Date().toISOString(),
      })
    }

    // Rule 3 — New Emergence: was <5, now >=20
    const prevValues = previousCache?.timeseries?.[keyword] || []
    const prevAvg = prevValues.length > 0
      ? prevValues.slice(-4).reduce((s, p) => s + (p.value || 0), 0) / Math.min(prevValues.length, 4)
      : 0
    if (prevAvg < 5 && latest >= 20) {
      spikes.push({
        keyword, type: 'NEW_EMERGENCE',
        currentValue: latest, previousAvg: Math.round(prevAvg),
        detectedAt: new Date().toISOString(),
      })
    }
  }

  // Rule 2 — Breakout Rising Queries (>=500% and never seen)
  const seenSet = new Set(previousCache?.seenRisingQueries || [])
  for (const rq of currentRising) {
    if (!seenSet.has(rq.query) && rq.extracted_value >= 500) {
      spikes.push({
        keyword: rq.query, type: 'BREAKOUT_RISING_QUERY',
        percentIncrease: rq.extracted_value,
        parentKeyword: rq.parentKeyword,
        detectedAt: new Date().toISOString(),
      })
    }
  }

  return spikes
}

// ── Full Scan ──────────────────────────────────────────────────

let isScanning = false
export function isTrendsScanning() { return isScanning }

export async function runTrendsScan(rangeKey = '12mo') {
  if (isScanning) return null
  isScanning = true
  const start = Date.now()
  const timeRange = TIME_RANGE_MAP[rangeKey] || 'past_12_months'
  console.log(`[Trends] Scanning ${GENDER_REVEAL_KEYWORDS.length} keywords (${rangeKey})...`)

  const prev = readTrendsCache()
  const cache = prev ? { ...prev } : emptyCache()

  try {
    if (!hasDfsCredentials()) {
      console.warn('[Trends] No DataForSEO credentials — generating demo data')
      Object.assign(cache, generateDemoData())
      cache.activeRange = rangeKey
      writeTrendsCache(cache)
      return cache
    }

    const newTS = {}
    const allRising = []

    // Use first keyword as anchor for cross-batch normalization.
    // Google Trends scores are relative within each API call (0-100).
    // By including the same anchor in every batch, we can normalize all
    // scores to a single scale.
    const ANCHOR = GENDER_REVEAL_KEYWORDS[0] // "gender reveal ideas"
    const others = GENDER_REVEAL_KEYWORDS.slice(1)

    // Batch: 4 keywords + anchor per call (DataForSEO allows up to 5)
    const batches = []
    for (let i = 0; i < others.length; i += 4)
      batches.push([ANCHOR, ...others.slice(i, i + 4)])

    // Track anchor scores per batch for normalization
    const anchorLatestByBatch = []

    for (let i = 0; i < batches.length; i++) {
      console.log(`[Trends] Batch ${i + 1}/${batches.length}: ${batches[i].join(', ')}`)
      try {
        const { timeseries, risingQueries } = await fetchTrendsBatch(batches[i], timeRange)

        // Record anchor's latest value in this batch
        const anchorSeries = timeseries[ANCHOR]
        const anchorLatest = anchorSeries?.length ? anchorSeries[anchorSeries.length - 1].value : null
        anchorLatestByBatch.push({ batch: i, anchorLatest, keywords: batches[i].filter(k => k !== ANCHOR) })

        Object.assign(newTS, timeseries)
        allRising.push(...risingQueries)
      } catch (e) { console.error(`[Trends] Batch ${i + 1} failed:`, e.message) }
      if (i < batches.length - 1) await delay(2000)
    }

    // Normalize all keyword scores relative to the anchor's score in batch 0.
    // If anchor scored 60 in batch 0 but 30 in batch 3, multiply batch 3 scores by 60/30.
    const refAnchorVal = anchorLatestByBatch[0]?.anchorLatest
    if (refAnchorVal && refAnchorVal > 0) {
      for (const { anchorLatest, keywords } of anchorLatestByBatch) {
        if (!anchorLatest || anchorLatest <= 0) continue
        const scale = refAnchorVal / anchorLatest
        if (Math.abs(scale - 1) < 0.01) continue // no adjustment needed
        for (const kw of keywords) {
          if (!newTS[kw]) continue
          newTS[kw] = newTS[kw].map(pt => ({
            ...pt,
            value: Math.round(Math.min(100, pt.value * scale)),
          }))
        }
      }
      console.log(`[Trends] Normalized ${others.length} keywords against anchor "${ANCHOR}" (ref=${refAnchorVal})`)
    }

    cache.timeseries = newTS
    cache.activeRange = rangeKey
    cache.risingQueries = allRising
    cache.seenRisingQueries = [...new Set([...(cache.seenRisingQueries || []), ...allRising.map(r => r.query)])]
    cache.spikes = detectSpikes(newTS, allRising, prev)
    cache.scanHistory = [...(cache.scanHistory || []).slice(-20), {
      at: new Date().toISOString(),
      keywords: Object.keys(newTS).length,
      spikes: cache.spikes.length,
      durationMs: Date.now() - start,
    }]

    writeTrendsCache(cache)
    console.log(`[Trends] Done in ${((Date.now() - start) / 1000).toFixed(1)}s | ${Object.keys(newTS).length} kws | ${cache.spikes.length} spikes`)

    // Auto-generate blog briefs for spikes
    if (cache.spikes.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const { generateBlogBrief } = await import('./trends-blog-generator.js')
        for (const spike of cache.spikes.slice(0, 3)) {
          const existing = (cache.blogBriefs || []).find(b => b.spikeKeyword === spike.keyword)
          if (!existing) {
            const brief = await generateBlogBrief(spike)
            cache.blogBriefs = [...(cache.blogBriefs || []), brief]
          }
        }
        writeTrendsCache(cache)
      } catch (e) { console.error('[Trends] Blog brief gen failed:', e.message) }
    }

    return cache
  } finally { isScanning = false }
}

// ── Demo data ──────────────────────────────────────────────────

function generateDemoData() {
  const timeseries = {}
  const now = Date.now()

  for (const kw of GENDER_REVEAL_KEYWORDS) {
    const series = []
    const base = 20 + Math.floor(Math.random() * 60)
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now - i * 7 * 86400000)
      const noise = Math.floor(Math.random() * 15) - 7
      const season = Math.sin(i / 3) * 10
      series.push({
        date: d.toISOString().slice(0, 10),
        value: Math.max(0, Math.min(100, Math.round(base + noise + season + (i < 2 ? 15 : 0))))
      })
    }
    timeseries[kw] = series
  }

  return {
    timeseries,
    risingQueries: [
      { query: 'gender reveal volcano cannon', extracted_value: 2400, parentKeyword: 'gender reveal confetti cannon' },
      { query: 'gender reveal balloon box', extracted_value: 900, parentKeyword: 'gender reveal balloons' },
      { query: 'gender reveal burnout car', extracted_value: 650, parentKeyword: 'unique gender reveal ideas' },
    ],
    seenRisingQueries: ['gender reveal volcano cannon', 'gender reveal balloon box', 'gender reveal burnout car'],
    spikes: [
      { keyword: 'gender reveal smoke bomb', type: 'VOLUME_SURGE', currentValue: 85, rollingAvg: 52, changePercent: 63, detectedAt: new Date().toISOString() },
      { keyword: 'gender reveal volcano cannon', type: 'BREAKOUT_RISING_QUERY', percentIncrease: 2400, parentKeyword: 'gender reveal confetti cannon', detectedAt: new Date().toISOString() },
    ],
    blogBriefs: [],
    scanHistory: [{ at: new Date().toISOString(), keywords: GENDER_REVEAL_KEYWORDS.length, spikes: 2, durationMs: 0, demo: true }],
  }
}
