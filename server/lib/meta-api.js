/**
 * meta-api.js
 * Meta Marketing API v20.0 wrapper for GRI ad account.
 */
import { env } from './env.js'

const BASE = 'https://graph.facebook.com/v20.0'

// Hardcoded GRI Meta Ads credentials (env vars override if set)
const HARDCODED_META_TOKEN = 'EAF4DTuDsScIBRGL36ml9CT7QsG3K5ZB4CdKkZC7n8DB7SmwrGy7nAN6iYO3uBYIKmKkVVHwognPG6Ro4DofWNffZCg4ZCsM3s2IJhqYI2CD57Pq1mE3F0X3HPAZCqr4MvYhWl2j6ZClnEojxdrZAjp5Y9KB54aVAaL6tp9HKgZAUW1MrGPz2x8HtK14GaICHIGiftuf57bEcQnWyxBcUIDsb6EOU5clxEQYU8XW5P7OEd7quvQZDZD'
const HARDCODED_AD_ACCOUNT_ID = 'act_1519116685663528'
const HARDCODED_CAMPAIGN_IDS = [
  '120233436381360711',  // GRI - Local (TNT Hire)
  '120226215760060711',  // GRI - Advantage+ Catalogue (Testing)
  '120216057846380711',  // GRI - AUS Wide [Broad Targeting]
]

function metaToken() {
  return process.env.META_ACCESS_TOKEN || HARDCODED_META_TOKEN
}

function metaAccountId() {
  return process.env.META_AD_ACCOUNT_ID || HARDCODED_AD_ACCOUNT_ID
}

function griCampaignIds() {
  const raw = process.env.META_GRI_CAMPAIGN_IDS || ''
  const envIds = raw.split(',').map(s => s.trim()).filter(Boolean)
  return envIds.length > 0 ? envIds : HARDCODED_CAMPAIGN_IDS
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

  console.log(`[Meta] fetchCampaigns called. Account: ${accountId}, Campaign IDs: ${ids.length > 0 ? ids.join(',') : 'NONE (will use account fallback)'}, Token starts: ${metaToken().slice(0, 15)}...`)

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
    console.log(`[Meta] fetchCampaigns returning ${results.length} campaigns`)
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

// ── Adset-level data (audiences + targeting) ────────────────────────────────

export async function fetchAdsetsForCampaign(campaignId, activeOnly = false) {
  const params = {
    fields: 'id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,promoted_object',
    limit: '100'
  }
  if (activeOnly) {
    params.effective_status = '["ACTIVE"]'
  }
  const data = await metaGet(`/${campaignId}/adsets`, params)
  return data.data || []
}

export async function fetchAdsetInsights(adsetId, datePreset = 'last_7d') {
  const data = await metaGet(`/${adsetId}/insights`, {
    fields: 'impressions,clicks,spend,actions,action_values,frequency,cpm,ctr,reach',
    date_preset: normalisePreset(datePreset)
  })
  return parseInsights(data.data?.[0])
}

function parseTargeting(targeting) {
  if (!targeting) return null
  return {
    ageMin: targeting.age_min || null,
    ageMax: targeting.age_max || null,
    genders: targeting.genders || [],
    geoLocations: targeting.geo_locations || null,
    interests: (targeting.flexible_spec || []).flatMap(s => (s.interests || []).map(i => i.name)),
    customAudiences: (targeting.custom_audiences || []).map(a => ({ id: a.id, name: a.name })),
    excludedCustomAudiences: (targeting.excluded_custom_audiences || []).map(a => ({ id: a.id, name: a.name })),
    lookalikes: (targeting.custom_audiences || []).filter(a => a.subtype === 'LOOKALIKE').map(a => a.name),
    placements: targeting.publisher_platforms || [],
    devicePlatforms: targeting.device_platforms || []
  }
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

// ── Lightweight account-level insights (single API call) ────────────────

export async function fetchAccountInsights(datePreset = 'today') {
  const accountId = metaAccountId()
  const data = await metaGet(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,action_values,frequency,cpm,ctr,reach',
    date_preset: normalisePreset(datePreset)
  })
  return parseInsights(data.data?.[0])
}

// ── Write operations ─────────────────────────────────────────────────────────

export async function pauseAd(adId) {
  return metaPost(`/${adId}`, { status: 'PAUSED' })
}

// Toggle campaign status (ACTIVE / PAUSED)
export async function updateCampaignStatus(campaignId, status) {
  return metaPost(`/${campaignId}`, { status })
}

// Update campaign daily budget (amount in dollars, converted to cents for Meta API)
export async function updateCampaignBudget(campaignId, dailyBudget) {
  return metaPost(`/${campaignId}`, { daily_budget: Math.round(dailyBudget * 100) })
}

// Toggle ad set status (ACTIVE / PAUSED)
export async function updateAdSetStatus(adSetId, status) {
  return metaPost(`/${adSetId}`, { status })
}

// Update ad set daily budget (amount in dollars, converted to cents for Meta API)
export async function updateAdSetBudget(adSetId, dailyBudget) {
  return metaPost(`/${adSetId}`, { daily_budget: Math.round(dailyBudget * 100) })
}

// Toggle ad status (ACTIVE / PAUSED)
export async function updateAdStatus(adId, status) {
  return metaPost(`/${adId}`, { status })
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
    const [cInsights, ads, adsets] = await Promise.all([
      fetchCampaignInsights(campaign.id, datePreset).catch(() => null),
      fetchAdsForCampaign(campaign.id, true).catch(() => []),
      fetchAdsetsForCampaign(campaign.id, true).catch(() => [])
    ])

    // Fetch adset insights in parallel
    const adsetMap = new Map()
    const adsetPromises = adsets.map(async (adset) => {
      const insights = await fetchAdsetInsights(adset.id, datePreset).catch(() => null)
      const parsed = {
        id: adset.id,
        name: adset.name,
        status: adset.status,
        dailyBudget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
        lifetimeBudget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
        optimizationGoal: adset.optimization_goal || null,
        targeting: parseTargeting(adset.targeting),
        insights
      }
      adsetMap.set(adset.id, parsed)
      return parsed
    })
    const adsetResults = await Promise.all(adsetPromises)

    // Fetch ad insights + daily insights (for active ads) in parallel
    const adPromises = ads.map(async (ad) => {
      const isActive = ad.status === 'ACTIVE'
      const [insights, dailyInsights] = await Promise.all([
        fetchAdInsights(ad.id, datePreset).catch(() => null),
        isActive ? fetchAdInsightsByDay(ad.id, 7).catch(() => []) : Promise.resolve([])
      ])
      const createdDate = ad.created_time ? new Date(ad.created_time) : null
      const daysRunning = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / 86400000) : 0

      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        thumbnailUrl: ad.creative?.thumbnail_url || null,
        adsetId: ad.adset_id,
        adsetName: adsetMap.get(ad.adset_id)?.name || null,
        targeting: adsetMap.get(ad.adset_id)?.targeting || null,
        daysRunning,
        insights,
        dailyInsights
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
      adsets: adsetResults,
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
