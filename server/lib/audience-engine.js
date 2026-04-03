/**
 * audience-engine.js
 * Autonomous audience discovery, creation, testing, and kill/scale flywheel.
 * Manages the full lifecycle: Research → Create → Test → Measure → Kill/Scale.
 */
import {
  createWebsiteAudience, createLookalikeAudience, listAudiences,
  metaToken, createFreshAudienceSet,
  fetchAdsetsForCampaign, fetchAdsetInsights,
  updateAdSetBudget, updateAdSetStatus,
} from './meta-api.js'
import { getAdSets, getAdSetSnapshots, logFlywheelEvent } from './flywheel-store.js'
import { GRI_ADS } from './ads-metrics.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUDIENCE_DB_PATH = path.join(__dirname, '../../data/flywheel/audiences.json')

// ── Audience Database ─────────────────────────────────────────────────────────

function loadDb() {
  try {
    if (fs.existsSync(AUDIENCE_DB_PATH)) return JSON.parse(fs.readFileSync(AUDIENCE_DB_PATH, 'utf8'))
  } catch (e) { console.error('[AudienceEngine] DB load error:', e.message) }
  return { audiences: [], tests: [], learnings: [], createdAt: new Date().toISOString() }
}

function saveDb(db) {
  const dir = path.dirname(AUDIENCE_DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // Atomic write
  const tmp = AUDIENCE_DB_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, AUDIENCE_DB_PATH)
}

// ── Proven Audience Templates (Research-Backed) ──────────────────────────────

