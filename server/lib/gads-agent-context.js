/**
 * gads-agent-context.js
 *
 * Layer 1 (declared context) + Layer 2 (auto-discovered context) store.
 *
 * Holds everything the agent needs to know about GRI's Google Ads account
 * BEFORE it makes any recommendation:
 *   - Which campaigns are enabled (vs paused) and their structural metadata
 *   - Per-campaign protection level (execute_freely | alert_only | never_touch)
 *   - Per-campaign target ROAS overrides
 *   - Shared negative list architecture and subscription map
 *   - Semantic category → shared list mapping for negative keyword additions
 *   - Global protection rules (skip keywords on PMax, skip bids on auto-bid, etc)
 *
 * On every scan, the rules engine asks this module:
 *   "Is this campaign enabled?"  → filter
 *   "Can I modify this entity?"  → protection level
 *   "What target ROAS applies?"  → per-campaign lookup
 *   "Where should this negative keyword go?" → shared list mapper
 *
 * The auto-discovered context is refreshed on every scan. The declared
 * context (protection levels, manual overrides) persists across scans
 * in data/gads-agent/context.json.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { dataFile, dataDir } from './data-dir.js'
import { getGadsCustomer, microsToDollars } from './gads-client.js'

dataDir('gads-agent')
const FILE = dataFile('gads-agent/context.json')

// ── Enum decoders ───────────────────────────────────────────────────────────

// campaign.advertising_channel_type
export const CHANNEL = {
  2:  'SEARCH',
  3:  'DISPLAY',
  4:  'SHOPPING',
  5:  'HOTEL',
  6:  'VIDEO',
  7:  'MULTI_CHANNEL',
  8:  'LOCAL',
  9:  'SMART',
  10: 'PERFORMANCE_MAX',
  11: 'LOCAL_SERVICES',
  13: 'TRAVEL',
  14: 'DEMAND_GEN',
}

// campaign.bidding_strategy_type
export const BID_STRATEGY = {
  1:  'COMMISSION',
  2:  'ENHANCED_CPC',
  6:  'MANUAL_CPC',
  7:  'MANUAL_CPM',
  8:  'MANUAL_CPV',
  9:  'MAXIMIZE_CONVERSIONS',
  10: 'MAXIMIZE_CONVERSION_VALUE',
  11: 'MAXIMIZE_CONVERSION_VALUE', // observed in live account
  13: 'PAGE_ONE_PROMOTED',
  14: 'PERCENT_CPC',
  15: 'TARGET_CPA',
  16: 'TARGET_CPM',
  17: 'TARGET_IMPRESSION_SHARE',
  18: 'TARGET_OUTRANK_SHARE',
  19: 'TARGET_ROAS',
  20: 'TARGET_SPEND',
}

// Campaigns where manual bid changes are ignored by Google
export const AUTO_BID_STRATEGIES = new Set([
  'ENHANCED_CPC',
  'MAXIMIZE_CONVERSIONS',
  'MAXIMIZE_CONVERSION_VALUE',
  'TARGET_CPA',
  'TARGET_ROAS',
  'TARGET_IMPRESSION_SHARE',
])

// PMax + Demand Gen = channels where traditional keyword rules don't apply
export const KEYWORDLESS_CHANNELS = new Set(['PERFORMANCE_MAX', 'DEMAND_GEN', 'SHOPPING'])

// shared_set.type — 2 = NEGATIVE_KEYWORDS, 3 = NEGATIVE_PLACEMENTS
export const SHARED_SET_TYPE = {
  2: 'NEGATIVE_KEYWORDS',
  3: 'NEGATIVE_PLACEMENTS',
}

// ── Declared context defaults (baked in from discovery) ─────────────────────
//
// These are my reasoned-from-the-data defaults, NOT guesses. Every one of
// these decisions is documented in the commit message + chat log so a future
// session can understand WHY each protection level was chosen.

const DEFAULT_DECLARED_CONTEXT = {
  // Protection level per campaign ID (or name as fallback before ID is known)
  // Values: execute_freely | alert_only | never_touch
  protectionLevels: {
    // GRI PMAX | All Products — workhorse, auto-bid, opt 72%, let the agent work
    'GRI PMAX | All Products': 'execute_freely',

    // GRI PMAX | Bundles — same logic as All Products
    'GRI PMAX | Bundles': 'execute_freely',

    // GRI PMAX | Cannon & Powder Reveals — HIGHEST MARGIN, feeds TNT hire cross-sell,
    // deliberate 2.0x tROAS volume play, already running at opt 83%. Alert-only
    // protects the strategic intent from agent interference.
    'GRI PMAX | Cannon & Powder Reveals': 'alert_only',

    // GRI | Search | Cannons — small search campaign ($30/day), only live search,
    // opt 83%, rules engine has real leverage here. Execute freely.
    'GRI | Search | Cannons': 'execute_freely',
  },

  // Per-campaign target ROAS overrides. When set, this beats the blanket
  // config.targetRoas for findings about this campaign.
  // Agent auto-discovers these from campaign.target_roas + campaign.maximize_conversion_value.target_roas
  // Declared overrides below are used when the API doesn't return one.
  targetRoasOverrides: {
    // Cannon & Powder Reveals intentionally runs at 2.0x — volume harvest for TNT cross-sell
    'GRI PMAX | Cannon & Powder Reveals': 2.0,
  },

  // Known paused campaigns the agent should be aware of (don't recommend
  // "create a TNT Hire campaign" — it was tried and paused)
  knownPausedCampaigns: [
    'GRI PMAX | TNT Hire',
    'GRI PMAX | Smoke Bombs',
    'GRI PMAX | Sports & Balloon Reveals',
    'GRI PMAX | All Products | Targeting Test',
    'GRI Demand Gen | All Products',
    'GRI | Search | Brand Defence',
    'GRI | Search | Competitors',
    'GRI | Search | Bundles',
    'GRI | Search | Smoke Bombs & Extinguishers',
    'GRI | Search | Sports Reveals',
    'GRI | Extreme & Sports Reveals',
  ],

  // Semantic category → shared negative list mapping.
  // When the agent wants to add a negative keyword, it classifies the search
  // term semantically and looks up the right shared list here. The shared
  // list's block then propagates to every campaign subscribing to it.
  sharedListSemanticMap: {
    // Catch-all junk (cheap, free, diy, tutorial, how to make, etc)
    generic_junk: 'General Negs',
    // Competitor brand names
    competitor_brand: 'General Negs',
    // Cannon-related terms (cannons, powder cannon, air cannon, etc)
    cannon_related: 'Cannon Negatives',
    // Smoke bomb / extinguisher terms
    smoke_related: 'Smoke & Extinguisher Negatives',
    // Sports / ball / basketball themed reveals
    sports_related: 'Sports Negatives',
    // Bundle / kit / package terms
    bundle_related: 'Bundles Negatives',
    // Brand protection (never-negate your own brand terms — this list is
    // for SELF-CANNIBALIZATION prevention, attached to generic campaigns
    // so they don't eat brand traffic)
    self_brand: 'Brand Negatives',
    // TNT hire specific terms
    hire_related: 'TNT Hire Negatives',
  },

  // Global hard rules that override everything
  globalRules: {
    // Never modify keyword bids on auto-bid campaigns (the API call would succeed
    // but Google silently ignores manual bids on Max Conv Value etc)
    suppressBidChangesOnAutoBid: true,
    // PMax/Demand Gen/Shopping don't have traditional keywords — skip those findings
    suppressKeywordFindingsOnKeywordlessChannels: true,
    // Don't flag findings against paused campaigns
    onlyScanEnabledCampaigns: true,
    // Findings must have at least this many days of data before being trusted
    // (respects the 90-day Shopify conversion lookback window)
    minDataDaysForBleedFindings: 30,
  },

  updatedAt: null,
}

// ── Persistence ─────────────────────────────────────────────────────────────

function loadContext() {
  if (!existsSync(FILE)) return { declared: { ...DEFAULT_DECLARED_CONTEXT }, auto: null }
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8'))
    return {
      declared: { ...DEFAULT_DECLARED_CONTEXT, ...(raw.declared || {}) },
      auto: raw.auto || null,
    }
  } catch {
    return { declared: { ...DEFAULT_DECLARED_CONTEXT }, auto: null }
  }
}

function saveContext(ctx) {
  const json = JSON.stringify({ ...ctx, declared: { ...ctx.declared, updatedAt: new Date().toISOString() } }, null, 2)
  if (existsSync(FILE)) {
    try { copyFileSync(FILE, FILE + '.bak') } catch { /* ok */ }
  }
  writeFileSync(FILE, json)
}

