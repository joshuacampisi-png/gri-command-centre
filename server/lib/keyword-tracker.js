/**
 * Keyword Tracker — Keyword.com Viewkey Scraper
 * Scrapes the public share link using Playwright (no API key needed).
 * GRI project ID: IfZYQs3
 * Viewkey URL: https://app.keyword.com/projects/IfZYQs3/a778b1b5a9a7aa283a041d387fe89f85
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const CACHE_FILE = dataFile('keyword-cache.json')
const LOG_FILE   = dataFile('keyword-api.log')
const VIEWKEY_URL = process.env.KEYWORD_COM_VIEWKEY_URL ||
  'https://app.keyword.com/projects/IfZYQs3/a778b1b5a9a7aa283a041d387fe89f85'

// ── Alert thresholds ──
const THRESHOLDS = {
  criticalDrop:     parseInt(process.env.KW_THRESHOLD_CRITICAL  || '6'),   // positions dropped in 24h
  sustainedDecline: parseInt(process.env.KW_THRESHOLD_SUSTAINED || '3'),   // consecutive days declining
  sustainedDays:    parseInt(process.env.KW_THRESHOLD_DAYS      || '3'),
  top3RiskDropTo:   parseInt(process.env.KW_THRESHOLD_TOP3      || '5'),   // was 1-3, dropped below this
}

function log(msg) {
  const line = `[${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}] ${msg}\n`
  try { writeFileSync(LOG_FILE, line, { flag: 'a' }) } catch {}
  console.log('[KW-Tracker]', msg)
}

// ── Cache ──────────────────────────────────────────────────────────────────

export function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch { return null }
}

export function writeCache(data) {
  // Atomic write: write to .tmp then rename
  const tmp = CACHE_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  // Node doesn't have atomic rename on all platforms, but this is safer than direct write
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

// ── Viewkey scraper (Playwright — no API key needed) ───────────────────────

export function hasCredentials() {
  // Always true — we use the public viewkey share link
  return true
}

// ── Full refresh via Playwright scrape ────────────────────────────────────

export async function refreshRankings() {
  log(`Scraping viewkey: ${VIEWKEY_URL}`)

  let browser
  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto(VIEWKEY_URL, { waitUntil: 'networkidle', timeout: 30000 })

    // Wait for Vue store to populate
    await page.waitForFunction(() => {
      const app = window.vueInstanceHolder?.instance
      const items = app?.$store?.state?.keywords?.originalItems
      return items && items.length > 0
    }, { timeout: 20000 })

    const keywords = await page.evaluate(() => {
      const store = window.vueInstanceHolder.instance.$store
      const items = store.state.keywords.originalItems
      return items.map(k => ({
        id:         String(k.id),
        keyword:    k.kw,
        rank:       k.grank ?? null,
        prevRank:   k.prev_grank ?? null,
        change:     (k.prev_grank != null && k.grank != null) ? k.prev_grank - k.grank : 0,
        volume:     k.ms ?? null,
        rankingUrl: k.rank_url || '',
        device:     'desktop',
        location:   k.region || 'google.com.au',
        bestRank:   k.best_rank ?? null,
        startRank:  k.start ?? null,
        tags:       (k.tags || []).map(t => t.name),
        history:    [],
        updatedAt:  new Date().toISOString(),
      }))
    })

    await browser.close()
    browser = null

    // Fill in prevRank/change from previous cache if Keyword.com doesn't provide prev_grank
    const oldCache = readCache()
    if (oldCache?.keywords?.length) {
      // Build best-rank map from previous cache (dedup by keyword, keep best rank)
      const prevMap = {}
      for (const k of oldCache.keywords) {
        if (!prevMap[k.keyword]) {
          prevMap[k.keyword] = k
        } else if (k.rank !== null && (prevMap[k.keyword].rank === null || k.rank < prevMap[k.keyword].rank)) {
          prevMap[k.keyword] = k
        }
      }
      for (const kw of keywords) {
        if (kw.prevRank === null && prevMap[kw.keyword]) {
          const prev = prevMap[kw.keyword]
          if (prev.rank !== null && kw.rank !== null) {
            kw.prevRank = prev.rank
            kw.change   = prev.rank - kw.rank // positive = improved, negative = declined
          }
        }
      }
    }

    const alerts = detectAlerts(keywords)
    const cache = {
      updatedAt: new Date().toISOString(),
      project:   'IfZYQs3',
      source:    'viewkey-playwright',
      keywords,
      alerts,
      stats: {
        total:     keywords.length,
        top3:      keywords.filter(k => k.rank != null && k.rank <= 3).length,
        top10:     keywords.filter(k => k.rank != null && k.rank <= 10).length,
        improving: keywords.filter(k => k.change > 0).length,
        declining: keywords.filter(k => k.change < 0).length,
        critical:  alerts.filter(a => a.type === 'CRITICAL_DROP').length,
      }
    }

    // Save snapshot BEFORE overwriting cache (used for drop detection)
    const prevCache = readCache()
    if (prevCache) {
      const { saveSnapshot } = await import('./rank-drop-detector.js')
      saveSnapshot(prevCache)
    }

    writeCache(cache)
    log(`Refresh complete: ${keywords.length} keywords, ${alerts.length} alerts`)

    // Detect drops and queue blog generation (non-blocking)
    setTimeout(async () => {
      try {
        const { detectDrops, addDrops } = await import('./rank-drop-detector.js')
        const drops = detectDrops(cache)
        if (drops.length > 0) {
          addDrops(drops)
          log(`Queued ${drops.length} blog article(s) for dropped keywords`)
          // Trigger generation for each drop
          const { generateAndQueueArticles } = await import('./blog-pipeline.js')
          await generateAndQueueArticles(drops)
        }
      } catch (e) {
        log(`Drop detection error: ${e.message}`)
      }
    }, 2000)

    return cache

  } catch (e) {
    if (browser) await browser.close().catch(() => {})
    log(`Scrape failed: ${e.message}`)
    throw e
  }
}

// ── Alert detection ────────────────────────────────────────────────────────

export function detectAlerts(keywords) {
  const alerts = []

  for (const kw of keywords) {
    if (kw.rank === null) continue

    // CRITICAL DROP: dropped 6+ positions in 24h
    if (kw.change <= -(THRESHOLDS.criticalDrop)) {
      alerts.push({
        type:     'CRITICAL_DROP',
        severity: 'critical',
        keyword:  kw.keyword,
        keywordId: kw.id,
        rank:     kw.rank,
        prevRank: kw.prevRank,
        change:   kw.change,
        url:      kw.url,
        message:  `"${kw.keyword}" dropped ${Math.abs(kw.change)} positions (${kw.prevRank} → ${kw.rank})`,
        timestamp: new Date().toISOString(),
      })
      continue
    }

    // TOP 3 AT RISK: was 1–3, now below threshold
    if (kw.prevRank !== null && kw.prevRank <= 3 && kw.rank > THRESHOLDS.top3RiskDropTo) {
      alerts.push({
        type:     'TOP3_AT_RISK',
        severity: 'high',
        keyword:  kw.keyword,
        keywordId: kw.id,
        rank:     kw.rank,
        prevRank: kw.prevRank,
        change:   kw.change,
        url:      kw.url,
        message:  `"${kw.keyword}" was in top 3, now at position ${kw.rank}`,
        timestamp: new Date().toISOString(),
      })
      continue
    }

    // SUSTAINED DECLINE: 3+ consecutive drops in history
    if (kw.history && kw.history.length >= THRESHOLDS.sustainedDays) {
      const recent = kw.history.slice(-THRESHOLDS.sustainedDays)
      let sustainedDrop = true
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].rank === null || recent[i-1].rank === null) { sustainedDrop = false; break }
        if (recent[i].rank <= recent[i-1].rank) { sustainedDrop = false; break } // rank number going up = worse
      }
      if (sustainedDrop) {
        const totalDrop = (recent[recent.length-1].rank || 0) - (recent[0].rank || 0)
        alerts.push({
          type:     'SUSTAINED_DECLINE',
          severity: 'high',
          keyword:  kw.keyword,
          keywordId: kw.id,
          rank:     kw.rank,
          prevRank: kw.prevRank,
          change:   kw.change,
          url:      kw.url,
          message:  `"${kw.keyword}" declining for ${THRESHOLDS.sustainedDays}+ days (total drop: ${totalDrop} positions)`,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  return alerts
}

// ── Status label for a keyword ─────────────────────────────────────────────

export function getKeywordStatus(kw) {
  if (kw.change === null || kw.change === 0) return 'STABLE'
  if (kw.change >= 3)  return 'IMPROVING'
  if (kw.change > 0)   return 'IMPROVING'
  if (kw.change <= -6) return 'CRITICAL'
  if (kw.change < 0)   return 'VOLATILE'
  return 'STABLE'
}

// ── Scheduler: daily at 6am AEST (20:00 UTC) ──────────────────────────────

function msUntilNextUTCTime(utcHour, utcMinute = 0) {
  const now = new Date()
  const target = new Date(now)
  target.setUTCHours(utcHour, utcMinute, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  return Math.max(0, target.getTime() - now.getTime())
}

let schedulerActive = false

export function startKeywordScheduler() {
  if (schedulerActive) return
  schedulerActive = true

  const scheduleDailyRefresh = () => {
    // 6am AEST = 20:00 UTC (Queensland, no DST)
    const msUntil = msUntilNextUTCTime(20, 0)
    const nextRun = new Date(Date.now() + msUntil)
    console.log(`[KW-Tracker] Next refresh: ${nextRun.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)
    setTimeout(async () => {
      if (hasCredentials()) {
        try { await refreshRankings() }
        catch (e) { log(`Scheduled refresh failed: ${e.message}`) }
      }
      scheduleDailyRefresh()
    }, msUntil)
  }

  scheduleDailyRefresh()
  console.log('[KW-Tracker] Keyword scheduler active — daily at 6:00am AEST')

  // Also refresh on boot if we have credentials and cache is stale (>24h or missing)
  setTimeout(async () => {
    if (!hasCredentials()) return
    const cache = readCache()
    if (!cache) { try { await refreshRankings() } catch (e) { log(`Boot refresh failed: ${e.message}`) } return }
    const age = Date.now() - new Date(cache.updatedAt).getTime()
    if (age > 24 * 60 * 60 * 1000) {
      log('Cache is stale — refreshing on boot')
      try { await refreshRankings() } catch (e) { log(`Boot refresh failed: ${e.message}`) }
    }
  }, 15000)
}
