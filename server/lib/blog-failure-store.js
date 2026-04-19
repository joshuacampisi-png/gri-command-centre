/**
 * blog-failure-store.js
 * ─────────────────────────────────────────────────────────────
 * Local persistence for blog autopublish failures.
 * When a pipeline run fails any gate (dead links, placeholder
 * content, image QA below threshold, Shopify publish error),
 * the full draft + failure reason is stored here so it can be
 * surfaced on the dashboard and (optionally) fixed + republished.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataFile } from './data-dir.js'

const FAILURES_FILE = dataFile('blog-autopublish/failures.json')
const MAX_FAILURES = 50

function load() {
  try {
    if (!existsSync(FAILURES_FILE)) return []
    return JSON.parse(readFileSync(FAILURES_FILE, 'utf-8'))
  } catch { return [] }
}

function save(items) {
  try {
    mkdirSync(dirname(FAILURES_FILE), { recursive: true })
    writeFileSync(FAILURES_FILE, JSON.stringify(items.slice(0, MAX_FAILURES), null, 2))
  } catch (e) {
    console.warn('[FailureStore] Save failed:', e.message)
  }
}

/**
 * @param {object} record { keyword, articleType, stage, reason, issues?, draft?, ... }
 */
export function recordFailure(record) {
  const items = load()
  items.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...record,
    failedAt: new Date().toISOString(),
  })
  save(items)
}

export function listFailures(limit = 25) {
  return load().slice(0, limit)
}

export function getFailure(id) {
  return load().find(f => f.id === id) || null
}

export function clearFailure(id) {
  const items = load().filter(f => f.id !== id)
  save(items)
}
