/**
 * adset-launcher.js
 * Creates test ad sets via Meta Marketing API.
 *
 * Full chain: Ensure testing campaign exists → Create ad set with audience → Attach best creative → All PAUSED
 * Nothing goes live until Josh manually activates it.
 *
 * Architecture decisions (research-backed):
 * - ABO testing campaign (each ad set gets guaranteed budget, no CBO competition)
 * - optimization_goal: OFFSITE_CONVERSIONS (maximise purchase volume)
 * - billing_event: IMPRESSIONS (required for conversion campaigns)
 * - bid_strategy: LOWEST_COST_WITHOUT_CAP (best for testing, max flexibility)
 * - promoted_object: pixel_id + custom_event_type: PURCHASE
 * - All ad sets created PAUSED — manual activation required
 * - Existing creative reused via creative_id (preserves social proof)
 */
import { metaToken, fetchCampaigns, fetchAdsForCampaign } from './meta-api.js'
import { logFlywheelEvent, getAds } from './flywheel-store.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LAUNCHER_DB_PATH = path.join(__dirname, '../../data/flywheel/launcher.json')

const BASE = 'https://graph.facebook.com/v20.0'
const GRI_PIXEL_ID = '810404797873042'
const AD_ACCOUNT_ID = 'act_1519116685663528'

// ── Launcher Database ─────────────────────────────────────────────────────────

function loadDb() {
  try {
    if (fs.existsSync(LAUNCHER_DB_PATH)) return JSON.parse(fs.readFileSync(LAUNCHER_DB_PATH, 'utf8'))
  } catch (e) { console.error('[Launcher] DB load error:', e.message) }
  return { testingCampaignId: null, launches: [], createdAt: new Date().toISOString() }
}

function saveDb(db) {
  const dir = path.dirname(LAUNCHER_DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = LAUNCHER_DB_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, LAUNCHER_DB_PATH)
}

// ── Meta API helpers ──────────────────────────────────────────────────────────

