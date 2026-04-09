/**
 * meta-api.js
 * Meta Marketing API v20.0 wrapper for GRI ad account.
 */
import { env } from './env.js'

const BASE = 'https://graph.facebook.com/v20.0'

// Hardcoded GRI Meta Ads credentials (env vars override if set)
const HARDCODED_META_TOKEN = 'EAF4DTuDsScIBRDGwBkMZBGc33r7ZCTHmNhCoxLgvu3AZCZBZCmkYYZCJJSMi3e3iMhPvPp9buZA5LaP8SWDCy801MP5OsUSui7ObNpmZCGNv8Kh7hiqTPpi9aiZCSpXZAbSZC8CyKeafA5Tj69WwNlLEn0DnCNiYQpMzBetjs1KGtZAlvxNHIIBa1u46l3ZAZBqhlPqIuB31LQZCAkULAZDZD'
const HARDCODED_AD_ACCOUNT_ID = 'act_1519116685663528'
const HARDCODED_CAMPAIGN_IDS = [
  '120233436381360711',  // GRI - Local (TNT Hire)
  '120226215760060711',  // GRI - Advantage+ Catalogue (Testing)
  '120216057846380711',  // GRI - AUS Wide [Broad Targeting]
]

export function metaToken() {
  // Hardcoded token takes priority — env var is a fallback only
  return HARDCODED_META_TOKEN || process.env.META_ACCESS_TOKEN
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

  console.log(`[Meta] fetchCampaigns called. Account: ${accountId}, Campaign IDs: ${ids.length}`)

  if (ids.length > 0) {
    // Batch fetch: single API call using ?ids= parameter instead of N separate calls
    try {
      const url = new URL(`${BASE}/`)
      url.searchParams.set('access_token', metaToken())
      url.searchParams.set('ids', ids.join(','))
      url.searchParams.set('fields', 'id,name,status,daily_budget,lifetime_budget,objective,buying_type')
      const res = await fetch(url.toString())
      const data = await res.json()
      if (data.error) throw new Error(`Meta API: ${data.error.message}`)
      // Batch returns { id1: {...}, id2: {...} } — convert to array
      const results = Object.values(data)
      console.log(`[Meta] fetchCampaigns batch: ${results.length} campaigns in 1 API call`)
      return results
    } catch (e) {
      console.error(`[Meta] Batch campaign fetch failed, falling back to individual:`, e.message)
      // Fallback to individual fetches
      const results = []
      for (const cid of ids) {
        try {
          const data = await metaGet(`/${cid}`, {
            fields: 'id,name,status,daily_budget,lifetime_budget,objective,buying_type'
          })
          results.push(data)
        } catch (err) {
          console.error(`[Meta] Campaign ${cid} fetch error:`, err.message)
        }
      }
      return results
    }
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

/**
 * Fetch full creative spec for an ad — reveals whether it's image or video,
 * the actual media dimensions, and the copy used.
 */
export async function fetchAdCreativeSpec(adId) {
  const ad = await metaGet(`/${adId}`, {
    fields: 'creative{id,name,object_story_spec,thumbnail_url,image_url,video_id}'
  })
  const c = ad.creative || {}
  const spec = c.object_story_spec || {}
  const linkData = spec.link_data || {}
  const videoData = spec.video_data || {}

  return {
    creativeId: c.id || null,
    thumbnailUrl: c.thumbnail_url || null,
    isVideo: Boolean(videoData.video_id || c.video_id),
    isImage: Boolean(linkData.image_hash || linkData.image_url || c.image_url),
    videoId: videoData.video_id || c.video_id || null,
    imageUrl: linkData.image_url || c.image_url || null,
    message: linkData.message || videoData.message || '',
    headline: linkData.name || videoData.title || '',
    description: linkData.description || '',
    pageId: spec.page_id || '',
    link: linkData.link || videoData.call_to_action?.value?.link || '',
  }
}

/**
 * Detect if a URL is a video based on extension.
 */
export function isVideoUrl(url) {
  if (!url) return false
  const lower = url.toLowerCase()
  return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/.test(lower)
}

/**
 * Create an ad creative with proper handling for both image and video URLs.
 * Detects URL type, uploads video if needed, builds correct spec.
 */
export async function createAdCreativeFromUrl({ name, primaryText, headline, description, mediaUrl, pageId }) {
  const pid = pageId || '105089549192262'

  // No media — link ad with copy only
  if (!mediaUrl || !mediaUrl.trim()) {
    return createAdCreative({
      name,
      object_story_spec: JSON.stringify({
        page_id: pid,
        link_data: {
          message: primaryText || '',
          name: headline || '',
          description: description || '',
          link: 'https://genderrevealideas.com.au',
          call_to_action: { type: 'SHOP_NOW' }
        }
      })
    })
  }

  const url = mediaUrl.trim()

  // Video URL — upload first, then create video creative
  if (isVideoUrl(url)) {
    const videoResult = await uploadAdVideo(url)
    const videoId = videoResult.id || videoResult.video_id
    if (!videoId) throw new Error('Video upload failed — no video ID returned from Meta')

    return createAdCreative({
      name,
      object_story_spec: JSON.stringify({
        page_id: pid,
        video_data: {
          video_id: videoId,
          message: primaryText || '',
          title: headline || '',
          link_description: description || '',
          call_to_action: { type: 'SHOP_NOW', value: { link: 'https://genderrevealideas.com.au' } }
        }
      })
    })
  }

  // Image URL — standard link_data creative
  return createAdCreative({
    name,
    object_story_spec: JSON.stringify({
      page_id: pid,
      link_data: {
        message: primaryText || '',
        name: headline || '',
        description: description || '',
        link: 'https://genderrevealideas.com.au',
        image_url: url,
        call_to_action: { type: 'SHOP_NOW' }
      }
    })
  })
}

export async function createAdCreative(params) {
  const accountId = metaAccountId()
  return metaPost(`/${accountId}/adcreatives`, params)
}

export async function createAd(params) {
  const accountId = metaAccountId()
  return metaPost(`/${accountId}/ads`, params)
}

/**
 * Duplicate an ad: reads the original ad's creative + adset, creates a copy in PAUSED state.
 * Optionally override the target adset.
 */
export async function duplicateAd(sourceAdId, { targetAdSetId, newName } = {}) {
  // 1. Read the source ad
  const source = await metaGet(`/${sourceAdId}`, {
    fields: 'name,adset_id,creative{id},status'
  })
  if (!source.id) throw new Error(`Could not read source ad ${sourceAdId}`)

  const accountId = metaAccountId()
  const adsetId = targetAdSetId || source.adset_id
  const name = newName || `${source.name} [Copy]`

  // 2. Create the duplicate (reuses same creative)
  return metaPost(`/${accountId}/ads`, {
    name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: source.creative?.id }),
    status: 'PAUSED'
  })
}

