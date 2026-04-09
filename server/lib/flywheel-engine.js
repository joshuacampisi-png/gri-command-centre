/**
 * flywheel-engine.js
 * Core intelligence engine for the Ads Flywheel.
 * Kill rules, scale rules, AOV intelligence, product categorisation.
 * All dollar values in AUD. All dates in Australia/Brisbane timezone.
 */
import {
  getAdSnapshots, getAdSetSnapshots, getConversions, getCpaTargets,
  addKillEvent, addScaleEvent, addAlert, getAds, getAdSets,
  upsertAovIntel, logFlywheelEvent, getAlerts
} from './flywheel-store.js'

// ── System Constants ────────────────────────────────────────────────────────

export const FLYWHEEL = {
  // Kill thresholds
  CPA_BREACH_MULTIPLIER: 2.5,
  CPA_BREACH_CONSECUTIVE_DAYS: 3,
  ROAS_KILL_FLOOR: 1.2,
  FREQUENCY_KILL_COLD: 6,
  FREQUENCY_KILL_WARM: 4,
  CTR_DROP_KILL_PCT: 0.40,
  ZERO_PURCHASE_SPEND_MULTIPLIER: 2,
  CPM_SPIKE_PCT: 0.30,

  // Scale thresholds
  ROAS_SCALE_CONSECUTIVE_DAYS: 5,
  FREQUENCY_SCALE_CEILING: 2.5,
  LEARNING_PHASE_MIN_EVENTS: 50,

  // Budget scaling
  BUDGET_SCALE_INCREMENT: 0.15, // 15% per edit, stays under Meta's 20% limit
  BUDGET_SCALE_DAYS_BETWEEN: 3,

  // AOV targets
  AOV_TARGET: 130,
  BUNDLE_RATE_MIN: 0.30,

  // Creative metrics benchmarks
  THUMBSTOP_BENCHMARK: 0.25,
  FREQUENCY_FATIGUE_WARNING: 3.5,
  FREQUENCY_FATIGUE_CRITICAL: 5.0,

  // ROAS targets by campaign type
  ROAS_TARGET_COLD: 3.0,
  ROAS_TARGET_RETARGETING: 5.0,
  ROAS_TARGET_ASC: 3.5,
  ROAS_TARGET_BLENDED: 2.50, // breakeven at 40% margin

  // Meta API rate safety
  META_SYNC_INTERVAL_HOURS: 6,

  // GRI business metrics
  GROSS_MARGIN_PCT: 0.40,
  CURRENT_AOV: 126.86,
}

// ── Product Categorisation ──────────────────────────────────────────────────

const PRODUCT_CATEGORIES = {
  'mega blaster':     'cannon',
  'mini blaster':     'cannon',
  'tnt cannon':       'cannon',
  'cannon':           'cannon',
  'blaster':          'cannon',
  'smoke bomb':       'smoke',
  'smoke grenade':    'smoke',
  'smoke':            'smoke',
  'bio cannon':       'cannon',
  'bio-cannon':       'cannon',
  'volcano':          'cannon',
  'basketball':       'accessory',
  'golf ball':        'accessory',
  'balloon':          'accessory',
  'confetti':         'accessory',
  'bundle':           'bundle_full',
  'ultimate':         'bundle_full',
  'starter':          'bundle_starter',
  'party pack':       'bundle_full',
  'hire':             'hire',
  'rental':           'hire',
  'sticker':          'accessory',
  'scratch card':     'accessory',
  'voting card':      'accessory',
}

export function categoriseProduct(title) {
  const lower = (title || '').toLowerCase()
  for (const [keyword, category] of Object.entries(PRODUCT_CATEGORIES)) {
    if (lower.includes(keyword)) return category
  }
  return 'accessory'
}

export function detectBundle(lineItems) {
  if (!lineItems || lineItems.length <= 1) return false
  const categories = new Set(lineItems.map(i => categoriseProduct(i.title || i.name)))
  return categories.size >= 2
}

// ── Kill Rules ──────────────────────────────────────────────────────────────

