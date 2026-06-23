/**
 * gmb-state.js
 * ─────────────────────────────────────────────────────────────
 * Persistent state for Google My Business auto-posting.
 * Tracks successful posts and failures so we can:
 *   - avoid reposting the same image
 *   - alert when failures pile up (circuit-breaker)
 *   - surface stats on the dashboard
 *
 * Storage: single JSON file at data/gmb-posted.json
 * Shape: { posts: [], failures: [] }
 * Writes are atomic (tmp file + rename) to survive crashes.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const STATE_FILE = dataFile('gmb-posted.json')
const TMP_FILE = `${STATE_FILE}.tmp`

const EMPTY_STATE = { posts: [], failures: [] }

/**
 * Read full state from disk. Returns empty shape if missing/corrupt.
 * @returns {{ posts: Array, failures: Array }}
 */
export function readState() {
  try {
    if (!existsSync(STATE_FILE)) return { posts: [], failures: [] }
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      posts: Array.isArray(parsed?.posts) ? parsed.posts : [],
      failures: Array.isArray(parsed?.failures) ? parsed.failures : [],
    }
  } catch (e) {
    console.warn('[GmbState] Read failed, returning empty:', e.message)
    return { posts: [], failures: [] }
  }
}

/**
 * Atomically write state to disk via tmp + rename.
 * @param {{ posts: Array, failures: Array }} state
 */
function writeState(state) {
  const payload = JSON.stringify(state, null, 2)
  writeFileSync(TMP_FILE, payload)
  renameSync(TMP_FILE, STATE_FILE)
}

/**
 * Record a successful GMB post.
 *
 * Legacy fields (always present):
 * @param {object} entry
 * @param {string} entry.image - image url or id used in the post
 * @param {string} entry.descriptionId - id of the description copy used (null for AI-generated)
 * @param {string} entry.buttonUrl - CTA button destination
 * @param {string} entry.buttonType - CTA button type (e.g. SHOP, BOOK, LEARN_MORE)
 * @param {string} entry.postedAt - ISO timestamp the post went live
 *
 * AI provenance fields (optional, default null/0):
 * @param {string} [entry.generatedBy] - 'static-pool' | 'claude-sonnet-4-6' |
 *   'fal-nano-banana-pro+claude' | 'openai-gpt-4o' | etc. Lets the dashboard
 *   distinguish AI posts from static-pool ones.
 * @param {number} [entry.costUsd] - dollar cost of generating this post
 *   (Claude + FAL combined). Aggregated in getStats() as aiCost totals.
 * @param {string} [entry.fallbackReason] - if AI was requested but a step
 *   failed and the system fell back (e.g. 'claude-error: rate-limited' or
 *   'fal-error: timeout'), the reason goes here for debugging.
 * @param {string} [entry.sourceMode] - 'static' | 'ai-fal-generated' |
 *   'ai-openai' — the descriptionMode that was active at post time.
 * @param {string} [entry.category] - mapping category from the URL config
 *   (e.g. 'tnt', 'smoke') — so the dashboard can group AI posts by category.
 * @param {string} [entry.hookText] - the overlay text on the image (AI mode)
 *   for quick visual scanning in the recent-posts table.
 */
export function logPost(entry = {}) {
  const {
    // Legacy fields
    image = null,
    descriptionId = null,
    buttonUrl = null,
    buttonType = null,
    postedAt = null,
    // AI provenance (default null/0 so older callers keep working
    // and old entries in gmb-posted.json without these fields read
    // as undefined — both downstream behaviours are intentional)
    generatedBy = null,
    costUsd = 0,
    fallbackReason = null,
    sourceMode = null,
    category = null,
    hookText = null,
  } = entry
  const state = readState()
  state.posts.push({
    image, descriptionId, buttonUrl, buttonType, postedAt,
    generatedBy, costUsd, fallbackReason, sourceMode, category, hookText,
  })
  writeState(state)
}

/**
 * Record a failed GMB post attempt.
 * @param {object} entry
 * @param {string} entry.image - image url or id attempted
 * @param {string} entry.error - error message
 * @param {string} entry.at - ISO timestamp of the failure
 */
export function logFailure({ image, error, at }) {
  const state = readState()
  state.failures.push({ image, error, at })
  writeState(state)
}

/**
 * Count failures since the last successful post.
 * Used by the circuit-breaker to stop retrying after N consecutive errors.
 * @returns {number}
 */
export function consecutiveFailures() {
  const { posts, failures } = readState()
  const lastPostAt = posts.length
    ? Date.parse(posts[posts.length - 1].postedAt) || 0
    : 0
  let count = 0
  for (let i = failures.length - 1; i >= 0; i--) {
    const failedAt = Date.parse(failures[i].at) || 0
    if (failedAt <= lastPostAt) break
    count++
  }
  return count
}

// A post is "AI" if generatedBy exists and isn't the static-pool sentinel.
// Treats old entries (missing field) as static so backfill is conservative.
function isAiPost(p) {
  return Boolean(p.generatedBy) && p.generatedBy !== 'static-pool'
}

/**
 * Aggregate stats for the dashboard.
 * postsLast30Days is computed at runtime from the posts array.
 * AI breakdowns let the dashboard show "X AI / Y static" + a running spend.
 * @returns {{
 *   totalPosts: number,
 *   totalFailures: number,
 *   lastPostAt: string|null,
 *   lastFailureAt: string|null,
 *   postsLast30Days: number,
 *   aiPostsLifetime: number,
 *   aiPostsLast30Days: number,
 *   aiCostLifetimeUsd: number,
 *   aiCostLast30DaysUsd: number,
 * }}
 */
export function getStats() {
  const { posts, failures } = readState()
  const now = Date.now()
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

  let postsLast30Days = 0
  let aiPostsLifetime = 0
  let aiPostsLast30Days = 0
  let aiCostLifetimeUsd = 0
  let aiCostLast30DaysUsd = 0

  for (const p of posts) {
    const t = Date.parse(p.postedAt) || 0
    const inWindow = t && now - t <= THIRTY_DAYS_MS
    if (inWindow) postsLast30Days++
    if (isAiPost(p)) {
      aiPostsLifetime++
      aiCostLifetimeUsd += Number(p.costUsd) || 0
      if (inWindow) {
        aiPostsLast30Days++
        aiCostLast30DaysUsd += Number(p.costUsd) || 0
      }
    }
  }

  return {
    totalPosts: posts.length,
    totalFailures: failures.length,
    lastPostAt: posts.length ? posts[posts.length - 1].postedAt : null,
    lastFailureAt: failures.length ? failures[failures.length - 1].at : null,
    postsLast30Days,
    aiPostsLifetime,
    aiPostsLast30Days,
    aiCostLifetimeUsd: Math.round(aiCostLifetimeUsd * 10000) / 10000,
    aiCostLast30DaysUsd: Math.round(aiCostLast30DaysUsd * 10000) / 10000,
  }
}