// ── Public getters ──────────────────────────────────────────────────────────

export function getDeclaredContext() {
  return loadContext().declared
}

export function getAutoContext() {
  return loadContext().auto
}

export function getFullContext() {
  return loadContext()
}

export function updateDeclaredContext(patch) {
  const ctx = loadContext()
  ctx.declared = { ...ctx.declared, ...patch }
  saveContext(ctx)
  return ctx.declared
}

// ── Layer 2: auto-discovery ─────────────────────────────────────────────────
// Called on every scan cycle to refresh structural context from the API.

export async function refreshAutoContext() {
  const customer = getGadsCustomer()

  // 1. All campaigns with structural metadata
  const campaigns = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.serving_status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign.bidding_strategy_system_status,
      campaign.optimization_score,
      campaign.target_cpa.target_cpa_micros,
      campaign.target_roas.target_roas,
      campaign.maximize_conversion_value.target_roas,
      campaign_budget.id,
      campaign_budget.name,
      campaign_budget.amount_micros,
      campaign_budget.explicitly_shared,
      campaign_budget.reference_count
    FROM campaign
    ORDER BY campaign.name
  `).catch(err => {
    console.error('[GadsContext] Campaign discovery failed:', err?.errors?.[0]?.message || err.message)
    return []
  })

  const enabledCampaigns = []
  const pausedCampaigns = []
  const campaignsById = {}

  for (const r of campaigns) {
    const camp = r.campaign
    const channel = CHANNEL[camp.advertising_channel_type] || `UNKNOWN_${camp.advertising_channel_type}`
    const bidStrategy = BID_STRATEGY[camp.bidding_strategy_type] || `UNKNOWN_${camp.bidding_strategy_type}`

    // Resolve target ROAS from any of the 3 possible API locations
    let targetRoas = null
    if (camp.target_roas?.target_roas) targetRoas = Number(camp.target_roas.target_roas)
    else if (camp.maximize_conversion_value?.target_roas) targetRoas = Number(camp.maximize_conversion_value.target_roas)

    const record = {
      id: String(camp.id),
      name: camp.name,
      status: camp.status, // 2=enabled, 3=paused, 4=removed
      servingStatus: camp.serving_status,
      channel,
      channelType: camp.advertising_channel_type,
      bidStrategy,
      bidStrategyType: camp.bidding_strategy_type,
      systemStatus: camp.bidding_strategy_system_status,
      optimizationScore: camp.optimization_score || null,
      targetRoas,
      targetCpaAud: camp.target_cpa?.target_cpa_micros ? microsToDollars(camp.target_cpa.target_cpa_micros) : null,
      budgetId: String(r.campaign_budget?.id || ''),
      budgetName: r.campaign_budget?.name || '',
      budgetAud: r.campaign_budget?.amount_micros ? microsToDollars(r.campaign_budget.amount_micros) : 0,
      budgetShared: !!r.campaign_budget?.explicitly_shared,
      budgetRefCount: r.campaign_budget?.reference_count || 1,
      isAutoBid: AUTO_BID_STRATEGIES.has(bidStrategy),
      isKeywordless: KEYWORDLESS_CHANNELS.has(channel),
    }

    campaignsById[record.id] = record
    if (camp.status === 2) enabledCampaigns.push(record)
    else if (camp.status === 3) pausedCampaigns.push(record)
  }

  // 2. Shared negative lists
  const sharedSets = await customer.query(`
    SELECT
      shared_set.id,
      shared_set.name,
      shared_set.type,
      shared_set.status,
      shared_set.member_count,
      shared_set.reference_count
    FROM shared_set
    WHERE shared_set.status = 'ENABLED'
  `).catch(err => {
    console.error('[GadsContext] Shared set discovery failed:', err?.errors?.[0]?.message || err.message)
    return []
  })

  const sharedLists = sharedSets.map(r => ({
    id: String(r.shared_set.id),
    name: r.shared_set.name,
    type: SHARED_SET_TYPE[r.shared_set.type] || 'UNKNOWN',
    typeCode: r.shared_set.type,
    memberCount: r.shared_set.member_count || 0,
    referenceCount: r.shared_set.reference_count || 0,
  }))

  const sharedListsByName = Object.fromEntries(sharedLists.map(l => [l.name, l]))

  // 3. Campaign → shared set subscriptions
  const subscriptions = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      shared_set.id,
      shared_set.name,
      shared_set.type
    FROM campaign_shared_set
    WHERE campaign_shared_set.status = 'ENABLED'
  `).catch(err => {
    console.error('[GadsContext] Shared set subscription discovery failed:', err?.errors?.[0]?.message || err.message)
    return []
  })

  const campaignSubscriptions = {} // campaignId → [sharedListNames]
  for (const r of subscriptions) {
    const cid = String(r.campaign.id)
    if (!campaignSubscriptions[cid]) campaignSubscriptions[cid] = []
    campaignSubscriptions[cid].push(r.shared_set.name)
  }

  // 4. PMax asset groups (for context on PMax campaigns)
  const assetGroups = await customer.query(`
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.primary_status,
      campaign.id,
      campaign.name
    FROM asset_group
    WHERE asset_group.status = 'ENABLED'
  `).catch(() => [])

  const assetGroupsByCampaign = {}
  for (const r of assetGroups) {
    const cid = String(r.campaign.id)
    if (!assetGroupsByCampaign[cid]) assetGroupsByCampaign[cid] = []
    assetGroupsByCampaign[cid].push({
      id: String(r.asset_group.id),
      name: r.asset_group.name,
      primaryStatus: r.asset_group.primary_status,
    })
  }

  const auto = {
    discoveredAt: new Date().toISOString(),
    enabledCampaignIds: enabledCampaigns.map(c => c.id),
    enabledCampaigns,
    pausedCampaigns,
    campaignsById,
    sharedLists,
    sharedListsByName,
    campaignSubscriptions,
    assetGroupsByCampaign,
  }

  const ctx = loadContext()
  ctx.auto = auto
  saveContext(ctx)
  return auto
}

