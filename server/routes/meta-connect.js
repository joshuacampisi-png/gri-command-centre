/**
 * meta-connect.js
 * Simple token-paste flow for connecting Instagram Business account.
 * Saves credentials to data/meta-connect.json and validates them against the Graph API.
 */
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from '../lib/data-dir.js'

const router = Router()
const STORE_FILE = dataFile('meta-connect.json')
const BASE = 'https://graph.facebook.com/v20.0'

function loadStore() {
  if (!existsSync(STORE_FILE)) return { connected: false }
  try { return JSON.parse(readFileSync(STORE_FILE, 'utf8')) }
  catch { return { connected: false } }
}

function saveStore(data) {
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2))
}

// Get connection status
router.get('/status', (_req, res) => {
  const store = loadStore()
  res.json({
    connected: store.connected || false,
    igAccountId: store.igAccountId || null,
    igUsername: store.igUsername || null,
    pageName: store.pageName || null,
    connectedAt: store.connectedAt || null,
  })
})

// Connect: validate and save tokens
router.post('/connect', async (req, res) => {
  const { pageAccessToken, igAccountId } = req.body

  if (!pageAccessToken || !igAccountId) {
    return res.status(400).json({ error: 'Both Page Access Token and Instagram Business Account ID are required.' })
  }

  try {
    // Validate the token by fetching the IG account info
    const igRes = await fetch(`${BASE}/${igAccountId}?fields=username,name,profile_picture_url,followers_count,media_count&access_token=${pageAccessToken}`)
    const igData = await igRes.json()

    if (igData.error) {
      return res.status(400).json({ error: `Instagram API error: ${igData.error.message}` })
    }

    // Also check we can access the content publishing API
    const permRes = await fetch(`${BASE}/me?fields=id,name&access_token=${pageAccessToken}`)
    const permData = await permRes.json()

    if (permData.error) {
      return res.status(400).json({ error: `Token validation failed: ${permData.error.message}` })
    }

    // Save to store
    const store = {
      connected: true,
      pageAccessToken,
      igAccountId,
      igUsername: igData.username || null,
      igName: igData.name || null,
      igProfilePic: igData.profile_picture_url || null,
      igFollowers: igData.followers_count || 0,
      igMediaCount: igData.media_count || 0,
      pageName: permData.name || null,
      pageId: permData.id || null,
      connectedAt: new Date().toISOString(),
    }
    saveStore(store)

    // Also set in process.env so the publisher picks them up immediately
    process.env.META_PAGE_ACCESS_TOKEN = pageAccessToken
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = igAccountId

    console.log(`[Meta Connect] Connected Instagram: @${igData.username} (${igAccountId})`)

    res.json({
      ok: true,
      igUsername: igData.username,
      igName: igData.name,
      igFollowers: igData.followers_count,
      igMediaCount: igData.media_count,
      pageName: permData.name,
    })
  } catch (err) {
    res.status(500).json({ error: `Connection failed: ${err.message}` })
  }
})

// Disconnect
router.post('/disconnect', (_req, res) => {
  saveStore({ connected: false })
  delete process.env.META_PAGE_ACCESS_TOKEN
  delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  console.log('[Meta Connect] Instagram disconnected')
  res.json({ ok: true })
})

// Test the connection (quick health check)
router.get('/test', async (_req, res) => {
  const store = loadStore()
  if (!store.connected || !store.pageAccessToken) {
    return res.json({ ok: false, error: 'Not connected' })
  }

  try {
    const igRes = await fetch(`${BASE}/${store.igAccountId}?fields=username,followers_count,media_count&access_token=${store.pageAccessToken}`)
    const igData = await igRes.json()

    if (igData.error) {
      return res.json({ ok: false, error: igData.error.message })
    }

    res.json({ ok: true, username: igData.username, followers: igData.followers_count, posts: igData.media_count })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

export default router

// Boot helper: load saved tokens into process.env on server start
export function loadSavedMetaTokens() {
  const store = loadStore()
  if (store.connected && store.pageAccessToken && store.igAccountId) {
    process.env.META_PAGE_ACCESS_TOKEN = store.pageAccessToken
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = store.igAccountId
    console.log(`[Meta Connect] Loaded saved Instagram credentials: @${store.igUsername || store.igAccountId}`)
  }
}