const AUDIENCE_TEMPLATES = {
  // Tier 1: High-intent retargeting (best ROAS)
  retargeting: [
    {
      id: 'atc_7d', name: 'Add to Cart 7 Days', type: 'retargeting',
      event: 'AddToCart', retention: 7, priority: 1,
      expectedRoas: 6.0, expectedCpa: 15,
      reason: 'Hottest retargeting — cart abandoners within 7 days convert at 3x site average'
    },
    {
      id: 'atc_14d', name: 'Add to Cart 14 Days', type: 'retargeting',
      event: 'AddToCart', retention: 14, priority: 2,
      expectedRoas: 4.5, expectedCpa: 20,
      reason: 'Warm cart abandoners — slightly wider but still high intent'
    },
    {
      id: 'vc_7d', name: 'View Content 7 Days', type: 'retargeting',
      event: 'ViewContent', retention: 7, priority: 3,
      expectedRoas: 3.5, expectedCpa: 25,
      reason: 'Product page viewers in last 7 days — interested but not yet committed'
    },
    {
      id: 'visitors_14d', name: 'All Visitors 14 Days', type: 'retargeting',
      event: 'PageView', retention: 14, priority: 4,
      expectedRoas: 3.0, expectedCpa: 28,
      reason: 'General site visitors — exclude purchasers for clean retargeting'
    },
    {
      id: 'visitors_30d_no_purchase', name: 'Visitors 30d No Purchase', type: 'retargeting',
      event: 'PageView', retention: 30,
      excludeEvent: 'Purchase', excludeRetentionDays: 30, priority: 5,
      expectedRoas: 2.5, expectedCpa: 32,
      reason: 'Broadest retargeting pool — everyone who visited but did not buy in 30 days'
    },
  ],

  // Tier 2: Lookalikes from best sources
  lookalike: [
    {
      id: 'lal_purchasers_1pct', name: 'LAL 1% Purchasers', type: 'lookalike',
      sourceTemplate: 'purchasers_90d', ratio: 0.01, country: 'AU', priority: 1,
      expectedRoas: 3.5, expectedCpa: 25,
      reason: '1% LAL from purchasers is the gold standard — closest match to actual buyers'
    },
    {
      id: 'lal_purchasers_2pct', name: 'LAL 2% Purchasers', type: 'lookalike',
      sourceTemplate: 'purchasers_90d', ratio: 0.02, country: 'AU', priority: 2,
      expectedRoas: 3.0, expectedCpa: 28,
      reason: '2% gives more reach while keeping quality — good for scaling from 1%'
    },
    {
      id: 'lal_atc_2pct', name: 'LAL 2% Add to Cart', type: 'lookalike',
      sourceTemplate: 'atc_30d', ratio: 0.02, country: 'AU', priority: 3,
      expectedRoas: 2.5, expectedCpa: 32,
      reason: 'ATC lookalike includes high-intent non-purchasers — different signal from purchase LAL'
    },
    {
      id: 'lal_purchasers_5pct', name: 'LAL 5% Purchasers', type: 'lookalike',
      sourceTemplate: 'purchasers_90d', ratio: 0.05, country: 'AU', priority: 4,
      expectedRoas: 2.2, expectedCpa: 38,
      reason: '5% is the scaling ceiling in AU — beyond this quality drops sharply'
    },
  ],

  // Tier 3: Interest-based prospecting (cold traffic)
  interest: [
    {
      id: 'int_baby_shower', name: 'Baby Shower Interest', type: 'interest',
      interests: ['Baby shower', 'Gender reveal party', 'Baby gender'],
      ageMin: 22, ageMax: 42, genders: [2], // Female only
      priority: 1, expectedRoas: 2.5, expectedCpa: 32,
      reason: 'Direct intent — actively searching for baby shower/gender reveal content'
    },
    {
      id: 'int_pregnancy', name: 'Pregnancy + Expecting', type: 'interest',
      interests: ['Pregnancy', 'Parenting', 'Baby names'],
      behaviors: ['Expecting parents'],
      ageMin: 22, ageMax: 42, genders: [2],
      priority: 2, expectedRoas: 2.0, expectedCpa: 38,
      reason: 'Pregnancy-stage targeting — these people will need a reveal in 1-5 months'
    },
    {
      id: 'int_party_celebration', name: 'Party + Celebration', type: 'interest',
      interests: ['Party supplies', 'Event planning', 'Celebration'],
      ageMin: 22, ageMax: 45, genders: [2],
      priority: 3, expectedRoas: 1.8, expectedCpa: 42,
      reason: 'Broader party interest — picks up event planners and celebration lovers'
    },
  ],

  // Geo-targeted audiences (Australian birth rate data)
  geo: [
    {
      id: 'geo_nsw', name: 'NSW (Highest Birth Rate)', type: 'geo',
      region: 'New South Wales', regionCode: 'NSW',
      annualBirths: 95000, priority: 1,
      reason: 'NSW has the highest births in AU (~95k/yr). Sydney metro alone is 60k+.'
    },
    {
      id: 'geo_vic', name: 'Victoria', type: 'geo',
      region: 'Victoria', regionCode: 'VIC',
      annualBirths: 80000, priority: 2,
      reason: 'VIC is 2nd highest (~80k/yr). Melbourne metro drives most of it.'
    },
    {
      id: 'geo_qld', name: 'Queensland', type: 'geo',
      region: 'Queensland', regionCode: 'QLD',
      annualBirths: 62000, priority: 3,
      reason: 'QLD is 3rd (~62k/yr). GRI is based here — shipping advantage.'
    },
    {
      id: 'geo_wa', name: 'Western Australia', type: 'geo',
      region: 'Western Australia', regionCode: 'WA',
      annualBirths: 35000, priority: 4,
      reason: 'WA has ~35k births/yr. Perth is underserved by competitors.'
    },
    {
      id: 'geo_sa', name: 'South Australia', type: 'geo',
      region: 'South Australia', regionCode: 'SA',
      annualBirths: 20000, priority: 5,
      reason: 'SA has ~20k births/yr. Smaller market but low competition.'
    },
  ],
}

// ── Seed Audiences ────────────────────────────────────────────────────────────

const SEED_AUDIENCES = [
  { id: 'purchasers_90d', name: 'Purchasers 90d', event: 'Purchase', retention: 90 },
  { id: 'purchasers_30d', name: 'Purchasers 30d', event: 'Purchase', retention: 30 },
  { id: 'atc_30d', name: 'ATC 30d', event: 'AddToCart', retention: 30 },
]

// ── Core Engine Functions ─────────────────────────────────────────────────────

/**
 * Get all audience templates with their current status.
 */
export function getAudienceTemplates() {
  const db = loadDb()
  const all = [
    ...AUDIENCE_TEMPLATES.retargeting,
    ...AUDIENCE_TEMPLATES.lookalike,
    ...AUDIENCE_TEMPLATES.interest,
    ...AUDIENCE_TEMPLATES.geo,
  ]

  return all.map(template => {
    const existing = db.audiences.find(a => a.templateId === template.id)
    return {
      ...template,
      status: existing ? existing.status : 'not_created',
      metaAudienceId: existing?.metaAudienceId || null,
      createdAt: existing?.createdAt || null,
      adSetId: existing?.adSetId || null,
      testStarted: existing?.testStarted || null,
      daysInTest: existing?.testStarted
        ? Math.floor((Date.now() - new Date(existing.testStarted).getTime()) / 86400000)
        : 0,
      performance: existing?.performance || null,
    }
  })
}

