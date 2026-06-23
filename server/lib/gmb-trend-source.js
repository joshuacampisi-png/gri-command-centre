/**
 * gmb-trend-source.js
 * ─────────────────────────────────────────────────────────────
 * Picks today's trending gender-reveal keyword for the GMB post.
 *
 * Strategy (in order):
 *   1. Pull live signal from google-trends.js (DataForSEO cache + rising
 *      queries) and from keyword-tracker.js (the longer-tail tracked
 *      keyword list with monthly search volumes).
 *   2. Mix that with a SEED list of high-intent gender reveal keywords
 *      so we always have something to fall back on.
 *   3. Filter out anything already used in the last N days of GMB posts
 *      (we match against entry.category OR entry.keyword on the persisted
 *      gmb-posted.json — entry shape is defined in gmb-state.js).
 *   4. Score by monthlySearches + trendDelta (rising > flat > falling)
 *      and return the top one with a short reasoning sentence.
 *
 * Defensive contract:
 *   - If the live trend source errors we silently degrade to the seed list.
 *   - We NEVER return null unless the seed list itself is fully exhausted
 *     after the avoid-window filter — that case is loud and means the seed
 *     list needs expanding.
 * ─────────────────────────────────────────────────────────────
 */

import { readTrendsCache, GENDER_REVEAL_KEYWORDS } from './google-trends.js'
import { readCache as readKeywordCache } from './keyword-tracker.js'
import { readState } from './gmb-state.js'

// ── Seed list ────────────────────────────────────────────────
// High-intent gender reveal keywords. Always available — used as the
// fallback floor when live sources return empty / error, and merged in
// when live sources return partial data.
export const SEED_KEYWORDS = [
  'gender reveal ideas',
  'gender reveal party',
  'gender reveal smoke bomb',
  'gender reveal cannon',
  'gender reveal balloon',
  'gender reveal cake',
  'gender reveal photoshoot',
  'gender reveal sydney',
  'gender reveal melbourne',
  'gender reveal brisbane',
  'gender reveal gold coast',
  'gender reveal australia',
  'gender reveal video',
  'gender reveal aesthetic',
  'gender reveal at home',
  'gender reveal outdoor',
  'small gender reveal ideas',
  'gender reveal twins',
  'gender reveal couple',
  'gender reveal dad reveal',
  'unique gender reveal ideas',
  'gender reveal party ideas 2026',
  'viral gender reveal',
  'burnout gender reveal',
  'smoke bomb sydney gender reveal',
  'tnt gender reveal kit',
  'gender reveal pink and blue',
  'gender reveal confetti cannon',
  'gender reveal box',
]

// ── Helpers ──────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

function normaliseKeyword(s) {
  return String(s || '').trim().toLowerCase()
}

