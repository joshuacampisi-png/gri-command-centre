/**
 * instagram-cron.js
 * Checks every minute for scheduled Instagram posts that are due to publish.
 * Retries failed posts up to 3 times with 5-minute backoff.
 */
import cron from 'node-cron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'
import { isInstagramConfigured, publishImage, publishCarousel, publishReel } from './instagram-publisher.js'

const DATA_FILE = dataFile('instagram-posts.json')

function loadPosts() {
  if (!existsSync(DATA_FILE)) return []
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')) }
  catch { return [] }
}

function savePosts(posts) {
  writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2))
}

function getAppUrl() {
  return process.env.APP_URL || process.env.RAILWAY_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`
}

async function publishPost(post) {
  const appUrl = getAppUrl()
  const fullUrls = (post.mediaUrls || []).map(u => u.startsWith('http') ? u : `${appUrl}${u}`)

  if (post.type === 'carousel') {
    return publishCarousel(fullUrls, post.caption || '')
  } else if (post.type === 'reel') {
    return publishReel(fullUrls[0], post.caption || '')
  } else {
    return publishImage(fullUrls[0], post.caption || '')
  }
}

async function checkAndPublish() {
  if (!isInstagramConfigured()) return

  const posts = loadPosts()
  const now = new Date()
  let changed = false

  for (const post of posts) {
    if (post._archived) continue

    // Check scheduled posts that are due
    const isDue = post.status === 'SCHEDULED' && post.scheduledAt && new Date(post.scheduledAt) <= now

    // Check failed posts eligible for retry (< 3 attempts, failed > 5 min ago)
    const isRetry = post.status === 'FAILED'
      && (post.attempts || 0) < 3
      && post.lastAttemptAt
      && (now - new Date(post.lastAttemptAt)) > 5 * 60 * 1000

    if (!isDue && !isRetry) continue

    console.log(`[IG Cron] ${isRetry ? 'Retrying' : 'Publishing'} post ${post.id} (${post.type})`)
    post.status = 'PUBLISHING'
    post.lastAttemptAt = now.toISOString()
    changed = true

    try {
      const result = await publishPost(post)
      post.status = 'PUBLISHED'
      post.publishedAt = now.toISOString()
      post.igPostId = result.igPostId
      post.igPermalink = result.permalink
      post.error = null
      console.log(`[IG Cron] Published post ${post.id} -> ${result.igPostId}`)
    } catch (err) {
      post.attempts = (post.attempts || 0) + 1
      post.error = err.message
      if (post.attempts >= 3) {
        post.status = 'FAILED'
        console.error(`[IG Cron] Post ${post.id} permanently failed after 3 attempts: ${err.message}`)
      } else {
        post.status = 'FAILED'
        console.warn(`[IG Cron] Post ${post.id} failed (attempt ${post.attempts}/3): ${err.message}`)
      }
    }
  }

  if (changed) savePosts(posts)
}

export function startInstagramCron() {
  if (!isInstagramConfigured()) {
    console.log('[IG Cron] Instagram not configured — scheduler disabled')
    return
  }

  cron.schedule('* * * * *', async () => {
    try {
      await checkAndPublish()
    } catch (err) {
      console.error('[IG Cron] Scheduler error:', err.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[IG Cron] Instagram scheduler started (checking every minute)')
}
