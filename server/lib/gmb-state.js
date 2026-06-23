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
 * @param {object} entry
 * @param {string} entry.image - image url or id used in the post
 * @param {string} entry.descriptionId - id of the description copy used
 * @param {string} entry.buttonUrl - CTA button destination
 * @param {string} entry.buttonType - CTA button type (e.g. SHOP, BOOK, LEARN_MORE)
 * @param {string} entry.postedAt - ISO timestamp the post went live
 */
export function logPost({ image, descriptionId, buttonUrl, buttonType, postedAt }) {
  const state = readState()
  state.posts.push({ image, descriptionId, buttonUrl, buttonType, postedAt })
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

/**
 * Aggregate stats for the dashboard.
 * postsLast30Days is computed at runtime from the posts array.
 * @returns {{
 *   totalPosts: number,
 *   totalFailures: number,
 *   lastPostAt: string|null,
 *   lastFailureAt: string|null,
 *   postsLast30Days: number,
 * }}
 */
export function getStats() {
  const { posts, failures } = readState()
  const now = Date.now()
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
  const postsLast30Days = posts.reduce((n, p) => {
    const t = Date.parse(p.postedAt) || 0
    return t && now - t <= THIRTY_DAYS_MS ? n + 1 : n
  }, 0)
  return {
    totalPosts: posts.length,
    totalFailures: failures.length,
    lastPostAt: posts.length ? posts[posts.length - 1].postedAt : null,
    lastFailureAt: failures.length ? failures[failures.length - 1].at : null,
    postsLast30Days,
  }
}