/**
 * Create a specific audience on Meta and register it in the database.
 */
export async function createAudience(templateId) {
  const template = [
    ...AUDIENCE_TEMPLATES.retargeting,
    ...AUDIENCE_TEMPLATES.lookalike,
    ...AUDIENCE_TEMPLATES.interest,
    ...AUDIENCE_TEMPLATES.geo,
  ].find(t => t.id === templateId)

  if (!template) throw new Error(`Unknown template: ${templateId}`)

  const db = loadDb()
  const existing = db.audiences.find(a => a.templateId === templateId && a.status !== 'killed')
  if (existing) throw new Error(`Audience "${template.name}" already exists (${existing.status})`)

  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  let metaResult

  if (template.type === 'retargeting') {
    const opts = {}
    if (template.excludeEvent) {
      opts.excludeEvent = template.excludeEvent
      opts.excludeRetentionDays = template.excludeRetentionDays || template.retention
    }
    metaResult = await createWebsiteAudience(
      `Flywheel: ${template.name} [${ts}]`,
      template.event,
      template.retention,
      opts
    )
  } else if (template.type === 'lookalike') {
    // Need source audience first
    const sourceTemplate = SEED_AUDIENCES.find(s => s.id === template.sourceTemplate)
    let sourceAudience = db.audiences.find(a => a.templateId === template.sourceTemplate)

    if (!sourceAudience) {
      // Create the seed audience first
      const seedResult = await createWebsiteAudience(
        `Flywheel: ${sourceTemplate.name} [${ts}]`,
        sourceTemplate.event,
        sourceTemplate.retention
      )
      sourceAudience = {
        templateId: sourceTemplate.id,
        name: sourceTemplate.name,
        metaAudienceId: seedResult.id,
        status: 'seed',
        createdAt: new Date().toISOString(),
      }
      db.audiences.push(sourceAudience)
      saveDb(db)
    }

    metaResult = await createLookalikeAudience(
      `Flywheel: ${template.name} [${ts}]`,
      sourceAudience.metaAudienceId,
      template.country || 'AU',
      template.ratio
    )
  } else {
    // Interest and geo audiences are targeting configs, not custom audiences
    // They get created when attached to an ad set, not as standalone audiences
    metaResult = { id: `template_${templateId}_${ts}`, type: template.type }
  }

  const record = {
    templateId: template.id,
    name: template.name,
    type: template.type,
    metaAudienceId: metaResult.id,
    status: 'created',
    createdAt: new Date().toISOString(),
    testStarted: null,
    adSetId: null,
    performance: null,
    expectedRoas: template.expectedRoas,
    expectedCpa: template.expectedCpa,
  }

  db.audiences.push(record)
  saveDb(db)
  logFlywheelEvent('audience_created', { templateId, name: template.name, metaId: metaResult.id })

  return record
}

/**
 * Mark an audience as being tested (attached to an ad set).
 */
export function markAudienceInTest(templateId, adSetId) {
  const db = loadDb()
  const audience = db.audiences.find(a => a.templateId === templateId)
  if (!audience) throw new Error(`Audience ${templateId} not found`)

  audience.status = 'testing'
  audience.testStarted = new Date().toISOString()
  audience.adSetId = adSetId
  saveDb(db)
  logFlywheelEvent('audience_test_started', { templateId, adSetId })
  return audience
}

/**
 * Evaluate all audiences in testing — kill or scale based on 7-day performance.
 */
