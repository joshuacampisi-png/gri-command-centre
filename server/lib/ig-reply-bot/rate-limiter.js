/**
 * ig-reply-bot/rate-limiter.js
 * In-memory rolling window rate limits.
 * Resets on server restart (safe default).
 */

const GLOBAL_PER_HOUR = 20
const PER_POST_PER_DAY = 5

const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * 60 * 60 * 1000

// Rolling windows
let globalWindow = []
const postWindows = new Map()

function pruneOld(timestamps, maxAge) {
  const cutoff = Date.now() - maxAge
  return timestamps.filter(t => t > cutoff)
}

export function canReply(postId) {
  // Prune and check global
  globalWindow = pruneOld(globalWindow, ONE_HOUR)
  if (globalWindow.length >= GLOBAL_PER_HOUR) {
    return { allowed: false, reason: `Global rate limit: ${GLOBAL_PER_HOUR}/hour reached` }
  }

  // Prune and check per-post
  let postTimes = postWindows.get(postId) || []
  postTimes = pruneOld(postTimes, ONE_DAY)
  postWindows.set(postId, postTimes)
  if (postTimes.length >= PER_POST_PER_DAY) {
    return { allowed: false, reason: `Per-post limit: ${PER_POST_PER_DAY}/day reached for ${postId}` }
  }

  return { allowed: true }
}

export function recordReply(postId) {
  const now = Date.now()
  globalWindow.push(now)

  let postTimes = postWindows.get(postId) || []
  postTimes.push(now)
  postWindows.set(postId, postTimes)

  // Clean up empty map entries periodically
  if (postWindows.size > 500) {
    for (const [key, times] of postWindows) {
      const pruned = pruneOld(times, ONE_DAY)
      if (pruned.length === 0) postWindows.delete(key)
      else postWindows.set(key, pruned)
    }
  }
}

export function getRateLimitStatus() {
  globalWindow = pruneOld(globalWindow, ONE_HOUR)
  return {
    globalUsed: globalWindow.length,
    globalMax: GLOBAL_PER_HOUR,
    activePosts: postWindows.size
  }
}