/**
 * Duplicate an ad set: reads the original adset's config, creates a copy in PAUSED state.
 * Optionally override budget, name, or campaign.
 */
export async function duplicateAdSet(sourceAdSetId, { targetCampaignId, newName, dailyBudget } = {}) {
  // 1. Read the source ad set
  const source = await metaGet(`/${sourceAdSetId}`, {
    fields: 'name,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,promoted_object,bid_amount,bid_strategy,status'
  })
  if (!source.id) throw new Error(`Could not read source ad set ${sourceAdSetId}`)

  const accountId = metaAccountId()
  const campaignId = targetCampaignId || source.campaign_id
  const name = newName || `${source.name} [Copy]`
  const budget = dailyBudget ? Math.round(dailyBudget * 100) : source.daily_budget

  const params = {
    name,
    campaign_id: campaignId,
    optimization_goal: source.optimization_goal || 'OFFSITE_CONVERSIONS',
    billing_event: source.billing_event || 'IMPRESSIONS',
    status: 'PAUSED'
  }

  if (budget) params.daily_budget = String(budget)
  if (source.targeting) params.targeting = JSON.stringify(source.targeting)
  if (source.promoted_object) params.promoted_object = JSON.stringify(source.promoted_object)
  if (source.bid_amount) params.bid_amount = source.bid_amount
  if (source.bid_strategy) params.bid_strategy = source.bid_strategy

  return metaPost(`/${accountId}/adsets`, params)
}

/**
 * Update an existing ad's creative (swap creative on a live ad).
 */
export async function updateAdCreative(adId, creativeId) {
  return metaPost(`/${adId}`, {
    creative: JSON.stringify({ creative_id: creativeId })
  })
}

// ── Audience Creation ───────────────────────────────────────────────────────

const GRI_PIXEL_ID = '810404797873042'

/**
 * Create a website custom audience from pixel events.
 * @param {string} name - Audience name
 * @param {string} eventType - Pixel event: PageView, ViewContent, AddToCart, Purchase
 * @param {number} retentionDays - Lookback window in days
 * @param {object} [options] - Optional filters
 * @returns {{ id: string }} - New audience ID
 */
