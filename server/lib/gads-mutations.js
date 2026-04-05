/**
 * gads-mutations.js
 * Write-side Google Ads API calls. Every mutation checks the dry-run flag
 * from the agent config — if dry-run is on, the mutation is logged and
 * skipped rather than executed.
 *
 * Mutation shapes target google-ads-api v23.
 */
import { getGadsCustomer, getGadsCustomerId, dollarsToMicros } from './gads-client.js'
import { isDryRun } from './gads-agent-store.js'

function cust() { return getGadsCustomerId() }

function dryLog(action, payload) {
  console.log(`[GadsMutations] DRY-RUN ${action}:`, JSON.stringify(payload))
  return { ok: true, dryRun: true, action, payload }
}

// ── Campaigns ───────────────────────────────────────────────────────────────

export async function pauseCampaign(campaignId) {
  if (isDryRun()) return dryLog('PAUSE_CAMPAIGN', { campaignId })
  const customer = getGadsCustomer()
  const res = await customer.campaigns.update([{
    resource_name: `customers/${cust()}/campaigns/${campaignId}`,
    status: 'PAUSED',
  }])
  return { ok: true, dryRun: false, action: 'PAUSE_CAMPAIGN', campaignId, raw: res }
}

export async function enableCampaign(campaignId) {
  if (isDryRun()) return dryLog('ENABLE_CAMPAIGN', { campaignId })
  const customer = getGadsCustomer()
  const res = await customer.campaigns.update([{
    resource_name: `customers/${cust()}/campaigns/${campaignId}`,
    status: 'ENABLED',
  }])
  return { ok: true, dryRun: false, action: 'ENABLE_CAMPAIGN', campaignId, raw: res }
}

export async function updateCampaignBudget(budgetResourceName, newBudgetAud) {
  const newBudgetMicros = dollarsToMicros(newBudgetAud)
  if (isDryRun()) return dryLog('UPDATE_BUDGET', { budgetResourceName, newBudgetAud, newBudgetMicros })
  if (!budgetResourceName) throw new Error('updateCampaignBudget: budgetResourceName required')
  const customer = getGadsCustomer()
  const res = await customer.campaignBudgets.update([{
    resource_name: budgetResourceName,
    amount_micros: newBudgetMicros,
  }])
  return { ok: true, dryRun: false, action: 'UPDATE_BUDGET', budgetResourceName, newBudgetMicros, raw: res }
}

// ── Keywords ────────────────────────────────────────────────────────────────

function adGroupCriterionResource(adGroupId, criterionId) {
  return `customers/${cust()}/adGroupCriteria/${adGroupId}~${criterionId}`
}

export async function pauseKeyword(adGroupId, criterionId) {
  if (!adGroupId || !criterionId) throw new Error('pauseKeyword: adGroupId and criterionId required')
  if (isDryRun()) return dryLog('PAUSE_KEYWORD', { adGroupId, criterionId })
  const customer = getGadsCustomer()
  const res = await customer.adGroupCriteria.update([{
    resource_name: adGroupCriterionResource(adGroupId, criterionId),
    status: 'PAUSED',
  }])
  return { ok: true, dryRun: false, action: 'PAUSE_KEYWORD', adGroupId, criterionId, raw: res }
}

export async function enableKeyword(adGroupId, criterionId) {
  if (!adGroupId || !criterionId) throw new Error('enableKeyword: adGroupId and criterionId required')
  if (isDryRun()) return dryLog('ENABLE_KEYWORD', { adGroupId, criterionId })
  const customer = getGadsCustomer()
  const res = await customer.adGroupCriteria.update([{
    resource_name: adGroupCriterionResource(adGroupId, criterionId),
    status: 'ENABLED',
  }])
  return { ok: true, dryRun: false, action: 'ENABLE_KEYWORD', adGroupId, criterionId, raw: res }
}

/**
 * Pause a batch of keywords in a single update call. Payload items:
 *   [{ adGroupId, criterionId }, ...]
 * Returns a per-item result array — partial failures are returned rather
 * than throwing, so a bulk hygiene card can still log what succeeded.
 */