// ── Context-aware query helpers ─────────────────────────────────────────────

/**
 * Is this campaign ID currently enabled?
 */
export function isCampaignEnabled(campaignId) {
  const auto = getAutoContext()
  if (!auto) return true // no context yet — don't block, scan will run with empty filter
  return auto.enabledCampaignIds.includes(String(campaignId))
}

/**
 * Get the full campaign record by ID (or null)
 */
export function getCampaignById(campaignId) {
  const auto = getAutoContext()
  if (!auto) return null
  return auto.campaignsById[String(campaignId)] || null
}

/**
 * Get the protection level for a campaign. Looks up by name because
 * campaign IDs aren't stable until first discovery.
 *
 * Returns: 'execute_freely' | 'alert_only' | 'never_touch'
 * Default: 'execute_freely' if not declared.
 */
export function getProtectionLevel(campaignNameOrId) {
  const declared = getDeclaredContext()
  const auto = getAutoContext()

  // Try direct name lookup first
  if (declared.protectionLevels[campaignNameOrId]) {
    return declared.protectionLevels[campaignNameOrId]
  }

  // If we got an ID, resolve it to name then look up
  if (auto) {
    const camp = auto.campaignsById[String(campaignNameOrId)]
    if (camp && declared.protectionLevels[camp.name]) {
      return declared.protectionLevels[camp.name]
    }
  }

  return 'execute_freely'
}