export async function createWebsiteAudience(name, eventType, retentionDays, options = {}) {
  const accountId = metaAccountId()
  const pixelId = options.pixelId || GRI_PIXEL_ID
  const retentionSeconds = retentionDays * 86400

  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: [{ id: pixelId, type: 'pixel' }],
        retention_seconds: retentionSeconds,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: eventType }]
        }
      }]
    }
  }

  // Add exclusion if specified (e.g. exclude purchasers)
  if (options.excludeEvent) {
    rule.exclusions = {
      operator: 'or',
      rules: [{
        event_sources: [{ id: pixelId, type: 'pixel' }],
        retention_seconds: options.excludeRetentionDays ? options.excludeRetentionDays * 86400 : retentionSeconds,
        filter: {
          operator: 'and',
          filters: [{ field: 'event', operator: 'eq', value: options.excludeEvent }]
        }
      }]
    }
  }

  const url = `${BASE}/${accountId}/customaudiences`
  const body = new URLSearchParams({
    access_token: metaToken(),
    name,
    rule: JSON.stringify(rule),
    prefill: 'true',
    customer_file_source: 'USER_PROVIDED_ONLY',
  })
  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json()
  if (data.error) throw new Error(`Meta API (audience): ${data.error.message}`)
  return data
}

/**
 * Create a lookalike audience from a source custom audience.
 * @param {string} name - Audience name
 * @param {string} sourceAudienceId - Source custom audience ID
 * @param {string} country - Country code (AU)
 * @param {number} ratio - Lookalike percentage (0.01 to 0.20 = 1% to 20%)
 * @returns {{ id: string }}
 */
export async function createLookalikeAudience(name, sourceAudienceId, country = 'AU', ratio = 0.02) {
  const accountId = metaAccountId()
  const url = `${BASE}/${accountId}/customaudiences`
  const body = new URLSearchParams({
    access_token: metaToken(),
    name,
    subtype: 'LOOKALIKE',
    origin_audience_id: sourceAudienceId,
    lookalike_spec: JSON.stringify({
      type: 'custom_ratio',
      ratio,
      country,
    }),
  })
  const res = await fetch(url, { method: 'POST', body })
  const data = await res.json()
  if (data.error) throw new Error(`Meta API (lookalike): ${data.error.message}`)
  return data
}

/**
 * List all custom audiences on the account.
 */
export async function listAudiences() {
  const accountId = metaAccountId()
  const data = await metaGet(`/${accountId}/customaudiences`, {
    fields: 'id,name,subtype,delivery_status',
    limit: '100',
  })
  return data.data || []
}

/**
 * Full audience refresh: creates a replacement set of audiences when the old ones are saturated.
 * Creates: Website visitors (7d, 14d, 30d), ATC (7d, 30d), Purchasers (30d, 90d), Lookalikes (1%, 2%)
 * @returns {Array} Created audiences
 */
export async function createFreshAudienceSet() {
  const results = []
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  try {
    // Retargeting audiences
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: Visitors 7d [${ts}]`, 'PageView', 7) })
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: Visitors 14d [${ts}]`, 'PageView', 14) })
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: Visitors 30d no purchase [${ts}]`, 'PageView', 30, { excludeEvent: 'Purchase', excludeRetentionDays: 30 }) })
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: ATC 7d [${ts}]`, 'AddToCart', 7) })
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: ATC 30d [${ts}]`, 'AddToCart', 30) })
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: Purchasers 30d [${ts}]`, 'Purchase', 30) })
    results.push({ type: 'website', ...await createWebsiteAudience(`Flywheel: Purchasers 90d [${ts}]`, 'Purchase', 90) })

    // Lookalikes from purchasers (need the purchaser audience ID)
    const purchaser90 = results.find(r => r.type === 'website' && r.id)
    if (purchaser90) {
      try {
        results.push({ type: 'lookalike', ...await createLookalikeAudience(`Flywheel: LAL 1% Purchasers [${ts}]`, purchaser90.id, 'AU', 0.01) })
      } catch (e) { results.push({ type: 'lookalike', error: e.message }) }
      try {
        results.push({ type: 'lookalike', ...await createLookalikeAudience(`Flywheel: LAL 2% Purchasers [${ts}]`, purchaser90.id, 'AU', 0.02) })
      } catch (e) { results.push({ type: 'lookalike', error: e.message }) }
    }
  } catch (e) {
    console.error('[Meta API] Audience creation error:', e.message)
    results.push({ error: e.message })
  }

  return results
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

// ── Multi-window insights (3d, 5d, 7d comparison) ──────────────────────────

function dateRange(days) {
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - days)
  return JSON.stringify({ since: fmt(since), until: fmt(until) })
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,actions,action_values,frequency,cpm,ctr,reach'

/**
 * Fetch campaign → adset → ad tree with insights for a specific day range.
 */
export async function fetchCampaignInsightsRange(campaignId, days) {
  const data = await metaGet(`/${campaignId}/insights`, {
    fields: 'campaign_name,' + INSIGHT_FIELDS,
    time_range: dateRange(days)
  })
  return parseInsights(data.data?.[0])
}