export async function evaluateKillRules() {
  const ads = getAds().filter(a => a.status === 'ACTIVE')
  const adSets = getAdSets().filter(a => a.status === 'ACTIVE')
  const cpaTargets = getCpaTargets()
  const results = []

  for (const ad of ads) {
    const snapshots = getAdSnapshots(ad.metaAdId || ad.id, 14)
    // Require minimum 7 days of data before making any kill decisions.
    // Ads need a week to exit learning phase and stabilise.
    if (snapshots.length < 7) continue

    // Get the CPA target for this ad's category (or blended)
    const target = cpaTargets[ad.productCategory || 'blended'] || cpaTargets.blended

    // Weekly aggregates — this is how we evaluate, not daily noise
    const last7 = snapshots.slice(-7)
    const weekSpend = last7.reduce((a, s) => a + (s.spend || 0), 0)
    const weekPurchases = last7.reduce((a, s) => a + (s.purchases || 0), 0)
    const weekImpressions = last7.reduce((a, s) => a + (s.impressions || 0), 0)

    // Skip ads with negligible spend — not enough data to judge
    if (weekSpend < 30 || weekImpressions < 500) continue

    const weekCpa = weekPurchases > 0 ? weekSpend / weekPurchases : 0
    const weekRoas = weekSpend > 0 ? last7.reduce((a, s) => a + (s.revenue || 0), 0) / weekSpend : 0

    // Rule 1: Weekly CPA exceeds 2.5x target AND ROAS below 1.2 over the full 7 days
    if (weekPurchases > 0 && weekCpa > target.max && weekRoas < FLYWHEEL.ROAS_KILL_FLOOR) {
      const event = {
        entityType: 'ad',
        entityId: ad.metaAdId || ad.id,
        entityName: ad.name,
        ruleType: 'cpa_breach_weekly',
        ruleDetail: `7-day CPA $${weekCpa.toFixed(2)} exceeds max $${target.max.toFixed(2)}. ROAS: ${weekRoas.toFixed(2)}x. Spend: $${weekSpend.toFixed(0)}.`,
        triggered: true,
        actioned: false,
      }
      addKillEvent(event)
      addAlert({
        type: 'kill_rule',
        severity: 'critical',
        title: `Kill signal: ${ad.name}`,
        body: event.ruleDetail + ` Recommendation: pause this ad.`,
        entityType: 'ad',
        entityId: ad.metaAdId || ad.id,
        entityName: ad.name,
        adSetId: ad.adSetId || '',
        campaignId: ad.campaignId || '',
      })
      results.push(event)
      logFlywheelEvent('kill_rule', `Weekly CPA breach on ${ad.name}: ${event.ruleDetail}`)
    }

    // Rule 2: CTR trending down — compare last 3 days avg vs prior 4 days avg (week-over-week)
    // Only fires with 7+ days of data and minimum 1000 impressions per period
    if (snapshots.length >= 7) {
      const prior4 = snapshots.slice(-7, -3)
      const recent3 = snapshots.slice(-3)

      const priorImpr = prior4.reduce((a, s) => a + (s.impressions || 0), 0)
      const recentImpr = recent3.reduce((a, s) => a + (s.impressions || 0), 0)

      // Need meaningful impression volume in both periods
      if (priorImpr >= 500 && recentImpr >= 300) {
        const priorClicks = prior4.reduce((a, s) => a + (s.clicks || 0), 0)
        const recentClicks = recent3.reduce((a, s) => a + (s.clicks || 0), 0)
        const priorCtr = priorImpr > 0 ? priorClicks / priorImpr : 0
        const recentCtr = recentImpr > 0 ? recentClicks / recentImpr : 0

        if (priorCtr > 0 && recentCtr < priorCtr * (1 - FLYWHEEL.CTR_DROP_KILL_PCT)) {
          const dropPct = ((priorCtr - recentCtr) / priorCtr * 100).toFixed(0)
          const event = {
            entityType: 'ad',
            entityId: ad.metaAdId || ad.id,
            entityName: ad.name,
            ruleType: 'ctr_drop_weekly',
            ruleDetail: `CTR dropped ${dropPct}% over the week: prior 4d avg ${(priorCtr * 100).toFixed(2)}% → recent 3d avg ${(recentCtr * 100).toFixed(2)}%`,
            triggered: true,
            actioned: false,
          }
          addKillEvent(event)
          addAlert({
            type: 'kill_rule',
            severity: 'critical',
            title: `Creative fatigue: ${ad.name}`,
            body: event.ruleDetail + `. Creative is losing audience attention. Rotate or pause.`,
            entityType: 'ad',
            entityId: ad.metaAdId || ad.id,
            entityName: ad.name,
            adSetId: ad.adSetId || '',
            campaignId: ad.campaignId || '',
          })
          results.push(event)
          logFlywheelEvent('kill_rule', `Weekly CTR drop on ${ad.name}: ${event.ruleDetail}`)
        }
      }
    }

    // Rule 3: Zero purchases over 7 days with spend exceeding 2x CPA target
    if (weekPurchases === 0 && weekSpend > target.target * FLYWHEEL.ZERO_PURCHASE_SPEND_MULTIPLIER) {
      const event = {
        entityType: 'ad',
        entityId: ad.metaAdId || ad.id,
        entityName: ad.name,
        ruleType: 'zero_purchase_weekly',
        ruleDetail: `Spent $${weekSpend.toFixed(2)} with zero purchases over 7 days. Target CPA is $${target.target.toFixed(2)}.`,
        triggered: true,
        actioned: false,
      }
      addKillEvent(event)
      addAlert({
        type: 'kill_rule',
        severity: 'critical',
        title: `No conversions: ${ad.name}`,
        body: event.ruleDetail + ` Review or pause.`,
        entityType: 'ad',
        entityId: ad.metaAdId || ad.id,
        entityName: ad.name,
        adSetId: ad.adSetId || '',
        campaignId: ad.campaignId || '',
      })
      results.push(event)
      logFlywheelEvent('kill_rule', `Zero purchase weekly alert on ${ad.name}: ${event.ruleDetail}`)
    }
  }

  // AdSet level rules
  for (const adSet of adSets) {
    const snapshots = getAdSetSnapshots(adSet.metaAdSetId || adSet.id, 14)
    if (snapshots.length < 7) continue

    const audience = adSet.audience || 'cold_broad'
    const freqLimit = ['cold_broad', 'lookalike'].includes(audience)
      ? FLYWHEEL.FREQUENCY_KILL_COLD
      : FLYWHEEL.FREQUENCY_KILL_WARM

    // Rule 4: Frequency exceeds limit on cold/broad audience
    const last7 = snapshots.slice(-7)
    const avgFreq = last7.reduce((a, s) => a + (s.frequency || 0), 0) / last7.length
    if (avgFreq > freqLimit) {
      const event = {
        entityType: 'ad_set',
        entityId: adSet.metaAdSetId || adSet.id,
        entityName: adSet.name,
        ruleType: 'frequency_breach',
        ruleDetail: `7 day avg frequency ${avgFreq.toFixed(1)} exceeds ${freqLimit} for ${audience} audience`,
        triggered: true,
        actioned: false,
      }
      addKillEvent(event)
      addAlert({
        type: 'kill_rule',
        severity: 'critical',
        title: `Audience saturated: ${adSet.name}`,
        body: event.ruleDetail + `. Audience is exhausted. New creative or new audience needed.`,
        entityType: 'ad_set',
        entityId: adSet.metaAdSetId || adSet.id,
        entityName: adSet.name,
      })
      results.push(event)
      logFlywheelEvent('kill_rule', `Frequency breach on ${adSet.name}: ${event.ruleDetail}`)
    }

    // Rule 5: CPM rising 30% WoW with flat CTR — audience saturation
    if (snapshots.length >= 14) {
      const prevWeek = snapshots.slice(-14, -7)
      const thisWeek = snapshots.slice(-7)
      const prevCpm = prevWeek.reduce((a, s) => a + (s.cpm || 0), 0) / prevWeek.length
      const thisCpm = thisWeek.reduce((a, s) => a + (s.cpm || 0), 0) / thisWeek.length
      const prevCtr = prevWeek.reduce((a, s) => a + (s.ctr || 0), 0) / prevWeek.length
      const thisCtr = thisWeek.reduce((a, s) => a + (s.ctr || 0), 0) / thisWeek.length

      if (prevCpm > 0 && thisCpm > prevCpm * (1 + FLYWHEEL.CPM_SPIKE_PCT)) {
        const ctrFlat = Math.abs(thisCtr - prevCtr) < 0.002
        if (ctrFlat) {
          const event = {
            entityType: 'ad_set',
            entityId: adSet.metaAdSetId || adSet.id,
            entityName: adSet.name,
            ruleType: 'cpm_spike_30pct',
            ruleDetail: `CPM rose ${((thisCpm - prevCpm) / prevCpm * 100).toFixed(0)}% WoW ($${prevCpm.toFixed(2)} to $${thisCpm.toFixed(2)}) with flat CTR. Audience saturation.`,
            triggered: true,
            actioned: false,
          }
          addKillEvent(event)
          addAlert({
            type: 'fatigue',
            severity: 'warning',
            title: `CPM rising: ${adSet.name}`,
            body: event.ruleDetail,
            entityType: 'ad_set',
            entityId: adSet.metaAdSetId || adSet.id,
            entityName: adSet.name,
          })
          results.push(event)
          logFlywheelEvent('kill_rule', `CPM spike on ${adSet.name}: ${event.ruleDetail}`)
        }
      }
    }
  }

  return results
}