export function evaluateAudiences() {
  const db = loadDb()
  const results = []
  const adSets = getAdSets()

  for (const audience of db.audiences) {
    if (audience.status !== 'testing') continue

    const daysInTest = Math.floor(
      (Date.now() - new Date(audience.testStarted).getTime()) / 86400000
    )

    // Need minimum 3 days before any action, 7 for definitive
    if (daysInTest < 3) {
      results.push({ ...audience, verdict: 'GATHERING', daysInTest, reason: `${3 - daysInTest} more days needed for minimum signal` })
      continue
    }

    // Get performance from snapshots
    const asId = audience.adSetId
    const snapshots = getAdSetSnapshots(asId, daysInTest)
    const totalSpend = snapshots.reduce((a, s) => a + (s.spend || 0), 0)
    const totalPurchases = snapshots.reduce((a, s) => a + (s.purchases || 0), 0)
    const totalRevenue = snapshots.reduce((a, s) => a + (s.revenue || 0), 0)
    const avgFreq = snapshots.length > 0
      ? snapshots.reduce((a, s) => a + (s.frequency || 0), 0) / snapshots.length
      : 0

    const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    audience.performance = {
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalPurchases,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      cpa: Math.round(cpa * 100) / 100,
      roas: Math.round(roas * 100) / 100,
      avgFrequency: Math.round(avgFreq * 10) / 10,
      daysInTest,
      lastUpdated: new Date().toISOString(),
    }

    let verdict, reason

    // Kill rules (3+ days)
    if (totalSpend > 100 && totalPurchases === 0) {
      verdict = 'KILL'
      reason = `$${totalSpend.toFixed(0)} spent, zero purchases in ${daysInTest} days — dead audience`
    } else if (cpa > GRI_ADS.breakevenCPP * 2 && totalPurchases >= 2) {
      verdict = 'KILL'
      reason = `CPA $${cpa.toFixed(0)} is 2x breakeven ($${GRI_ADS.breakevenCPP}) — not viable`
    } else if (avgFreq > 6 && daysInTest >= 5) {
      verdict = 'KILL'
      reason = `Frequency ${avgFreq.toFixed(1)} — audience completely saturated`
    }
    // Scale rules (5+ days)
    else if (daysInTest >= 5 && cpa > 0 && cpa <= GRI_ADS.profitableCPP && totalPurchases >= 3) {
      verdict = 'SCALE'
      reason = `CPA $${cpa.toFixed(0)} below target ($${GRI_ADS.profitableCPP}), ${totalPurchases} purchases, ${roas.toFixed(1)}x ROAS — winner`
    } else if (daysInTest >= 7 && cpa > 0 && cpa <= GRI_ADS.breakevenCPP && totalPurchases >= 2) {
      verdict = 'SCALE'
      reason = `CPA $${cpa.toFixed(0)} below breakeven ($${GRI_ADS.breakevenCPP}) after 7 days — profitable`
    }
    // Watch (still gathering)
    else if (daysInTest < 7) {
      verdict = 'WATCH'
      reason = `Day ${daysInTest}/7 — ${totalPurchases} purchases, CPA $${cpa > 0 ? cpa.toFixed(0) : '∞'}, need more data`
    }
    // 7+ days with borderline data
    else {
      if (totalPurchases === 0) {
        verdict = 'KILL'
        reason = `7+ days, $${totalSpend.toFixed(0)} spent, zero purchases — cut it`
      } else if (cpa > GRI_ADS.breakevenCPP) {
        verdict = 'REDUCE'
        reason = `CPA $${cpa.toFixed(0)} above breakeven after ${daysInTest} days — reduce or replace`
      } else {
        verdict = 'HOLD'
        reason = `CPA $${cpa.toFixed(0)} is OK but not scalable (${totalPurchases} purchases) — hold position`
      }
    }

    audience.verdict = verdict
    results.push({ ...audience, verdict, reason, daysInTest })
  }

  saveDb(db)
  return results
}

/**
 * Execute a kill action on an audience — pause the ad set.
 */
export async function killAudience(templateId) {
  const db = loadDb()
  const audience = db.audiences.find(a => a.templateId === templateId)
  if (!audience) throw new Error(`Audience ${templateId} not found`)

  if (audience.adSetId) {
    await updateAdSetStatus(audience.adSetId, 'PAUSED')
  }

  audience.status = 'killed'
  audience.killedAt = new Date().toISOString()

  db.learnings.push({
    templateId: audience.templateId,
    name: audience.name,
    verdict: 'KILL',
    performance: audience.performance,
    killedAt: new Date().toISOString(),
    reason: audience.verdict === 'KILL' ? 'Automated kill — performance below threshold' : 'Manual kill',
  })

  saveDb(db)
  logFlywheelEvent('audience_killed', { templateId, name: audience.name, performance: audience.performance })
  return audience
}