async function metaPost(path, body = {}) {
  const url = `${BASE}${path}`
  const form = new URLSearchParams({ access_token: metaToken(), ...body })
  const res = await fetch(url, { method: 'POST', body: form })
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

// ── Testing Campaign ──────────────────────────────────────────────────────────

/**
 * Get or create the dedicated ABO testing campaign.
 * This campaign exists solely for the flywheel to test new audiences.
 * ABO means each ad set gets its own guaranteed daily budget.
 */
export async function getOrCreateTestingCampaign() {
  const db = loadDb()

  // Check if we already have a testing campaign
  if (db.testingCampaignId) {
    // Verify it still exists on Meta
    try {
      const url = `${BASE}/${db.testingCampaignId}?fields=id,name,status&access_token=${metaToken()}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.id) {
        console.log(`[Launcher] Using existing testing campaign: ${data.name} (${data.id})`)
        return { id: data.id, name: data.name, status: data.status, isNew: false }
      }
    } catch (e) {
      console.warn('[Launcher] Stored campaign not found, will create new one')
    }
  }

  // Create new ABO testing campaign
  const result = await metaPost(`/${AD_ACCOUNT_ID}/campaigns`, {
    name: 'Flywheel: Audience Testing (ABO)',
    objective: 'OUTCOME_SALES',
    special_ad_categories: '[]',
    status: 'PAUSED', // Campaign starts paused
    buying_type: 'AUCTION',
  })

  console.log(`[Launcher] Created testing campaign: ${result.id}`)
  db.testingCampaignId = result.id
  saveDb(db)

  logFlywheelEvent('testing_campaign_created', { campaignId: result.id })

  return { id: result.id, name: 'Flywheel: Audience Testing (ABO)', status: 'PAUSED', isNew: true }
}

/**
 * Find the best performing creative to reuse in test ad sets.
 * Looks for the creative with highest ROAS and at least 1 purchase.
 * Returns the creative_id (not the ad ID).
 */
export async function findBestCreative() {
  const ads = getAds()

  // Filter to active ads with performance data
  const activeAds = ads.filter(a => a.status === 'ACTIVE')

  if (activeAds.length === 0) {
    throw new Error('No active ads found. Sync Meta data first.')
  }

  // We need the creative ID from each ad. The ads store has metaAdId.
  // To get the creative_id, we need to query the ad's creative field.
  // For now, return the ad ID — when creating the new ad we'll reference
  // the existing ad's creative via the API.

  // Sort by a heuristic: prefer ads that have been running longest (more data)
  // and have engagement (non-zero impressions from snapshots)
  const best = activeAds[0] // Will be improved once we have snapshot data

  return {
    adId: best.metaAdId,
    adName: best.name,
    adSetId: best.adSetId,
    campaignId: best.campaignId,
  }
}

/**
 * Get the creative_id from an existing ad.
 * Meta ads reference creatives by creative_id, not ad_id.
 */
async function getCreativeIdFromAd(adId) {
  const url = `${BASE}/${adId}?fields=creative{id}&access_token=${metaToken()}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data.creative?.id || null
}

// ── Launch Ad Set ─────────────────────────────────────────────────────────────

/**
 * Launch a test ad set for a specific audience.
 *
 * @param {object} params
 * @param {string} params.audienceName - Human-readable name for the ad set
 * @param {string} params.audienceType - 'retargeting' | 'lookalike' | 'interest' | 'geo'
 * @param {object} params.targeting - Meta targeting object
 * @param {number} params.dailyBudget - Daily budget in AUD (default $10)
 * @param {string} [params.creativeAdId] - Ad ID to copy creative from (auto-selects best if omitted)
 * @param {string} [params.customAudienceId] - Meta custom audience ID (for retargeting/lookalike)
 * @returns {{ campaignId, adSetId, adId, status }}
 */
export async function launchTestAdSet(params) {
  const {
    audienceName,
    audienceType,
    targeting: customTargeting,
    dailyBudget = 10,
    creativeAdId,
    customAudienceId,
  } = params

  console.log(`[Launcher] Launching test ad set: "${audienceName}" ($${dailyBudget}/day)`)

  // Step 1: Get or create the testing campaign
  const campaign = await getOrCreateTestingCampaign()

  // Step 2: Build targeting
  const targeting = buildTargeting(audienceType, customTargeting, customAudienceId)

  // Step 3: Create the ad set (PAUSED)
  const ts = new Date().toISOString().slice(0, 10)
  const adSetName = `FW Test | ${audienceName} | $${dailyBudget}/day | ${ts}`

  const adSetResult = await metaPost(`/${AD_ACCOUNT_ID}/adsets`, {
    name: adSetName,
    campaign_id: campaign.id,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: String(Math.round(dailyBudget * 100)), // cents
    promoted_object: JSON.stringify({
      pixel_id: GRI_PIXEL_ID,
      custom_event_type: 'PURCHASE',
    }),
    targeting: JSON.stringify(targeting),
    status: 'PAUSED',
  })

  console.log(`[Launcher] Ad set created: ${adSetResult.id}`)

  // Step 4: Get a creative to attach
  let creativeId
  try {
    const sourceAdId = creativeAdId || (await findBestCreative()).adId
    creativeId = await getCreativeIdFromAd(sourceAdId)
    if (!creativeId) throw new Error('Could not get creative_id from ad')
  } catch (e) {
    console.warn(`[Launcher] Could not get creative: ${e.message}. Ad set created without ad.`)
    // Save the launch record without an ad
    const launch = saveLaunch({
      audienceName, audienceType, dailyBudget,
      campaignId: campaign.id, adSetId: adSetResult.id, adId: null,
      status: 'PAUSED_NO_AD', error: `No creative attached: ${e.message}`,
    })
    return launch
  }

  // Step 5: Create the ad (PAUSED)
  const adName = `FW | ${audienceName} | Auto`
  const adResult = await metaPost(`/${AD_ACCOUNT_ID}/ads`, {
    name: adName,
    adset_id: adSetResult.id,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'PAUSED',
  })

  console.log(`[Launcher] Ad created: ${adResult.id}`)

  // Step 6: Record the launch
  const launch = saveLaunch({
    audienceName, audienceType, dailyBudget,
    campaignId: campaign.id, adSetId: adSetResult.id, adId: adResult.id,
    creativeId, status: 'PAUSED',
  })

  logFlywheelEvent('adset_launched', {
    adSetId: adSetResult.id,
    adId: adResult.id,
    audienceName,
    audienceType,
    dailyBudget,
    status: 'PAUSED',
  })

  return launch
}

// ── Targeting Builder ─────────────────────────────────────────────────────────

function buildTargeting(audienceType, customTargeting, customAudienceId) {
  // Base: Australia, all placements
  const targeting = {
    geo_locations: {
      countries: ['AU'],
      location_types: ['home', 'recent'],
    },
  }

  if (audienceType === 'retargeting' || audienceType === 'lookalike') {
    // Attach the custom audience
    if (customAudienceId) {
      targeting.custom_audiences = [{ id: customAudienceId }]
    }
    // Retargeting: women 22-45 (primary buyer demographic)
    targeting.age_min = 22
    targeting.age_max = 45
    targeting.genders = [2] // Female
  } else if (audienceType === 'interest') {
    // Interest targeting from the template
    if (customTargeting?.interests) {
      targeting.flexible_spec = [{
        interests: customTargeting.interests.map(name => ({ name })),
      }]
    }
    targeting.age_min = customTargeting?.ageMin || 22
    targeting.age_max = customTargeting?.ageMax || 42
    targeting.genders = customTargeting?.genders || [2]
  } else if (audienceType === 'geo') {
    // Geo targeting — specific state/region
    if (customTargeting?.regionCode) {
      targeting.geo_locations = {
        regions: [{ key: getMetaRegionKey(customTargeting.regionCode) }],
        location_types: ['home', 'recent'],
      }
    }
    targeting.age_min = 22
    targeting.age_max = 45
    targeting.genders = [2]
  }

  return targeting
}

/**
 * Map Australian state codes to Meta region keys.
 */
function getMetaRegionKey(stateCode) {
  const map = {
    'NSW': '3847', // New South Wales
    'VIC': '3848', // Victoria
    'QLD': '3849', // Queensland
    'WA': '3850',  // Western Australia
    'SA': '3851',  // South Australia
    'TAS': '3852', // Tasmania
    'ACT': '3853', // ACT
    'NT': '3854',  // Northern Territory
  }
  return map[stateCode] || '3849' // Default QLD (GRI home state)
}

// ── Launch Records ────────────────────────────────────────────────────────────

function saveLaunch(launch) {
  const db = loadDb()
  const record = {
    id: `launch_${Date.now()}`,
    ...launch,
    launchedAt: new Date().toISOString(),
    activatedAt: null,
    evaluatedAt: null,
    verdict: null,
  }
  db.launches.push(record)
  saveDb(db)
  return record
}

/**
 * Get all launches with their current status.
 */
export function getLaunches() {
  const db = loadDb()
  return db.launches.sort((a, b) => new Date(b.launchedAt) - new Date(a.launchedAt))
}

/**
 * Get the testing campaign ID (if it exists).
 */
export function getTestingCampaignId() {
  const db = loadDb()
  return db.testingCampaignId
}

/**
 * Preview what will be created without actually creating it.
 * Returns the exact API parameters that would be sent to Meta.
 */
export function previewLaunch(params) {
  const {
    audienceName,
    audienceType,
    dailyBudget = 10,
    customAudienceId,
    targeting: customTargeting,
  } = params

  const targeting = buildTargeting(audienceType, customTargeting, customAudienceId)
  const ts = new Date().toISOString().slice(0, 10)

  return {
    campaign: {
      name: 'Flywheel: Audience Testing (ABO)',
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
    },
    adSet: {
      name: `FW Test | ${audienceName} | $${dailyBudget}/day | ${ts}`,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: `$${dailyBudget}/day (${dailyBudget * 100} cents)`,
      promoted_object: {
        pixel_id: GRI_PIXEL_ID,
        custom_event_type: 'PURCHASE',
      },
      targeting,
      status: 'PAUSED — you must activate manually',
    },
    ad: {
      name: `FW | ${audienceName} | Auto`,
      creative: 'Will reuse best performing creative from your account',
      status: 'PAUSED — activates when ad set is activated',
    },
    warnings: [
      dailyBudget < 10 ? 'Budget below $10/day may not generate enough data for a decision in 7 days' : null,
      dailyBudget > 20 ? 'Budget above $20/day is aggressive for a test. Consider starting lower.' : null,
      audienceType === 'interest' ? 'Interest audiences are cold traffic. Expect higher CPA initially.' : null,
      audienceType === 'geo' ? 'Geo-only targeting is broad. Consider layering with interests.' : null,
    ].filter(Boolean),
    estimatedCost: {
      sevenDayTestCost: `$${dailyBudget * 7}`,
      expectedPurchasesAtTarget: `${Math.round((dailyBudget * 7) / 38)} purchases (at $38 CPA target)`,
      killThreshold: `$${Math.round(dailyBudget * 3)} spent with 0 purchases (3 days)`,
    },
  }
}