// ── Scale Rules ─────────────────────────────────────────────────────────────

export async function evaluateScaleRules() {
  const adSets = getAdSets().filter(a => a.status === 'ACTIVE')
  const results = []

  for (const adSet of adSets) {
    const snapshots = getAdSetSnapshots(adSet.metaAdSetId || adSet.id, 14)
    if (snapshots.length < 5) continue

    const last5 = snapshots.slice(-5)
    const avgRoas = last5.reduce((a, s) => a + (s.roas || 0), 0) / last5.length
    const avgFreq = last5.reduce((a, s) => a + (s.frequency || 0), 0) / last5.length
    const totalPurchases = snapshots.reduce((a, s) => a + (s.purchases || 0), 0)

    // Scale rule 1: ROAS exceeded target for 5+ days AND frequency below 2.5
    const roasTarget = FLYWHEEL.ROAS_TARGET_COLD
    const allGood = last5.every(s => (s.roas || 0) > roasTarget && (s.frequency || 0) < FLYWHEEL.FREQUENCY_SCALE_CEILING)

    if (allGood) {
      const currentBudget = adSet.budget || adSet.dailyBudget || 0
      const newBudget = currentBudget * (1 + FLYWHEEL.BUDGET_SCALE_INCREMENT)

      const event = {
        entityType: 'ad_set',
        entityId: adSet.metaAdSetId || adSet.id,
        entityName: adSet.name,
        ruleType: 'roas_exceed_5day',
        ruleDetail: `5 day avg ROAS ${avgRoas.toFixed(2)} exceeds ${roasTarget}. Frequency ${avgFreq.toFixed(1)} is safe.`,
        action: `Increase budget from $${currentBudget.toFixed(2)} to $${newBudget.toFixed(2)} (15% increment)`,
        currentBudget,
        recommendedBudget: newBudget,
      }
      addScaleEvent(event)
      addAlert({
        type: 'scale_opportunity',
        severity: 'info',
        title: `Scale ready: ${adSet.name}`,
        body: `${event.ruleDetail} Recommended: increase daily budget from $${currentBudget.toFixed(2)} to $${newBudget.toFixed(2)}.`,
        entityType: 'ad_set',
        entityId: adSet.metaAdSetId || adSet.id,
        entityName: adSet.name,
      })
      results.push(event)
      logFlywheelEvent('scale_ready', `${adSet.name} is ready to scale: ${event.action}`)
    }

    // Scale rule 2: Learning complete (50+ purchases) AND CPA within target
    if (totalPurchases >= FLYWHEEL.LEARNING_PHASE_MIN_EVENTS) {
      const cpaTargets = getCpaTargets()
      const target = cpaTargets.blended
      const recentCpa = last5.reduce((a, s) => a + (s.cpa || 0), 0) / last5.length

      if (recentCpa <= target.max && recentCpa > 0) {
        const existing = getAlerts(true).find(a =>
          a.entityId === (adSet.metaAdSetId || adSet.id) && a.type === 'scale_opportunity'
        )
        if (!existing) {
          addAlert({
            type: 'scale_opportunity',
            severity: 'info',
            title: `Learning complete: ${adSet.name}`,
            body: `${totalPurchases} purchase events. CPA $${recentCpa.toFixed(2)} is within target $${target.max.toFixed(2)}. Safe to scale.`,
            entityType: 'ad_set',
            entityId: adSet.metaAdSetId || adSet.id,
            entityName: adSet.name,
          })
          logFlywheelEvent('learning_complete', `${adSet.name} has ${totalPurchases} conversions, CPA on target`)
        }
      }
    }
  }

  return results
}

