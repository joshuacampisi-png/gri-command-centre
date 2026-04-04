/**
 * google-ads-spend.js
 * Stores and retrieves Google Ads daily spend data pushed via Google Ads Scripts webhook.
 * Data format: { date: 'YYYY-MM-DD', spend: number, clicks: number, conversions: number, cost: number, impressions: number }
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { dataFile } from './data-dir.js'

const STORE_FILE = dataFile('google-ads-spend.json')
const WEBHOOK_SECRET = process.env.GOOGLE_ADS_WEBHOOK_SECRET || 'gri-gads-2026'

// In-memory cache
let _cache = null
let _cacheTs = 0
const CACHE_TTL = 60_000 // 1 minute

function loadStore() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache
  if (!existsSync(STORE_FILE)) {
    _cache = {}
    _cacheTs = Date.now()
    return _cache
  }
  try {
    _cache = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    _cacheTs = Date.now()
    return _cache
  } catch {
    _cache = {}
    _cacheTs = Date.now()
    return _cache
  }
}

function saveStore(data) {
  // Atomic write with backup
  if (existsSync(STORE_FILE)) {
    try { copyFileSync(STORE_FILE, STORE_FILE + '.bak') } catch {}
  }
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2))
  _cache = data
  _cacheTs = Date.now()
}

/**
 * Verify webhook secret
 */
export function verifySecret(secret) {
  return secret === WEBHOOK_SECRET
}

/**
 * Record daily spend data from Google Ads Scripts.
 * Overwrites data for the same date (idempotent).
 * @param {Array} days - [{ date, spend, clicks, conversions, impressions }]
 */
export function recordGoogleSpend(days) {
  const store = loadStore()
  let updated = 0

  for (const day of days) {
    if (!day.date) continue
    store[day.date] = {
      spend: parseFloat(day.spend) || 0,
      clicks: parseInt(day.clicks) || 0,
      conversions: parseFloat(day.conversions) || 0,
      impressions: parseInt(day.impressions) || 0,
      updatedAt: new Date().toISOString(),
    }
    updated++
  }

  saveStore(store)
  return updated
}

/**
 * Get Google Ads spend for a date range.
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @returns {{ totalSpend: number, totalClicks: number, totalConversions: number, days: number, dailyBreakdown: object[] }}
 */
export function getGoogleSpend(fromDate, toDate) {
  const store = loadStore()
  let totalSpend = 0
  let totalClicks = 0
  let totalConversions = 0
  let totalImpressions = 0
  const dailyBreakdown = []
  let days = 0

  // Iterate through date range
  const from = new Date(fromDate + 'T00:00:00')
  const to = new Date(toDate + 'T00:00:00')
  const cursor = new Date(from)

  while (cursor <= to) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const entry = store[dateStr]

    if (entry) {
      totalSpend += entry.spend
      totalClicks += entry.clicks
      totalConversions += entry.conversions
      totalImpressions += entry.impressions
      dailyBreakdown.push({ date: dateStr, ...entry })
      days++
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalClicks,
    totalConversions,
    totalImpressions,
    days,
    dailyBreakdown,
    hasData: days > 0,
  }
}

/**
 * Get the most recent data date in the store.
 */
export function getLatestGoogleDate() {
  const store = loadStore()
  const dates = Object.keys(store).sort()
  return dates.length > 0 ? dates[dates.length - 1] : null
}

/**
 * Get all stored data (for debug/admin).
 */
export function getAllGoogleSpend() {
  return loadStore()
}
