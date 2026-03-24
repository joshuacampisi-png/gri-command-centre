/**
 * Competitor Historical Storage
 * Every scan is timestamped and stored so we can track trends over time.
 * Stores: organic rankings, Google Ads data, Meta ads data
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

function historyFile(type) {
  return dataFile(`competitor-history/${type}-history.json`)
}

function readHistory(type) {
  const file = historyFile(type)
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  } catch {}
  return []
}

function writeHistory(type, entries) {
  writeFileSync(historyFile(type), JSON.stringify(entries, null, 2))
}

/**
 * Append a scan to history
 * @param {'organic'|'paid'|'meta'} type
 * @param {object} scanData
 */
export function appendScan(type, scanData) {
  const history = readHistory(type)
  history.push({
    ...scanData,
    scannedAt: new Date().toISOString(),
  })
  // Keep last 52 weeks of data (1 year of weekly scans)
  const trimmed = history.slice(-52)
  writeHistory(type, trimmed)
  return trimmed
}

/**
 * Get full history for a type
 */
export function getHistory(type) {
  return readHistory(type)
}

/**
 * Get history for a specific competitor
 */
export function getCompetitorHistory(type, competitorId) {
  const history = readHistory(type)
  return history.map(scan => ({
    scannedAt: scan.scannedAt,
    data: scan.competitors?.[competitorId] || scan.data?.[competitorId] || null,
  })).filter(s => s.data !== null)
}

/**
 * Get latest scan data
 */
export function getLatestScan(type) {
  const history = readHistory(type)
  return history.length > 0 ? history[history.length - 1] : null
}

/**
 * Compare latest two scans to detect changes
 */
export function detectChanges(type) {
  const history = readHistory(type)
  if (history.length < 2) return { hasChanges: false, isFirstScan: history.length === 1 }

  const current = history[history.length - 1]
  const previous = history[history.length - 2]

  return { hasChanges: true, current, previous }
}