export async function pauseKeywordBatch(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('pauseKeywordBatch: items array required')
  }
  if (isDryRun()) return dryLog('PAUSE_KEYWORD_BATCH', { count: items.length, items })
  const customer = getGadsCustomer()
  const ops = items.map(it => ({
    resource_name: adGroupCriterionResource(it.adGroupId, it.criterionId),
    status: 'PAUSED',
  }))
  try {
    const res = await customer.adGroupCriteria.update(ops)
    return { ok: true, dryRun: false, action: 'PAUSE_KEYWORD_BATCH', count: items.length, items, raw: res }
  } catch (err) {
    // Google Ads returns partial failures in err.errors when partial_failure flag is set;
    // without that flag any failure is a full rollback. Return the error surface for audit.
    return {
      ok: false,
      dryRun: false,
      action: 'PAUSE_KEYWORD_BATCH',
      count: items.length,
      items,
      error: err?.errors?.[0]?.message || err?.message || String(err),
    }
  }
}

/**
 * Add a batch of new positive keywords to ad groups. Payload items:
 *   [{ adGroupId, text, matchType: 'EXACT'|'PHRASE'|'BROAD', cpcBidAud? }, ...]
 * cpcBidAud is optional; if omitted the ad group default bidding applies.
 * Returns per-item result with created resource_names for audit/revert.
 */
export async function addKeywordBatch(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('addKeywordBatch: items array required')
  }
  // normalise match type to uppercase string
  const norm = items.map(it => {
    if (!it.adGroupId || !it.text) {
      throw new Error('addKeywordBatch: each item needs adGroupId and text')
    }
    return {
      adGroupId: String(it.adGroupId),
      text: it.text,
      matchType: String(it.matchType || 'PHRASE').toUpperCase(),
      cpcBidAud: it.cpcBidAud || null,
    }
  })
  if (isDryRun()) return dryLog('ADD_KEYWORD_BATCH', { count: norm.length, items: norm })
  const customer = getGadsCustomer()
  const ops = norm.map(it => {
    const op = {
      ad_group: `customers/${cust()}/adGroups/${it.adGroupId}`,
      status: 'ENABLED',
      keyword: { text: it.text, match_type: it.matchType },
    }
    if (it.cpcBidAud) op.cpc_bid_micros = dollarsToMicros(it.cpcBidAud)
    return op
  })
  try {
    const res = await customer.adGroupCriteria.create(ops)
    const resourceNames = (res?.results || []).map(r => r.resource_name)
    return {
      ok: true,
      dryRun: false,
      action: 'ADD_KEYWORD_BATCH',
      count: norm.length,
      items: norm,
      resourceNames,
      raw: res,
    }
  } catch (err) {
    return {
      ok: false,
      dryRun: false,
      action: 'ADD_KEYWORD_BATCH',
      count: norm.length,
      items: norm,
      error: err?.errors?.[0]?.message || err?.message || String(err),
    }
  }
}

export async function updateKeywordBid(adGroupId, criterionId, newBidAud) {
  const newBidMicros = dollarsToMicros(newBidAud)
  if (isDryRun()) return dryLog('UPDATE_BID', { adGroupId, criterionId, newBidAud, newBidMicros })
  if (!adGroupId || !criterionId) throw new Error('updateKeywordBid: adGroupId and criterionId required')
  const customer = getGadsCustomer()
  const res = await customer.adGroupCriteria.update([{
    resource_name: adGroupCriterionResource(adGroupId, criterionId),
    cpc_bid_micros: newBidMicros,
  }])
  return { ok: true, dryRun: false, action: 'UPDATE_BID', adGroupId, criterionId, newBidMicros, raw: res }
}

// ── Campaign-level negative keywords ────────────────────────────────────────

/**
 * Add a campaign-level negative keyword. Returns { resource_name } of the
 * created criterion so it can be stored for potential later removal (revert).
 */
