/**
 * Rank Drop Detector
 * Compares current keyword cache vs saved snapshot.
 * Identifies drops >= threshold and queues blog generation.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const SNAPSHOT_FILE = dataFile('keyword-snapshot.json')  // previous day's rankings
const DROPS_FILE    = dataFile('rank-drops.json')        // pending blog triggers

const DROP_THRESHOLD = parseInt(process.env.KW_DROP_TRIGGER || '3') // 3+ position drop triggers article

// ── Snapshot management ────────────────────────────────────────────────────

export function saveSnapshot(cache) {
  try {
    writeFileSync(SNAPSHOT_FILE, JSON.stringify({
      savedAt: new Date().toISOString(),
      keywords: cache.keywords.map(k => ({ id: k.id, keyword: k.keyword, rank: k.rank, volume: k.volume, rankingUrl: k.rankingUrl, tags: k.tags }))
    }, null, 2))
  } catch (e) {
    console.error('[Drop Detector] Failed to save snapshot:', e.message)
  }
}

export function loadSnapshot() {
  try {
    if (!existsSync(SNAPSHOT_FILE)) return null
    return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'))
  } catch { return null }
}

// ── Drop detection ─────────────────────────────────────────────────────────

export function detectDrops(currentCache) {
  const snapshot = loadSnapshot()
  if (!snapshot) {
    console.log('[Drop Detector] No snapshot yet — saving current as baseline')
    saveSnapshot(currentCache)
    return []
  }

  const prevMap = {}
  for (const k of snapshot.keywords) {
    // Deduplicate by keyword text (some appear twice in viewkey for mobile/desktop)
    if (!prevMap[k.keyword] || (k.rank !== null && k.rank < prevMap[k.keyword].rank)) {
      prevMap[k.keyword] = k
    }
  }

  const drops = []
  const seen = new Set()

  for (const kw of currentCache.keywords) {
    if (seen.has(kw.keyword)) continue // skip duplicates
    seen.add(kw.keyword)

    const prev = prevMap[kw.keyword]
    if (!prev || prev.rank === null || kw.rank === null) continue

    const drop = kw.rank - prev.rank // positive = dropped (rank number got worse)
    if (drop >= DROP_THRESHOLD) {
      drops.push({
        id:          `drop-${kw.id}-${Date.now()}`,
        keyword:     kw.keyword,
        currentRank: kw.rank,
        previousRank: prev.rank,
        drop,
        volume:      kw.volume,
        rankingUrl:  kw.rankingUrl || '',
        tags:        kw.tags || [],
        detectedAt:  new Date().toISOString(),
        status:      'pending', // pending → generating → draft → approved → published
        blogPost:    null,
      })
    }
  }

  console.log(`[Drop Detector] Found ${drops.length} drops >= ${DROP_THRESHOLD} positions`)
  return drops
}

// ── Drops queue ─────────────────────────────────────────────────────────────

export function loadDrops() {
  try {
    if (!existsSync(DROPS_FILE)) return []
    return JSON.parse(readFileSync(DROPS_FILE, 'utf8'))
  } catch { return [] }
}

export function saveDrops(drops) {
  try {
    writeFileSync(DROPS_FILE, JSON.stringify(drops, null, 2))
  } catch (e) {
    console.error('[Drop Detector] Failed to save drops:', e.message)
  }
}

export function addDrops(newDrops) {
  const existing = loadDrops()
  // Don't duplicate — check by keyword
  const existingKeywords = new Set(existing.filter(d => d.status !== 'published').map(d => d.keyword))
  const toAdd = newDrops.filter(d => !existingKeywords.has(d.keyword))
  if (toAdd.length === 0) return existing
  const updated = [...existing, ...toAdd]
  saveDrops(updated)
  console.log(`[Drop Detector] Added ${toAdd.length} new drop triggers to queue`)
  return updated
}

export function updateDrop(id, patch) {
  const drops = loadDrops()
  const idx = drops.findIndex(d => d.id === id)
  if (idx === -1) return drops
  drops[idx] = { ...drops[idx], ...patch }
  saveDrops(drops)
  return drops
}