export async function fetchAdSetInsightsRange(adSetId, days) {
  const data = await metaGet(`/${adSetId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: dateRange(days)
  })
  return parseInsights(data.data?.[0])
}

export async function fetchAdInsightsRange(adId, days) {
  const data = await metaGet(`/${adId}/insights`, {
    fields: INSIGHT_FIELDS,
    time_range: dateRange(days)
  })
  return parseInsights(data.data?.[0])
}

/**
 * Fetch full performance tree for multiple windows (3d, 5d, 7d) in parallel.
 * Returns { campaigns: [{ id, name, status, windows: { '3d': insights, '5d': insights, '7d': insights }, adsets: [...], ads: [...] }] }
 */
export async function fetchMultiWindowPerformance() {
  const windows = [3, 5, 7]
  const campaigns = await fetchCampaigns()

  const enriched = await Promise.all(campaigns.map(async (campaign) => {
    // Fetch campaign-level insights for all windows
    const [w3, w5, w7] = await Promise.all(
      windows.map(d => fetchCampaignInsightsRange(campaign.id, d).catch(() => null))
    )

    // Fetch adsets + ads
    const [adsets, ads] = await Promise.all([
      fetchAdsetsForCampaign(campaign.id).catch(() => []),
      fetchAdsForCampaign(campaign.id).catch(() => [])
    ])

    // Adset insights for all windows in parallel
    const enrichedAdsets = await Promise.all(adsets.map(async (adset) => {
      const [as3, as5, as7] = await Promise.all(
        windows.map(d => fetchAdSetInsightsRange(adset.id, d).catch(() => null))
      )
      return {
        id: adset.id,
        name: adset.name,
        status: adset.status,
        dailyBudget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
        windows: { '3d': as3, '5d': as5, '7d': as7 }
      }
    }))

    // Ad insights for all windows + daily breakdown for fatigue
    const enrichedAds = await Promise.all(ads.map(async (ad) => {
      const [ad3, ad5, ad7, daily] = await Promise.all([
        ...windows.map(d => fetchAdInsightsRange(ad.id, d).catch(() => null)),
        fetchAdInsightsByDay(ad.id, 14).catch(() => [])
      ])
      const createdDate = ad.created_time ? new Date(ad.created_time) : null
      const daysRunning = createdDate ? Math.floor((Date.now() - createdDate.getTime()) / 86400000) : 0

      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        adsetId: ad.adset_id,
        thumbnailUrl: ad.creative?.thumbnail_url || null,
        daysRunning,
        windows: { '3d': ad3, '5d': ad5, '7d': ad7 },
        dailyInsights: daily
      }
    }))

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      dailyBudget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
      objective: campaign.objective,
      windows: { '3d': w3, '5d': w5, '7d': w7 },
      adsets: enrichedAdsets,
      ads: enrichedAds
    }
  }))

  return { campaigns: enriched, fetchedAt: new Date().toISOString() }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseInsights(raw) {
  if (!raw) return null

  const actions = raw.actions || []
  const actionValues = raw.action_values || []

  const purchases = actions.find(a => a.action_type === 'purchase')
  const purchaseValue = actionValues.find(a => a.action_type === 'purchase')

  // Bug 7 fix: log if actions array exists but has no purchase event (potential pixel issue)
  if (actions.length > 0 && !purchases) {
    const actionTypes = actions.map(a => a.action_type).join(', ')
    console.warn(`[Meta API] No 'purchase' action in insights. Available: ${actionTypes}`)
  }

  // Bug 6 fix: parseFloat + isNaN guard on all numeric fields (handles "1.86%"-style strings)
  const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

  const spend = safeNum(raw.spend)
  const impressions = safeNum(raw.impressions)
  const clicks = safeNum(raw.clicks)
  const purchaseCount = purchases ? safeNum(purchases.value) : 0
  const purchaseTotal = purchaseValue ? safeNum(purchaseValue.value) : 0

  // Bug 5 fix: CTR from Meta is already a percentage (e.g., 1.86 = 1.86%).
  // Cap at 100 to prevent impossible values. Frequency cannot exceed ~50 realistically.
  const ctr = Math.min(safeNum(raw.ctr), 100)
  const frequency = Math.min(safeNum(raw.frequency), 50)
  const cpm = safeNum(raw.cpm)

  return {
    spend,
    impressions,
    clicks,
    purchases: purchaseCount,
    purchaseValue: purchaseTotal,
    frequency,
    ctr,
    cpm,
    reach: safeNum(raw.reach),
    // Bug 4 fix: always return 0, never null/NaN
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