// ── AOV Intelligence ────────────────────────────────────────────────────────

export function calculateAovIntelligence() {
  const conversions = getConversions(30)
  if (conversions.length === 0) return null

  const aovs = conversions.map(c => c.aov).filter(a => a > 0)
  const sorted = [...aovs].sort((a, b) => a - b)
  const avgAov = aovs.reduce((a, b) => a + b, 0) / aovs.length
  const medianAov = sorted[Math.floor(sorted.length / 2)] || 0
  const aovOver100 = aovs.filter(a => a >= 100).length
  const aovOver160 = aovs.filter(a => a >= FLYWHEEL.AOV_TARGET).length

  // Bundle analysis
  const bundleOrders = conversions.filter(c => c.bundleDetected)
  const bundleRate = conversions.length > 0 ? bundleOrders.length / conversions.length : 0

  // Product combination analysis
  const comboCounts = {}
  for (const conv of conversions) {
    if (conv.products && conv.products.length >= 2) {
      const cats = conv.products.map(p => categoriseProduct(p.title || p.name)).sort().join(' + ')
      comboCounts[cats] = (comboCounts[cats] || 0) + 1
    }
  }
  const topCombos = Object.entries(comboCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([combo, count]) => ({ combo, count, pctOfOrders: (count / conversions.length * 100).toFixed(1) }))

  // Creative angle analysis (which angles drive highest AOV)
  const angleAovs = {}
  for (const conv of conversions) {
    if (conv.creativeAngle) {
      if (!angleAovs[conv.creativeAngle]) angleAovs[conv.creativeAngle] = []
      angleAovs[conv.creativeAngle].push(conv.aov)
    }
  }
  const topAngleForAov = Object.entries(angleAovs)
    .map(([angle, values]) => ({
      angle,
      avgAov: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    }))
    .sort((a, b) => b.avgAov - a.avgAov)

  // AOV distribution by day
  const dailyAov = {}
  for (const conv of conversions) {
    const day = conv.orderedAt.split('T')[0]
    if (!dailyAov[day]) dailyAov[day] = []
    dailyAov[day].push(conv.aov)
  }
  const dailyAvgAov = Object.entries(dailyAov)
    .map(([date, values]) => ({
      date,
      avgAov: values.reduce((a, b) => a + b, 0) / values.length,
      orders: values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const today = new Date().toISOString().split('T')[0]
  const intel = {
    date: today,
    avgAov: Math.round(avgAov * 100) / 100,
    medianAov: Math.round(medianAov * 100) / 100,
    aovOver100,
    aovOver160,
    totalOrders: conversions.length,
    bundleRate: Math.round(bundleRate * 1000) / 10,
    bundleCount: bundleOrders.length,
    topCombos,
    topAngleForAov: topAngleForAov[0]?.angle || null,
    angleBreakdown: topAngleForAov,
    dailyAvgAov,
    gapToTarget: Math.round((FLYWHEEL.AOV_TARGET - avgAov) * 100) / 100,
    singleItemRate: conversions.length > 0
      ? Math.round((conversions.filter(c => !c.bundleDetected).length / conversions.length) * 1000) / 10
      : 0,
  }

  upsertAovIntel(intel)

  // Trigger alerts if bundle rate is low
  if (bundleRate < FLYWHEEL.BUNDLE_RATE_MIN && conversions.length >= 10) {
    addAlert({
      type: 'learning_reset',
      severity: 'warning',
      title: `Low bundle rate: ${(bundleRate * 100).toFixed(0)}%`,
      body: `Only ${(bundleRate * 100).toFixed(0)}% of orders contain multiple product categories. Target is ${FLYWHEEL.BUNDLE_RATE_MIN * 100}%. Creative needs to push bundle messaging harder.`,
    })
    logFlywheelEvent('aov_alert', `Bundle rate ${(bundleRate * 100).toFixed(0)}% is below ${FLYWHEEL.BUNDLE_RATE_MIN * 100}% target`)
  }

  // Alert if AOV is trending up toward target
  if (aovOver160 > 0 && dailyAvgAov.length >= 7) {
    const recentWeek = dailyAvgAov.slice(-7)
    const prevWeek = dailyAvgAov.slice(-14, -7)
    if (prevWeek.length >= 3) {
      const recentAvg = recentWeek.reduce((a, d) => a + d.avgAov, 0) / recentWeek.length
      const prevAvg = prevWeek.reduce((a, d) => a + d.avgAov, 0) / prevWeek.length
      if (recentAvg > prevAvg) {
        logFlywheelEvent('aov_win', `AOV trending up: $${prevAvg.toFixed(2)} last week to $${recentAvg.toFixed(2)} this week. ${aovOver160} orders above $${FLYWHEEL.AOV_TARGET}.`)
      }
    }
  }

  return intel
}

// ── Campaign Health Scoring ─────────────────────────────────────────────────

export function scoreCampaignHealth(campaign) {
  const snapshots = getAdSetSnapshots(null, 7)
  const campaignSnapshots = snapshots.filter(s => s.campaignId === (campaign.metaCampaignId || campaign.id))

  if (campaignSnapshots.length === 0) {
    return { score: 50, status: 'NO_DATA', reasons: ['No snapshot data yet'] }
  }

  let score = 100
  const reasons = []
  const cpaTargets = getCpaTargets()
  const target = cpaTargets.blended

  // Calculate averages
  const totalSpend = campaignSnapshots.reduce((a, s) => a + (s.spend || 0), 0)
  const totalPurchases = campaignSnapshots.reduce((a, s) => a + (s.purchases || 0), 0)
  const totalRevenue = campaignSnapshots.reduce((a, s) => a + (s.revenue || 0), 0)
  const avgFrequency = campaignSnapshots.reduce((a, s) => a + (s.frequency || 0), 0) / campaignSnapshots.length
  const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

  // ROAS scoring
  if (roas >= FLYWHEEL.ROAS_TARGET_COLD * 1.5) { reasons.push(`Strong ROAS: ${roas.toFixed(2)}`) }
  else if (roas >= FLYWHEEL.ROAS_TARGET_COLD) { score -= 10; reasons.push(`ROAS on target: ${roas.toFixed(2)}`) }
  else if (roas >= FLYWHEEL.ROAS_KILL_FLOOR) { score -= 30; reasons.push(`ROAS below target: ${roas.toFixed(2)}`) }
  else if (roas > 0) { score -= 50; reasons.push(`ROAS critical: ${roas.toFixed(2)}`) }
  else { score -= 40; reasons.push('No revenue data') }

  // CPA scoring
  if (cpa > 0 && cpa <= target.target) { reasons.push(`CPA on target: $${cpa.toFixed(2)}`) }
  else if (cpa > target.target && cpa <= target.max) { score -= 20; reasons.push(`CPA above target: $${cpa.toFixed(2)}`) }
  else if (cpa > target.max) { score -= 40; reasons.push(`CPA critical: $${cpa.toFixed(2)}`) }

  // Frequency scoring
  if (avgFrequency > FLYWHEEL.FREQUENCY_FATIGUE_CRITICAL) { score -= 30; reasons.push(`Frequency critical: ${avgFrequency.toFixed(1)}`) }
  else if (avgFrequency > FLYWHEEL.FREQUENCY_FATIGUE_WARNING) { score -= 15; reasons.push(`Frequency rising: ${avgFrequency.toFixed(1)}`) }

  // Determine status
  let status = 'HEALTHY'
  if (score >= 85) status = 'SCALE_READY'
  else if (score >= 60) status = 'HEALTHY'
  else if (score >= 40) status = 'WATCH'
  else status = 'KILL_SIGNAL'

  return {
    score: Math.max(0, score),
    status,
    reasons,
    metrics: { spend: totalSpend, purchases: totalPurchases, revenue: totalRevenue, cpa, roas, frequency: avgFrequency },
  }
}

// ── Creative Leaderboard ────────────────────────────────────────────────────

export function getCreativeLeaderboard() {
  const ads = getAds()
  const allSnapshots = getAdSnapshots(null, 7)
  const conversions = getConversions(7)

  return ads.map(ad => {
    const adId = ad.metaAdId || ad.id
    const snaps = allSnapshots.filter(s => s.adId === adId)
    if (snaps.length === 0) return null

    const totalSpend = snaps.reduce((a, s) => a + (s.spend || 0), 0)
    const totalPurchases = snaps.reduce((a, s) => a + (s.purchases || 0), 0)
    const totalRevenue = snaps.reduce((a, s) => a + (s.revenue || 0), 0)
    const avgFrequency = snaps.reduce((a, s) => a + (s.frequency || 0), 0) / snaps.length
    const avgThumbstop = snaps.reduce((a, s) => a + (s.thumbstopRate || 0), 0) / snaps.length
    const avgSustain = snaps.reduce((a, s) => a + (s.sustainRate || 0), 0) / snaps.length

    // Get AOV from conversions attributed to this ad
    const adConversions = conversions.filter(c => c.adId === adId || c.utmContent === adId)
    const avgAov = adConversions.length > 0
      ? adConversions.reduce((a, c) => a + c.aov, 0) / adConversions.length
      : 0

    const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    let status = 'active'
    if (avgFrequency > FLYWHEEL.FREQUENCY_FATIGUE_CRITICAL) status = 'fatigued'
    else if (avgFrequency > FLYWHEEL.FREQUENCY_FATIGUE_WARNING) status = 'watch'
    if (roas > FLYWHEEL.ROAS_TARGET_COLD * 1.5) status = 'winner'

    return {
      adId,
      name: ad.name,
      creativeAngle: ad.creativeAngle || 'unknown',
      formatType: ad.formatType || 'unknown',
      thumbstopPct: Math.round(avgThumbstop * 10000) / 100,
      sustainPct: Math.round(avgSustain * 10000) / 100,
      roas7d: Math.round(roas * 100) / 100,
      cpa7d: Math.round(cpa * 100) / 100,
      avgAov: Math.round(avgAov * 100) / 100,
      frequency: Math.round(avgFrequency * 10) / 10,
      spend: Math.round(totalSpend * 100) / 100,
      purchases: totalPurchases,
      status,
    }
  }).filter(Boolean).sort((a, b) => b.roas7d - a.roas7d)
}

// ── Summary Metrics ─────────────────────────────────────────────────────────

export function getFlywheelSummary() {
  const todaySnapshots = getAdSnapshots(null, 1)
  const weekSnapshots = getAdSnapshots(null, 7)
  const yesterdaySnapshots = getAdSnapshots(null, 2).filter(s => {
    const d = new Date(s.date)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return d.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]
  })
  const conversions7d = getConversions(7)
  const conversions1d = getConversions(1)
  const cpaTargets = getCpaTargets()

  const todaySpend = todaySnapshots.reduce((a, s) => a + (s.spend || 0), 0)
  const yesterdaySpend = yesterdaySnapshots.reduce((a, s) => a + (s.spend || 0), 0)

  const weekSpend = weekSnapshots.reduce((a, s) => a + (s.spend || 0), 0)
  const weekRevenue = weekSnapshots.reduce((a, s) => a + (s.revenue || 0), 0)
  const weekPurchases = weekSnapshots.reduce((a, s) => a + (s.purchases || 0), 0)
  const weekRoas = weekSpend > 0 ? weekRevenue / weekSpend : 0
  const weekCpa = weekPurchases > 0 ? weekSpend / weekPurchases : 0

  const aovValues = conversions7d.map(c => c.aov).filter(a => a > 0)
  const avgAov7d = aovValues.length > 0 ? aovValues.reduce((a, b) => a + b, 0) / aovValues.length : 0

  return {
    todaySpend: Math.round(todaySpend * 100) / 100,
    yesterdaySpend: Math.round(yesterdaySpend * 100) / 100,
    spendDelta: yesterdaySpend > 0 ? Math.round((todaySpend - yesterdaySpend) / yesterdaySpend * 10000) / 100 : 0,
    weekRoas: Math.round(weekRoas * 100) / 100,
    weekCpa: Math.round(weekCpa * 100) / 100,
    cpaTarget: cpaTargets.blended.target,
    cpaVsTarget: weekCpa > 0 ? Math.round((weekCpa - cpaTargets.blended.target) * 100) / 100 : 0,
    avgAov7d: Math.round(avgAov7d * 100) / 100,
    aovVsTarget: Math.round((avgAov7d - FLYWHEEL.AOV_TARGET) * 100) / 100,
    weekSpend: Math.round(weekSpend * 100) / 100,
    weekRevenue: Math.round(weekRevenue * 100) / 100,
    weekPurchases,
    ordersToday: conversions1d.length,
    bundleRate7d: conversions7d.length > 0
      ? Math.round(conversions7d.filter(c => c.bundleDetected).length / conversions7d.length * 1000) / 10
      : 0,
  }
}
