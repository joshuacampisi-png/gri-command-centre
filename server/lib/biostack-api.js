/**
 * biostack-api.js
 * Meta Marketing API wrapper for the BioStack ad account.
 *
 * Completely separate from server/lib/meta-api.js (GRI) — different account,
 * different token, different unit economics. Do not merge the two.
 *
 * Token: 60-day extended user token (generated 2026-07-05, expires ~2026-09-03).
 * Replace HARDCODED_BIOSTACK_TOKEN when it expires, or set BIOSTACK_META_TOKEN
 * on Railway. Env var takes priority here (no stale-var problem like GRI).
 * Swap to a never-expiring system-user token once the BioStack business
 * portfolio passes verification.
 */

const BASE = 'https://graph.facebook.com/v25.0'

const HARDCODED_BIOSTACK_TOKEN = 'EAAWDKV3AsNABR9XXXvL3zC5ILU0B04Ge5z0Vsr3G6iMSFu4QcaMNZAmzYmQEOIQtF6HaZAZA97VPxVy9ygWFvUBZCI2CBS9kSytAkJhT5DtsbXEckNJZBPRtZCy2E9wa8IkNKBuiFQTxoYqfBBWG3SJzW9q7cpHp41wOeWrbeBZB1n8MqbRTHJA4g2Cdf7uddheHnciVn6yzgfWvfRKslc7WFnb4q1NjEOSoVud5uzHCIDpPaCdZCWLgZBvL7qQVR6Uo2yxtqcDch0gHF6uePsLZAWOMFOBDIriZCCNg5ahL6qZA5tDfc8dwdGTOcCoZCO4KLYXtuaZCgXlNwMyi0p'
const HARDCODED_BIOSTACK_AD_ACCOUNT_ID = 'act_1119886435785687'

export function biostackToken() {
  return process.env.BIOSTACK_META_TOKEN || HARDCODED_BIOSTACK_TOKEN
}

export function biostackAccountId() {
  return process.env.BIOSTACK_AD_ACCOUNT_ID || HARDCODED_BIOSTACK_AD_ACCOUNT_ID
}

export function isBiostackConfigured() {
  return Boolean(biostackToken() && biostackAccountId())
}

// ── Rate limiter (own instance — must not share GRI's hourly budget) ────────

const _getCache = new Map()
const GET_CACHE_TTL = 5 * 60 * 1000
let _lastCallTime = 0
const MIN_CALL_GAP_MS = 1000
let _callsThisHour = 0
let _hourStart = Date.now()
const MAX_CALLS_PER_HOUR = 300

async function rateLimitWait() {
  if (Date.now() - _hourStart > 3600000) {
    _callsThisHour = 0
    _hourStart = Date.now()
  }
  if (_callsThisHour >= MAX_CALLS_PER_HOUR) {
    const waitMs = 3600000 - (Date.now() - _hourStart)
    throw new Error(`BioStack Meta API rate limit reached (${MAX_CALLS_PER_HOUR}/hour). Try again in ${Math.round(waitMs / 60000)} minutes.`)
  }
  const gap = Date.now() - _lastCallTime
  if (gap < MIN_CALL_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_GAP_MS - gap))
  }
  _lastCallTime = Date.now()
  _callsThisHour++
}

async function metaGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', biostackToken())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const urlStr = url.toString()

  const cacheKey = urlStr.replace(/access_token=[^&]+/, 'TOKEN')
  const cached = _getCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < GET_CACHE_TTL) return cached.data

  await rateLimitWait()
  const res = await fetch(urlStr)
  const data = await res.json()
  if (data.error) throw new Error(`BioStack Meta API: ${data.error.message}`)

  _getCache.set(cacheKey, { data, ts: Date.now() })
  if (_getCache.size > 300) {
    const oldest = [..._getCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < 50; i++) _getCache.delete(oldest[i][0])
  }
  return data
}

async function metaPost(path, body = {}) {
  await rateLimitWait()
  const form = new URLSearchParams({ access_token: biostackToken(), ...body })
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form })
  const data = await res.json()
  if (data.error) throw new Error(`BioStack Meta API: ${data.error.message}`)
  // Write succeeded — clear read cache so the dashboard reflects it immediately
  _getCache.clear()
  return data
}

// ── Connection / status ─────────────────────────────────────────────────────