function formatShortDate(iso) {
  if (!iso) return 'unknown date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown date'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/**
 * Collect the keywords used by GMB posts in the last N days.
 * We look at both entry.category and entry.keyword on each post (and on
 * legacy posts only `category` is populated). Returns a Map of
 * normalised-keyword → most-recent-postedAt ISO.
 */
function recentlyUsedMap(avoidLastNDays) {
  const cutoff = Date.now() - avoidLastNDays * DAY_MS
  const out = new Map()
  let state
  try { state = readState() } catch { state = { posts: [] } }
  for (const p of state.posts || []) {
    const t = Date.parse(p?.postedAt) || 0
    if (!t || t < cutoff) continue
    const candidates = [p.keyword, p.category]
    for (const c of candidates) {
      const key = normaliseKeyword(c)
      if (!key) continue
      const prev = out.get(key)
      if (!prev || Date.parse(prev) < t) out.set(key, p.postedAt)
    }
  }
  return out
}

/**
 * Read live signal from google-trends cache (DataForSEO).
 * Returns array of { keyword, trendDelta, source } where trendDelta is
 * the percent change of the latest weekly value vs the rolling 4-week avg
 * (mirrors the spike detector in google-trends.js).
 */
function readLiveTrendsSignal() {
  let cache
  try { cache = readTrendsCache() } catch { cache = null }
  if (!cache) return []

  const out = []
  const ts = cache.timeseries || {}
  for (const kw of Object.keys(ts)) {
    const series = ts[kw] || []
    if (!series.length) continue
    const latest = series[series.length - 1]?.value ?? 0
    const prior = series.slice(-5, -1).map(p => p.value || 0)
    const avg = prior.length
      ? prior.reduce((a, b) => a + b, 0) / prior.length
      : latest
    const trendDelta = avg > 0
      ? Math.round(((latest - avg) / avg) * 100)
      : 0
    out.push({
      keyword: kw,
      trendDelta,
      source: 'google-trends',
      currentValue: latest,
    })
  }

  // Also surface rising queries — these don't have a timeseries but we
  // know they're rising so we mark them with a high trendDelta proxy.
  for (const rq of cache.risingQueries || []) {
    if (!rq?.query) continue
    out.push({
      keyword: rq.query,
      trendDelta: Number(rq.extracted_value) || 100,
      source: 'google-trends-rising',
      currentValue: null,
    })
  }

  return out
}

/**
 * Read longer-tail signal from keyword-tracker cache.
 * The viewkey scrape exposes monthly searches (ms) for every tracked
 * keyword — exactly what we want for sorting.
 */
function readTrackerSignal() {
  let cache
  try { cache = readKeywordCache() } catch { cache = null }
  if (!cache?.keywords?.length) return []
  const out = []
  for (const k of cache.keywords) {
    if (!k?.keyword) continue
    out.push({
      keyword: k.keyword,
      monthlySearches: Number(k.volume) || 0,
      source: 'keyword-tracker',
      // Rank improving = positive change. Use as a weak trend proxy.
      trendDelta: Number(k.change) || 0,
    })
  }
  return out
}

/**
 * Merge all sources into a single candidate list keyed by normalised
 * keyword. Later sources fill in fields the earlier ones didn't set, but
 * never overwrite a non-zero value with a zero one.
 */
function buildCandidatePool() {
  const pool = new Map()

  const add = (entry) => {
    const key = normaliseKeyword(entry.keyword)
    if (!key) return
    const existing = pool.get(key) || { keyword: entry.keyword, sources: [] }
    if (entry.source) existing.sources.push(entry.source)
    for (const field of ['monthlySearches', 'trendDelta', 'currentValue']) {
      if (entry[field] == null) continue
      if (existing[field] == null || Math.abs(entry[field]) > Math.abs(existing[field] || 0)) {
        existing[field] = entry[field]
      }
    }
    pool.set(key, existing)
  }

  // Live sources first (defensive — never let them throw)
  try { for (const e of readLiveTrendsSignal()) add(e) }
  catch (e) { console.warn('[GmbTrendSource] google-trends read failed:', e.message) }

  try { for (const e of readTrackerSignal()) add(e) }
  catch (e) { console.warn('[GmbTrendSource] keyword-tracker read failed:', e.message) }

  // Always merge the static seed list + GENDER_REVEAL_KEYWORDS so we
  // have a floor even when both live caches are empty.
  for (const kw of SEED_KEYWORDS) add({ keyword: kw, source: 'seed' })
  for (const kw of (GENDER_REVEAL_KEYWORDS || [])) add({ keyword: kw, source: 'seed-trends' })

  return [...pool.values()]
}

/**
 * Score a candidate — higher is better. Volume dominates, trendDelta is
 * a tiebreaker, and we add a small randomness floor so when nothing has
 * volume we don't pick the same word every day.
 */
function scoreCandidate(c) {
  const vol = Number(c.monthlySearches) || 0
  const delta = Number(c.trendDelta) || 0
  // Compress big volume so a 50k keyword doesn't completely dwarf a
  // 5k keyword with a huge rising signal — but volume still wins overall.
  return Math.sqrt(vol) * 10 + delta + Math.random() * 0.5
}

function buildReasoning(top, recentMap, niche) {
  const parts = []
  if (top.monthlySearches) {
    parts.push(`Highest-volume ${niche} keyword (${top.monthlySearches.toLocaleString('en-AU')}/mo)`)
  } else if (top.trendDelta && top.trendDelta > 0) {
    parts.push(`Rising ${niche} signal (+${top.trendDelta}% vs 4-week avg)`)
  } else {
    parts.push(`Seed-list pick for ${niche}`)
  }
  const lastUsed = recentMap.get(normaliseKeyword(top.keyword))
  if (lastUsed) {
    parts.push(`last used ${formatShortDate(lastUsed)}`)
  } else {
    parts.push('not used in the avoid window')
  }
  return parts.join(', ')
}

// ── Public API ───────────────────────────────────────────────

/**
 * Pick today's trend for the GMB post.
 *
 * @param {object} [opts]
 * @param {string} [opts.niche='gender reveal']
 * @param {number} [opts.avoidLastNDays=30]
 * @returns {{ keyword: string, source: string, monthlySearches: number|null,
 *   trendDelta: number|null, reasoning: string } | null}
 */
export function pickTodaysTrend({ niche = 'gender reveal', avoidLastNDays = 30 } = {}) {
  const recentMap = recentlyUsedMap(avoidLastNDays)
  const pool = buildCandidatePool()

  // Filter out anything used in the avoid window
  const available = pool.filter(c => !recentMap.has(normaliseKeyword(c.keyword)))

  // Primary pool: things scored by signal. Sort by score desc.
  const scored = available
    .map(c => ({ ...c, _score: scoreCandidate(c) }))
    .sort((a, b) => b._score - a._score)

  let pick = scored[0]

  // Defensive: if nothing is available, fall through to a random seed
  // pick that still respects the avoid window. If even that's empty,
  // we're truly stuck — return null so the caller knows.
  if (!pick) {
    const seedAvailable = SEED_KEYWORDS.filter(
      kw => !recentMap.has(normaliseKeyword(kw))
    )
    if (!seedAvailable.length) {
      console.warn(
        `[GmbTrendSource] Seed list exhausted within ${avoidLastNDays}-day avoid window — expand SEED_KEYWORDS`
      )
      return null
    }
    const kw = seedAvailable[Math.floor(Math.random() * seedAvailable.length)]
    pick = { keyword: kw, source: 'seed-random', monthlySearches: null, trendDelta: null }
  }

  const result = {
    keyword: pick.keyword,
    source: pick.sources?.[0] || pick.source || 'seed',
    monthlySearches: pick.monthlySearches ?? null,
    trendDelta: pick.trendDelta ?? null,
    reasoning: buildReasoning(pick, recentMap, niche),
  }

  return result
}

/**
 * Last N keywords picked, derived from gmb-posted.json. Useful for the
 * dashboard "recent topics" panel.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=20]
 * @returns {Array<{ keyword: string, postedAt: string, source: string|null }>}
 */
export function getRecentTrendHistory({ limit = 20 } = {}) {
  let state
  try { state = readState() } catch { state = { posts: [] } }
  const out = []
  for (let i = (state.posts || []).length - 1; i >= 0 && out.length < limit; i--) {
    const p = state.posts[i]
    const kw = p?.keyword || p?.category
    if (!kw) continue
    out.push({
      keyword: kw,
      postedAt: p.postedAt || null,
      source: p.generatedBy || null,
    })
  }
  return out
}

/**
 * Quick stats for dashboards / health checks.
 *
 * @returns {{ totalSeedKeywords: number, recentlyUsed: number, currentlyAvailable: number }}
 */
export function getTrendStats() {
  const recentMap = recentlyUsedMap(30)
  const seedSet = new Set(SEED_KEYWORDS.map(normaliseKeyword))
  let recentlyUsed = 0
  for (const key of recentMap.keys()) {
    if (seedSet.has(key)) recentlyUsed++
  }
  return {
    totalSeedKeywords: SEED_KEYWORDS.length,
    recentlyUsed,
    currentlyAvailable: SEED_KEYWORDS.length - recentlyUsed,
  }
}