/**
 * Get the target ROAS for a campaign. Precedence:
 * 1. API-discovered target_roas (from campaign.target_roas or maximize_conversion_value.target_roas)
 * 2. Declared override in declared.targetRoasOverrides
 * 3. Config blanket default (caller handles this)
 */
export function getTargetRoasForCampaign(campaignNameOrId) {
  const auto = getAutoContext()
  const declared = getDeclaredContext()

  // 1. API-discovered
  if (auto) {
    const camp = typeof campaignNameOrId === 'string' && /^\d+$/.test(campaignNameOrId)
      ? auto.campaignsById[campaignNameOrId]
      : Object.values(auto.campaignsById).find(c => c.name === campaignNameOrId)
    if (camp && camp.targetRoas) return camp.targetRoas
  }

  // 2. Declared override
  if (declared.targetRoasOverrides[campaignNameOrId]) {
    return declared.targetRoasOverrides[campaignNameOrId]
  }

  return null
}

/**
 * Semantic classifier for a search term. Returns one of the semantic
 * categories defined in declared.sharedListSemanticMap.
 *
 * This is intentionally simple keyword matching. A smarter version would
 * use embeddings or an LLM call, but for first-cut we stick to rules.
 */
export function classifySearchTerm(term) {
  const t = (term || '').toLowerCase()

  if (/\b(cannon|powder|blaster|launcher|mortar)\b/.test(t))  return 'cannon_related'
  if (/\b(smoke|emitter|enola|eg18|grenade|extinguisher)\b/.test(t)) return 'smoke_related'
  if (/\b(sport|football|basketball|soccer|nfl|afl|ball|boxing)\b/.test(t)) return 'sports_related'
  if (/\b(bundle|kit|package|set|combo|pack)\b/.test(t)) return 'bundle_related'
  if (/\b(hire|rent|rental|lease|book|bond)\b/.test(t)) return 'hire_related'
  if (/\b(gender reveal ideas|genderrevealideas|gri)\b/.test(t)) return 'self_brand'
  if (/\b(free|cheap|discount|diy|tutorial|how to make|homemade)\b/.test(t)) return 'generic_junk'

  return 'generic_junk'
}