export async function fetchConnectionStatus() {
  const [me, account] = await Promise.all([
    metaGet('/me', { fields: 'id,name' }),
    metaGet(`/${biostackAccountId()}`, {
      fields: 'id,name,account_status,currency,timezone_name,amount_spent,spend_cap,disable_reason'
    })
  ])
  // account_status: 1 = active, 2 = disabled, 3 = unsettled, 7 = pending review, 100 = pending closure
  const statusLabels = { 1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_REVIEW', 8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE', 101: 'CLOSED' }
  return {
    tokenUser: me.name || me.id,
    accountId: account.id,
    accountName: account.name,
    accountStatus: statusLabels[account.account_status] || String(account.account_status),
    currency: account.currency,
    timezone: account.timezone_name,
    lifetimeSpend: account.amount_spent ? Number(account.amount_spent) / 100 : 0,
    disableReason: account.disable_reason || null,
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function fetchCampaigns() {
  // BioStack fetches ALL campaigns on the account — no pinned IDs like GRI
  const data = await metaGet(`/${biostackAccountId()}/campaigns`, {
    fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,objective,created_time',
    limit: '100'
  })
  return data.data || []
}

export async function fetchAdsetsForCampaign(campaignId) {
  const data = await metaGet(`/${campaignId}/adsets`, {
    fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,targeting',
    limit: '100'
  })
  return data.data || []
}

export async function fetchAdsForCampaign(campaignId) {
  const data = await metaGet(`/${campaignId}/ads`, {
    fields: 'id,name,status,effective_status,adset_id,created_time,creative{thumbnail_url}',
    limit: '100'
  })
  return data.data || []
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,actions,action_values,frequency,cpm,ctr,reach'

export async function fetchInsights(objectId, datePreset = 'last_7d') {
  const data = await metaGet(`/${objectId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: normalisePreset(datePreset)
  })
  return parseInsights(data.data?.[0])
}

export async function fetchAccountInsights(datePreset = 'last_7d') {
  return fetchInsights(biostackAccountId(), datePreset)
}

export async function fetchAccountInsightsByDay(days = 14) {
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - days)
  const data = await metaGet(`/${biostackAccountId()}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,cpm,ctr',
    time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }),
    time_increment: '1'
  })
  return (data.data || []).map(parseInsights)
}

/**
 * Full tree: account totals + campaigns with adsets/ads, each with insights.
 */
export async function fetchOverview(datePreset = 'last_7d') {
  const [accountInsights, campaigns] = await Promise.all([
    fetchAccountInsights(datePreset).catch(() => null),
    fetchCampaigns()
  ])

  const enriched = await Promise.all(campaigns.map(async (campaign) => {
    const [insights, adsets, ads] = await Promise.all([
      fetchInsights(campaign.id, datePreset).catch(() => null),
      fetchAdsetsForCampaign(campaign.id).catch(() => []),
      fetchAdsForCampaign(campaign.id).catch(() => [])
    ])

    const adsetResults = await Promise.all(adsets.map(async (adset) => ({
      id: adset.id,
      name: adset.name,
      status: adset.effective_status || adset.status,
      dailyBudget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
      optimizationGoal: adset.optimization_goal || null,
      insights: await fetchInsights(adset.id, datePreset).catch(() => null)
    })))

    const adResults = await Promise.all(ads.map(async (ad) => ({
      id: ad.id,
      name: ad.name,
      status: ad.effective_status || ad.status,
      adsetId: ad.adset_id,
      thumbnailUrl: ad.creative?.thumbnail_url || null,
      insights: await fetchInsights(ad.id, datePreset).catch(() => null)
    })))

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.effective_status || campaign.status,
      objective: campaign.objective,
      dailyBudget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
      insights,
      adsets: adsetResults,
      ads: adResults
    }
  }))

  return { account: accountInsights, campaigns: enriched, fetchedAt: new Date().toISOString() }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function updateObjectStatus(objectId, status) {
  return metaPost(`/${objectId}`, { status })
}

export async function updateObjectBudget(objectId, dailyBudget) {
  return metaPost(`/${objectId}`, { daily_budget: Math.round(dailyBudget * 100) })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseInsights(raw) {
  if (!raw) return null
  const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  const actions = raw.actions || []
  const actionValues = raw.action_values || []
  const purchases = actions.find(a => a.action_type === 'purchase')
  const purchaseValue = actionValues.find(a => a.action_type === 'purchase')
  const checkouts = actions.find(a => a.action_type === 'initiate_checkout')
  const atc = actions.find(a => a.action_type === 'add_to_cart')

  const spend = safeNum(raw.spend)
  const purchaseCount = purchases ? safeNum(purchases.value) : 0
  const purchaseTotal = purchaseValue ? safeNum(purchaseValue.value) : 0

  return {
    spend,
    impressions: safeNum(raw.impressions),
    clicks: safeNum(raw.clicks),
    purchases: purchaseCount,
    purchaseValue: purchaseTotal,
    checkouts: checkouts ? safeNum(checkouts.value) : 0,
    addToCarts: atc ? safeNum(atc.value) : 0,
    frequency: Math.min(safeNum(raw.frequency), 50),
    ctr: Math.min(safeNum(raw.ctr), 100),
    cpm: safeNum(raw.cpm),
    reach: safeNum(raw.reach),
    roas: spend > 0 ? purchaseTotal / spend : 0,
    cpa: purchaseCount > 0 ? spend / purchaseCount : 0,
    date: raw.date_start || null
  }
}

function fmt(d) {
  return d.toISOString().slice(0, 10)
}

function normalisePreset(p) {
  const map = {
    'today': 'today', 'yesterday': 'yesterday',
    '7d': 'last_7d', '14d': 'last_14d', '28d': 'last_28d', '30d': 'last_30d',
    'last_7d': 'last_7d', 'last_14d': 'last_14d', 'last_28d': 'last_28d', 'last_30d': 'last_30d',
    'this_month': 'this_month', 'last_month': 'last_month', 'maximum': 'maximum'
  }
  return map[p] || 'last_7d'
}