export async function addCampaignNegativeKeyword(campaignId, searchTerm, matchType = 'PHRASE') {
  if (isDryRun()) return dryLog('ADD_NEGATIVE_KEYWORD', { campaignId, searchTerm, matchType })
  if (!campaignId || !searchTerm) throw new Error('addCampaignNegativeKeyword: campaignId and searchTerm required')
  const customer = getGadsCustomer()
  const res = await customer.campaignCriteria.create([{
    campaign: `customers/${cust()}/campaigns/${campaignId}`,
    negative: true,
    keyword: {
      text: searchTerm,
      match_type: matchType,
    },
  }])
  const resourceName = res?.results?.[0]?.resource_name || null
  return { ok: true, dryRun: false, action: 'ADD_NEGATIVE_KEYWORD', campaignId, searchTerm, matchType, resourceName, raw: res }
}

/**
 * Remove a previously-added negative keyword by its full resource_name.
 * Used by the revert manager.
 */
export async function removeCampaignNegativeKeyword(resourceName) {
  if (isDryRun()) return dryLog('REMOVE_NEGATIVE_KEYWORD', { resourceName })
  if (!resourceName) throw new Error('removeCampaignNegativeKeyword: resourceName required')
  const customer = getGadsCustomer()
  const res = await customer.campaignCriteria.remove([resourceName])
  return { ok: true, dryRun: false, action: 'REMOVE_NEGATIVE_KEYWORD', resourceName, raw: res }
}

// ── Shared negative keyword list mutations ──────────────────────────────────
//
// Josh's account uses subject-based shared negative lists (Cannon Negatives,
// Smoke & Extinguisher Negatives, etc). Adding a negative to the right shared
// list propagates the block across every campaign that subscribes to it.
// This preserves the account's sophisticated negative-list architecture
// instead of fragmenting it with per-campaign additions.

export async function addNegativeToSharedList(sharedSetId, searchTerm, matchType = 'PHRASE') {
  if (isDryRun()) return dryLog('ADD_SHARED_NEGATIVE', { sharedSetId, searchTerm, matchType })
  if (!sharedSetId || !searchTerm) throw new Error('addNegativeToSharedList: sharedSetId and searchTerm required')
  const customer = getGadsCustomer()
  const res = await customer.sharedCriteria.create([{
    shared_set: `customers/${cust()}/sharedSets/${sharedSetId}`,
    keyword: {
      text: searchTerm,
      match_type: matchType,
    },
  }])
  const resourceName = res?.results?.[0]?.resource_name || null
  return { ok: true, dryRun: false, action: 'ADD_SHARED_NEGATIVE', sharedSetId, searchTerm, matchType, resourceName, raw: res }
}

export async function removeNegativeFromSharedList(sharedCriterionResourceName) {
  if (isDryRun()) return dryLog('REMOVE_SHARED_NEGATIVE', { sharedCriterionResourceName })
  if (!sharedCriterionResourceName) throw new Error('removeNegativeFromSharedList: resource name required')
  const customer = getGadsCustomer()
  const res = await customer.sharedCriteria.remove([sharedCriterionResourceName])
  return { ok: true, dryRun: false, action: 'REMOVE_SHARED_NEGATIVE', sharedCriterionResourceName, raw: res }
}

// ── Ad status ───────────────────────────────────────────────────────────────

export async function pauseAd(adGroupId, adId) {
  if (isDryRun()) return dryLog('PAUSE_AD', { adGroupId, adId })
  const customer = getGadsCustomer()
  const res = await customer.adGroupAds.update([{
    resource_name: `customers/${cust()}/adGroupAds/${adGroupId}~${adId}`,
    status: 'PAUSED',
  }])
  return { ok: true, dryRun: false, action: 'PAUSE_AD', adGroupId, adId, raw: res }
}

export async function enableAd(adGroupId, adId) {
  if (isDryRun()) return dryLog('ENABLE_AD', { adGroupId, adId })
  const customer = getGadsCustomer()
  const res = await customer.adGroupAds.update([{
    resource_name: `customers/${cust()}/adGroupAds/${adGroupId}~${adId}`,
    status: 'ENABLED',
  }])
  return { ok: true, dryRun: false, action: 'ENABLE_AD', adGroupId, adId, raw: res }
}
