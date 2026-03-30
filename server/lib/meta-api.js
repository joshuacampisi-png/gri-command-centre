/**
 * meta-api.js
 * Meta Marketing API v20.0 wrapper for GRI ad account.
 */
import { env } from './env.js'

const BASE = 'https://graph.facebook.com/v20.0'

function metaToken() {
  return process.env.META_ACCESS_TOKEN || ''
}

function metaAccountId() {
  return process.env.META_AD_ACCOUNT_ID || '' // act_XXXXXXXXX
}

function griCampaignIds() {
  const raw = process.env.META_GRI_CAMPAIGN_IDS || ''
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function isMetaConfigured() {
  return Boolean(metaToken() && metaAccountId())
}

async function metaGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', metaToken())
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

async function metaPost(path, body = {}) {
  const url = `${BASE}${path}`
  const form = new URLSearchParams({ access_token: metaToken(), ...body })
  const res = await fetch(url, { method: 'POST', body: form })
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

// ── Campaign-level data ──────────────────────────────────────────────────────

export async function fetchCampaigns() {
  const accountId = metaAccountId()
  const ids = griCampaignIds()

  if (ids.length > 0) {
    const results = []
    for (const cid of ids) {
      try {
        const data = await metaGet(`/${cid}`, {
          fields: 'id,name,status,daily_budget,lifetime_budget,objective,buying_type'
        })
        results.push(data)
      } catch (e) {
        console.error(`[Meta] Campaign ${cid} fetch error:`, e.message)
      }
    }
    return results
  }

  // Fallback: fetch all campaigns from account
  const data = await metaGet(`/${accountId}/campaigns`, {
    fields: 'id,name,status,daily_budget,lifetime_budget,objective,buying_type',
    limit: '50'
  })
  return data.data || []
}

export async function fetchCampaignInsights(campaignId, datePreset = 'last_7d') {
  const data = await metaGet(`/${campaignId}/insights`, {
    fields: 'campaign_name,spend,impressions,clicks,actions,action_values,frequency,cpm,ctr,reach',
    date_preset: normalisePreset(datePreset)
  })
  return parseInsights(data.data?.[0])
}

// ── Ad-level data ────────────────────────────────────────────────────────────

export async function fetchAdsForCampaign(campaignId, activeOnly = false) {
  const params = {
    fields: 'id,name,status,creative{thumbnail_url,effective_object_story_id},adset_id,created_time',
    limit: '100'
  }
  if (activeOnly) {
    params.effective_status = '["ACTIVE"]'
  }
  const data = await metaGet(`/${campaignId}/ads`, params)
  return data.data || []
}

export async function fetchAdInsights(adId, datePreset = 'last_7d') {
  const data = await metaGet(`/${adId}/insights`, {
    fields: 'impressions,clicks,spend,actions,action_values,frequency,cpm,ctr,reach',
    date_preset: normalisePreset(datePreset)
  })
  return parseInsights(data.data?.[0])
}

export async function fetchAdInsightsByDay(adId, days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const until = new Date()
  const data = await metaGet(`/${adId}/insights`, {
    fields: 'impressions,clicks,spend,actions,action_values,frequency,cpm,ctr',
    time_range: JSON.stringify({
      since: fmt(since),
      until: fmt(until)
    }),
    time_increment: '1'
  })
  return (data.data || []).map(parseInsights)
}

// ── Write operations ─────────────────────────────────────────────────────────

export async function pauseAd(adId) {
  return metaPost(`/${adId}`, { status: 'PAUSED' })
}

export async function uploadAdImage(imageUrl) {
  const accountId = metaAccountId()
  return metaPost(`/${accountId}/adimages`, { url: imageUrl })
}

export async function uploadAdVideo(videoUrl) {
  const accountId = metaAccountId()
  return metaPost(`/${accountId}/advideos`, { file_url: videoUrl })
}

export async function createAdCreative(params) {
  const accountId = metaAccountId()
  return metaPost(`/${accountId}/adcreatives`, params)
}

export async function createAd(params) {
  const accountId = metaAccountId()
  return metaPost(`/${accountId}/ads`, params)
}

// ── Aggregated fetch ─────────────────────────────────────────────────────────

export async function fetchFullPerformance(datePreset = 'last_7d') {
  const campaigns = await fetchCampaigns()

  // Fetch all campaigns in parallel
  const campaignPromises = campaigns.map(async (campaign) => {
    const [cInsights, ads] = await Promise.all([
      fetchCampaignInsights(campaign.id, datePreset).catch(() => null),
      fetchAdsForCampaign(campaign.id, true).catch(() => []) // active only
    ])

    // Fetch ad insights in parallel (skip daily insights for speed)
    const adPromises = ads.map(async (ad) => {
      const insights = await fetchAdInsights(ad.id, datePreset).catch(() => null)
      const createdDate = ad.created_time ? new Date(ad.created_time) : null
      const daysRunning = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / 86400000) : 0

      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        thumbnailUrl: ad.creative?.thumbnail_url || null,
        adsetId: ad.adset_id,
        daysRunning,
        insights,
        dailyInsights: []
      }
    })

    const adResults = await Promise.all(adPromises)

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      dailyBudget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
      objective: campaign.objective,
      insights: cInsights,
      ads: adResults
    }
  })

  const results = await Promise.all(campaignPromises)

  // Aggregate totals across all campaigns
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalPurchases = 0, totalPurchaseValue = 0, totalReach = 0
  for (const c of results) {
    if (c.insights) {
      totalSpend += c.insights.spend || 0
      totalImpressions += c.insights.impressions || 0
      totalClicks += c.insights.clicks || 0
      totalPurchases += c.insights.purchases || 0
      totalPurchaseValue += c.insights.purchaseValue || 0
      totalReach += c.insights.reach || 0
    }
  }

  return {
    campaigns: results,
    totals: {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      purchases: totalPurchases,
      purchaseValue: totalPurchaseValue,
      reach: totalReach,
      roas: totalSpend > 0 ? totalPurchaseValue / totalSpend : 0,
      cpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0,
      cpm: totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseInsights(raw) {
  if (!raw) return null

  const actions = raw.actions || []
  const actionValues = raw.action_values || []

  const purchases = actions.find(a => a.action_type === 'purchase')
  const purchaseValue = actionValues.find(a => a.action_type === 'purchase')

  const spend = Number(raw.spend || 0)
  const impressions = Number(raw.impressions || 0)
  const clicks = Number(raw.clicks || 0)
  const purchaseCount = purchases ? Number(purchases.value) : 0
  const purchaseTotal = purchaseValue ? Number(purchaseValue.value) : 0

  return {
    spend,
    impressions,
    clicks,
    purchases: purchaseCount,
    purchaseValue: purchaseTotal,
    frequency: Number(raw.frequency || 0),
    ctr: Number(raw.ctr || 0),
    cpm: Number(raw.cpm || 0),
    reach: Number(raw.reach || 0),
    roas: spend > 0 ? purchaseTotal / spend : 0,
    cpa: purchaseCount > 0 ? spend / purchaseCount : 0,
    date: raw.date_start || null
  }
}

function fmt(d) {
  return d.toISOString().slice(0, 10)
}

// Map short date presets to Meta API format
function normalisePreset(p) {
  const map = {
    'today': 'today',
    'yesterday': 'yesterday',
    '7d': 'last_7d',
    '14d': 'last_14d',
    '28d': 'last_28d',
    '30d': 'last_30d',
    'last_7d': 'last_7d',
    'last_14d': 'last_14d',
    'last_28d': 'last_28d',
    'last_30d': 'last_30d',
    'this_month': 'this_month',
    'last_month': 'last_month'
  }
  return map[p] || 'last_7d'
}
