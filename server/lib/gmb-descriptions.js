/**
 * GMB description rotation.
 *
 * Picks a description from data/gmb-descriptions.json for a given category,
 * avoiding any description ID posted within the last `daysToAvoid` days
 * (default 14). Falls back to least-recently-used inside the category if
 * everything has been used recently, and to the 'default' category if the
 * requested one is empty.
 *
 * Pool and post-state are lazy-loaded on every call so edits to the JSON
 * files (queue tooling, manual additions) take effect without a restart.
 */
import { readFileSync } from 'node:fs'
import { dataFile } from './data-dir.js'

const POOL_PATH = dataFile('gmb-descriptions.json')
const STATE_PATH = dataFile('gmb-posted.json')

function loadPool() {
  try {
    return JSON.parse(readFileSync(POOL_PATH, 'utf8'))
  } catch {
    return []
  }
}

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    if (!parsed || !Array.isArray(parsed.posts)) return { posts: [] }
    return parsed
  } catch {
    return { posts: [] }
  }
}

function inCategory(description, category) {
  return Array.isArray(description.categories) && description.categories.includes(category)
}

function lastPostedAt(state, descriptionId) {
  let latest = 0
  for (const post of state.posts) {
    if (post.descriptionId !== descriptionId) continue
    const t = new Date(post.postedAt).getTime()
    if (Number.isFinite(t) && t > latest) latest = t
  }
  return latest
}

/**
 * Pick the next description for a category.
 * @param {{ category: string, daysToAvoid?: number }} opts
 * @returns {object|null} the chosen description, or null if no descriptions exist at all
 */
export function pickDescription({ category, daysToAvoid = 14 }) {
  const pool = loadPool()
  const state = loadState()
  const cutoff = Date.now() - daysToAvoid * 24 * 60 * 60 * 1000

  const recentIds = new Set(
    state.posts
      .filter(p => new Date(p.postedAt).getTime() > cutoff)
      .map(p => p.descriptionId)
  )

  const pick = (cat) => {
    const inCat = pool.filter(d => inCategory(d, cat))
    if (inCat.length === 0) return null

    const fresh = inCat.filter(d => !recentIds.has(d.id))
    if (fresh.length > 0) {
      return fresh[Math.floor(Math.random() * fresh.length)]
    }

    // All used recently — least-recently-used within the category.
    return [...inCat].sort((a, b) => lastPostedAt(state, a.id) - lastPostedAt(state, b.id))[0]
  }

  return pick(category) || (category !== 'default' ? pick('default') : null)
}

/**
 * Stats for the dashboard / health checks.
 * @returns {{
 *   totalDescriptions: number,
 *   byCategory: Record<string, number>,
 *   totalPosts: number,
 *   uniqueDescriptionsUsed: number,
 *   lastPostedAt: string|null,
 * }}
 */
export function getDescriptionStats() {
  const pool = loadPool()
  const state = loadState()

  const byCategory = {}
  for (const d of pool) {
    if (!Array.isArray(d.categories)) continue
    for (const cat of d.categories) {
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }
  }

  const usedIds = new Set(state.posts.map(p => p.descriptionId))
  let latest = 0
  for (const p of state.posts) {
    const t = new Date(p.postedAt).getTime()
    if (Number.isFinite(t) && t > latest) latest = t
  }

  return {
    totalDescriptions: pool.length,
    byCategory,
    totalPosts: state.posts.length,
    uniqueDescriptionsUsed: usedIds.size,
    lastPostedAt: latest ? new Date(latest).toISOString() : null,
  }
}