/**
 * Execute a scale action on an audience — increase budget by 15%.
 */
export async function scaleAudience(templateId) {
  const db = loadDb()
  const audience = db.audiences.find(a => a.templateId === templateId)
  if (!audience || !audience.adSetId) throw new Error(`Audience ${templateId} not found or not in test`)

  const adSets = getAdSets()
  const adSet = adSets.find(a => (a.metaAdSetId || a.id) === audience.adSetId)
  const currentBudget = adSet?.dailyBudget || adSet?.budget || 10
  const newBudget = Math.round(currentBudget * 1.15 * 100) / 100

  await updateAdSetBudget(audience.adSetId, newBudget)

  audience.status = 'scaled'
  audience.scaledAt = new Date().toISOString()
  audience.scaledFrom = currentBudget
  audience.scaledTo = newBudget

  db.learnings.push({
    templateId: audience.templateId,
    name: audience.name,
    verdict: 'SCALE',
    performance: audience.performance,
    scaledAt: new Date().toISOString(),
    budgetChange: { from: currentBudget, to: newBudget },
  })

  saveDb(db)
  logFlywheelEvent('audience_scaled', { templateId, name: audience.name, from: currentBudget, to: newBudget })
  return { audience, previousBudget: currentBudget, newBudget }
}

/**
 * Create a fresh audience set to replace saturated ones.
 * Used by the "Pause & Replace" button.
 */
export async function pauseAndReplaceAudience(adSetId) {
  // 1. Pause the saturated ad set
  await updateAdSetStatus(adSetId, 'PAUSED')

  // 2. Create fresh retargeting audiences
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const results = []

  try {
    // Create the most valuable retargeting audiences
    results.push(await createWebsiteAudience(`Fresh: ATC 7d [${ts}]`, 'AddToCart', 7))
    results.push(await createWebsiteAudience(`Fresh: Visitors 14d [${ts}]`, 'PageView', 14))
    results.push(await createWebsiteAudience(`Fresh: VC 7d no purchase [${ts}]`, 'ViewContent', 7, {
      excludeEvent: 'Purchase', excludeRetentionDays: 30
    }))
  } catch (e) {
    console.error('[AudienceEngine] Replacement audience creation error:', e.message)
    results.push({ error: e.message })
  }

  const db = loadDb()
  db.learnings.push({
    action: 'pause_and_replace',
    pausedAdSetId: adSetId,
    newAudiences: results.filter(r => r.id).map(r => r.id),
    timestamp: new Date().toISOString(),
  })
  saveDb(db)

  logFlywheelEvent('audience_replaced', { pausedAdSetId: adSetId, newAudiences: results.length })

  return {
    paused: adSetId,
    newAudiences: results,
    instruction: 'Fresh audiences created. Attach them to a new ad set in your winning campaign with $10-15/day budget and your best performing creative. The flywheel will evaluate them after 7 days.',
  }
}

/**
 * Get audience learnings — what worked and what didn't.
 */
export function getAudienceLearnings() {
  const db = loadDb()
  return {
    learnings: db.learnings.slice(-20),
    killed: db.audiences.filter(a => a.status === 'killed').length,
    scaled: db.audiences.filter(a => a.status === 'scaled').length,
    testing: db.audiences.filter(a => a.status === 'testing').length,
    total: db.audiences.length,
    winRate: (() => {
      const decided = db.audiences.filter(a => a.status === 'killed' || a.status === 'scaled')
      if (decided.length === 0) return 0
      return Math.round((db.audiences.filter(a => a.status === 'scaled').length / decided.length) * 100)
    })(),
  }
}

/**
 * Get all existing Meta audiences from the account.
 */
export async function getMetaAudiences() {
  return listAudiences()
}

/**
 * Summary of audience engine state for the dashboard.
 */
export function getAudienceEngineSummary() {
  const db = loadDb()
  const templates = getAudienceTemplates()
  const learnings = getAudienceLearnings()

  return {
    templates,
    learnings,
    readyToCreate: templates.filter(t => t.status === 'not_created'),
    inTest: templates.filter(t => t.status === 'testing'),
    winners: templates.filter(t => t.status === 'scaled'),
    killed: templates.filter(t => t.status === 'killed'),
    metaAudienceCount: db.audiences.filter(a => a.metaAudienceId).length,
  }
}