/**
 * For a given search term + source campaign, find the best shared negative
 * list to add the term to. Returns { listId, listName, reason } or null if
 * no shared list matches and campaign-level should be used.
 *
 * Logic:
 *   1. Classify the term semantically
 *   2. Look up the mapped shared list name
 *   3. Verify the source campaign subscribes to that list
 *   4. If yes: return it (the block propagates to all subscribers)
 *   5. If no: return null — caller falls back to campaign-level with warning
 */
export function findTargetSharedList(searchTerm, sourceCampaignId) {
  const declared = getDeclaredContext()
  const auto = getAutoContext()
  if (!auto) return null

  const category = classifySearchTerm(searchTerm)
  const listName = declared.sharedListSemanticMap[category]
  if (!listName) return null

  const list = auto.sharedListsByName[listName]
  if (!list) return null

  // Check if the source campaign subscribes to this list
  const subs = auto.campaignSubscriptions[String(sourceCampaignId)] || []
  const subscribed = subs.includes(listName)

  return {
    listId: list.id,
    listName: list.name,
    category,
    subscribed,
    reason: subscribed
      ? `"${searchTerm}" classified as ${category}; source campaign subscribes to "${listName}" — adding there propagates the block to ${list.referenceCount} campaign(s).`
      : `"${searchTerm}" classified as ${category}; "${listName}" exists but source campaign does NOT subscribe. Falling back to campaign-level (consider subscribing this campaign to ${listName} for future blocks).`,
  }
}

/**
 * Is this finding allowed to surface given global rules and the campaign's
 * auto-discovered context? Returns { allowed: bool, reason?: string }.
 */
export function evaluateFindingAgainstContext(finding) {
  const declared = getDeclaredContext()
  const rules = declared.globalRules || {}
  const auto = getAutoContext()

  // Must have auto-discovery before any suppression logic works
  if (!auto) return { allowed: true }

  // Rule 1: only scan enabled campaigns
  if (rules.onlyScanEnabledCampaigns) {
    // Try to resolve the finding's campaign
    const rawCampaignId =
      finding?.rawData?.campaignId ||
      (finding?.entityType === 'campaign' ? finding.entityId : null) ||
      finding?.rawData?.campaign?.id
    if (rawCampaignId && !isCampaignEnabled(rawCampaignId)) {
      return { allowed: false, reason: `suppressed: campaign ${rawCampaignId} is not enabled` }
    }
  }

  // Rule 2: keyword findings on keywordless channels
  if (rules.suppressKeywordFindingsOnKeywordlessChannels && finding.category === 'keyword') {
    const cid = finding?.rawData?.campaignId
    const camp = cid ? getCampaignById(cid) : null
    if (camp && camp.isKeywordless) {
      return { allowed: false, reason: `suppressed: ${finding.category} finding on ${camp.channel} campaign "${camp.name}" (no keywords to act on)` }
    }
  }

  // Rule 3: bid findings on auto-bid campaigns
  if (rules.suppressBidChangesOnAutoBid && finding.category === 'bid') {
    const cid = finding?.rawData?.campaignId
    const camp = cid ? getCampaignById(cid) : null
    if (camp && camp.isAutoBid) {
      return { allowed: false, reason: `suppressed: bid finding on auto-bid strategy "${camp.bidStrategy}" — manual bid changes are ignored by Google` }
    }
  }

  // Rule 4: protection level NEVER_TOUCH — suppress entirely
  const cid = finding?.rawData?.campaignId ||
    (finding?.entityType === 'campaign' ? finding.entityId : null)
  if (cid) {
    const level = getProtectionLevel(cid)
    if (level === 'never_touch') {
      return { allowed: false, reason: `suppressed: campaign protection level = never_touch` }
    }
  }

  return { allowed: true }
}

/**
 * Can this recommendation be auto-executed by the approve route?
 * Returns { canExecute: bool, reason?: string }.
 *
 * Enforced at the approve endpoint:
 *   - execute_freely: yes
 *   - alert_only:     no, user must manually action in Google Ads
 *   - never_touch:    finding shouldn't exist in the first place, but fail safe
 */
export function canExecuteRecommendation(rec) {
  const campaignId =
    rec?.currentValue?.campaignId ||
    (rec?.entityType === 'campaign' ? rec.entityId : null)

  if (!campaignId) return { canExecute: true } // no campaign = no protection to apply

  const level = getProtectionLevel(campaignId)
  if (level === 'execute_freely') return { canExecute: true }
  if (level === 'alert_only') return { canExecute: false, reason: 'Campaign is in alert-only mode. Action manually in Google Ads.' }
  if (level === 'never_touch') return { canExecute: false, reason: 'Campaign is marked never_touch.' }
  return { canExecute: true }
}
