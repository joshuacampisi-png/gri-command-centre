/**
 * gads-agent-framework-metrics.js
 *
 * Computes the full nCAC / LTGP / CM$ framework for the Google Ads Agent.
 * This is a WIRING module — it does not implement any framework math itself.
 * It imports the existing building blocks from customer-index.js and
 * ads-metrics.js (both built for the Meta Flywheel on 2026-04-04) and
 * produces a single structured object the agent UI and rules engine can
 * render and reason against.
 *
 * Discovery spike findings (2026-04-05) are in
 * memory/project_gads_framework_integration.md. Short version: every
 * calculation exists already, this module just wires it together.
 *
 * Return shape of getFrameworkMetrics():
 *
 * {
 *   window: { days, fromDate, toDate },
 *   customer: { newCount, newRevenue, firstOrderAov, totalUnique,
 *               repeatCustomers, repeatRate, dailyAvgNew },
 *   spend: { google, meta, blended, googleSource, metaSource, dailyAvg },
 *   layer1: {                             // SCOREBOARD (framework priority 1)
 *     cm: { value, status, perDay, note }
 *     costOfDelivery: { total, cogs, paymentFees, shipping }
 *   },
 *   layer3: {                             // CUSTOMER METRICS (priority 1-6)
 *     ncac: { value, status, thresholds, historicalAvg, perDay },
 *     fovCac: { value, status, firstOrderAov, marginApplied },
 *     aMer: { value, status, newCustomerRevenue },
 *     newCustomerCount: { total, dailyAvg, wowChangePct, trend },
 *     ltgpNcac: { pending: true, note }  // cohort tracking = phase 2b
 *   },
 *   gaps: [ ... ]                         // known limitations of this output
 *   computedAt: ISO,
 * }
 */
import { getIndex, getCustomerStats } from './customer-index.js'
import {
  calculateNCAC,
  calculateFOVCAC,
  calculateCM,
  calculateCostOfDelivery,
  calculateAcquisitionMER,
  getNcacThresholds,
  getNcacStatus,
  getFovCacStatus,
  getCmStatus,
  getAcquisitionMerStatus,
  getNewCustomerTrendStatus,
  GRI_ADS,
} from './ads-metrics.js'
import { getAdSetSnapshots } from './flywheel-store.js'
import { getGadsCustomer, microsToDollars } from './gads-client.js'
import { getConfig } from './gads-agent-store.js'

// ── Date helpers ────────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return isoDate(d)
}

function todayIso() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return isoDate(d)
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// ── Blended ad spend (Google + Meta) ────────────────────────────────────────

/**
 * Pull total Google Ads spend across enabled campaigns for the window.
 * Uses the live GAQL API — same path as runFullScan.
 */
async function getGoogleSpend(windowDays) {
  try {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
      SELECT
        campaign.id,
        metrics.cost_micros
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date DURING LAST_${windowDays}_DAYS
    `)
    let total = 0
    for (const r of rows) total += microsToDollars(r.metrics?.cost_micros)
    return { value: round2(total), source: 'google-ads-api' }
  } catch (err) {
    console.error('[GadsFramework] Google spend fetch failed:', err?.errors?.[0]?.message || err.message)
    return { value: 0, source: 'error', error: err.message }
  }
}

/**
 * Pull total Meta Ads spend for the window from the existing Meta Flywheel
 * ad-set snapshots. This is the data that powers the Ads Performance tab.
 *
 * Fallback: if the Flywheel has no snapshots (e.g. Meta sync hasn't run),
 * approximate using GRI_ADS.dailyMetaSpend × windowDays and flag it.
 */
function getMetaSpend(windowDays) {
  try {
    const snapshots = getAdSetSnapshots(null, windowDays)
    if (!snapshots || snapshots.length === 0) {
      return {
        value: round2(GRI_ADS.dailyMetaSpend * windowDays),
        source: 'approximated-from-GRI_ADS-constant',
        note: `No Meta Flywheel snapshots for the last ${windowDays}d — using GRI_ADS.dailyMetaSpend constant`,
      }
    }
    let total = 0
    for (const s of snapshots) total += Number(s.spend) || 0
    return { value: round2(total), source: 'flywheel-adset-snapshots' }
  } catch (err) {
    console.warn('[GadsFramework] Meta spend fetch failed:', err.message)
    return {
      value: round2(GRI_ADS.dailyMetaSpend * windowDays),
      source: 'approximated-from-GRI_ADS-constant',
      error: err.message,
    }
  }
}

// ── Week-over-week new customer trend ───────────────────────────────────────

function computeNewCustomerTrend(index, windowDays) {
  // Compare last 7 days to the 7 days before that
  const thisWeekEnd = todayIso()
  const thisWeekStart = daysAgo(7)
  const lastWeekStart = daysAgo(14)

  const thisWeekCount = Object.values(index).filter(
    e => e.firstOrderDate >= thisWeekStart && e.firstOrderDate <= thisWeekEnd
  ).length

  const lastWeekCount = Object.values(index).filter(
    e => e.firstOrderDate >= lastWeekStart && e.firstOrderDate < thisWeekStart
  ).length

  const wowChangePct = lastWeekCount > 0
    ? ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100
    : 0

  return {
    thisWeek: thisWeekCount,
    lastWeek: lastWeekCount,
    wowChangePct: round2(wowChangePct),
    trend: getNewCustomerTrendStatus(wowChangePct),
  }
}

// ── Historical nCAC baseline (from customer index + ad spend data) ──────────
//
// Framework spec: "Thresholds from YOUR 90-day historical average"
// Current customer index only has ~60 days of data, so we compute what we have
// and flag the shortfall.

async function computeHistoricalNcacBaseline(windowDays = 90) {
  try {
    const index = getIndex()
    const firstDates = Object.values(index).map(e => e.firstOrderDate).filter(Boolean).sort()
    if (firstDates.length === 0) return { historicalAvg: GRI_ADS.ncac, source: 'fallback-constant' }

    const earliestAvailable = firstDates[0]
    const targetFrom = daysAgo(windowDays)
    const actualFrom = earliestAvailable > targetFrom ? earliestAvailable : targetFrom
    const to = todayIso()

    // Count new customers in the window
    const newCustomers = Object.values(index).filter(
      e => e.firstOrderDate >= actualFrom && e.firstOrderDate <= to
    ).length

    if (newCustomers === 0) return { historicalAvg: GRI_ADS.ncac, source: 'fallback-constant' }

    // Ad spend: for the historical baseline we need an approximation because
    // we don't have 90 days of daily spend history in one easy place. Use
    // GRI_ADS.dailyMetaSpend + GRI_ADS.dailyGoogleSpend × days in window.
    const actualDays = Math.max(1, Math.floor((new Date(to) - new Date(actualFrom)) / (1000 * 60 * 60 * 24)))
    const approximateBlendedSpend = (GRI_ADS.dailyMetaSpend + GRI_ADS.dailyGoogleSpend) * actualDays
    const historicalAvg = approximateBlendedSpend / newCustomers

    return {
      historicalAvg: round2(historicalAvg),
      actualDaysAvailable: actualDays,
      windowRequested: windowDays,
      newCustomersInWindow: newCustomers,
      source: actualDays >= windowDays ? 'computed-from-index' : 'computed-from-shorter-window',
      fromDate: actualFrom,
      toDate: to,
    }
  } catch (err) {
    console.warn('[GadsFramework] Historical baseline failed:', err.message)
    return { historicalAvg: GRI_ADS.ncac, source: 'fallback-constant', error: err.message }
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Compute the full framework metrics for the given window.
 * Default 30 days. Single function call, everything wired together.
 *
 * Design note: this function uses the agent's own config for gross margin
 * (currently 47% per Josh's confirmation 2026-04-05) rather than GRI_ADS's
 * stale 0.40 constant. This keeps the Meta Flywheel and Google Ads Agent
 * from drifting apart until the constants are reconciled in one place.
 */
export async function getFrameworkMetrics(windowDays = 30) {
  const cfg = getConfig()
  const grossMarginPct = cfg.grossMarginPct || 0.47 // source of truth: agent config
  const fromDate = daysAgo(windowDays)
  const toDate = todayIso()

  // 1. Customer stats from the live index
  const index = getIndex()
  const stats = getCustomerStats(index, fromDate, toDate)

  // 2. Blended ad spend (Google + Meta)
  const [googleSpendResult, metaSpendResult] = [await getGoogleSpend(windowDays), getMetaSpend(windowDays)]
  const googleSpend = googleSpendResult.value
  const metaSpend = metaSpendResult.value
  const blendedSpend = googleSpend + metaSpend

  // 3. Week-over-week trend for new customers
  const trend = computeNewCustomerTrend(index, windowDays)

  // 4. Historical nCAC baseline for threshold bands
  const historicalBaseline = await computeHistoricalNcacBaseline(90)

  // ── Layer 3: Customer Metrics ─────────────────────────────────────────────

  const ncac = calculateNCAC(blendedSpend, stats.newCustomers)
  const ncacThresholds = getNcacThresholds(historicalBaseline.historicalAvg)
  const ncacStatus = getNcacStatus(ncac, ncacThresholds)

  const fovCac = calculateFOVCAC(stats.firstOrderAov, grossMarginPct, ncac)
  const fovCacStatus = getFovCacStatus(fovCac)

  const aMer = calculateAcquisitionMER(stats.newCustomerRevenue, blendedSpend)
  const aMerStatus = getAcquisitionMerStatus(aMer)

  // ── Layer 1: CM$ scoreboard (using REAL Cost of Delivery) ────────────────
  //
  // calculateCostOfDelivery uses the real framework formula:
  //   cogs = revenue × (1 - grossMargin)
  //   paymentFees = (revenue × paymentRate) + (orderCount × paymentFixed)
  //   shipping = orderCount × shippingCostPerOrder
  //
  // Note: we feed NEW CUSTOMER revenue, not blended revenue. This is the
  // framework-aligned interpretation — Layer 1 CM$ for acquisition activity,
  // not overall business CM$ (which would include returning customers).

  const shippingPlaceholder = 0 // calculateCostOfDelivery computes its own shipping
  const costOfDelivery = calculateCostOfDelivery(
    stats.newCustomerRevenue,
    shippingPlaceholder,
    stats.newCustomers,
    grossMarginPct,
    windowDays
  )

  const cm = calculateCM(stats.newCustomerRevenue, costOfDelivery, blendedSpend)
  const cmStatus = getCmStatus(cm)

  // Break down Cost of Delivery for transparency in the UI
  const cogs = round2(stats.newCustomerRevenue * (1 - grossMarginPct))
  const paymentFees = round2(
    (stats.newCustomerRevenue * GRI_ADS.paymentProcessingRate) +
    (stats.newCustomers * GRI_ADS.paymentProcessingFixed)
  )
  const shipping = round2(stats.newCustomers * GRI_ADS.shippingCostPerOrder)

  // ── Gap notes so the UI can surface caveats ──────────────────────────────

  const gaps = []
  if (historicalBaseline.source === 'fallback-constant') {
    gaps.push({
      severity: 'high',
      area: 'ncac-baseline',
      note: 'Historical nCAC baseline falling back to GRI_ADS.ncac constant — customer index too small for 90d computation.',
    })
  } else if (historicalBaseline.actualDaysAvailable < 90) {
    gaps.push({
      severity: 'medium',
      area: 'ncac-baseline',
      note: `Historical nCAC baseline computed from only ${historicalBaseline.actualDaysAvailable} days of data (framework spec requires 90). Baseline will become more accurate as more history accumulates.`,
    })
  }
  if (metaSpendResult.source.startsWith('approximated')) {
    gaps.push({
      severity: 'medium',
      area: 'meta-spend',
      note: metaSpendResult.note || 'Meta spend approximated from GRI_ADS constant',
    })
  }
  if (grossMarginPct !== GRI_ADS.grossMarginPct) {
    gaps.push({
      severity: 'low',
      area: 'margin-drift',
      note: `Agent config uses grossMarginPct=${grossMarginPct} but ads-metrics.js GRI_ADS.grossMarginPct=${GRI_ADS.grossMarginPct}. Reconcile when convenient.`,
    })
  }
  gaps.push({
    severity: 'low',
    area: 'ltgp-cohorts',
    note: 'LTGP:nCAC cohort tracking (30/60/90/180/365d windows) not yet implemented. Requires monthly cohort grouping — phase 2b build.',
  })

  return {
    window: {
      days: windowDays,
      fromDate,
      toDate,
    },
    customer: {
      newCount: stats.newCustomers,
      newRevenue: round2(stats.newCustomerRevenue),
      firstOrderAov: round2(stats.firstOrderAov),
      totalUnique: stats.totalCustomers,
      repeatCustomers: stats.repeatCustomers,
      repeatRate: round2(stats.repeatRate * 100), // as percentage
      dailyAvgNew: round2(stats.newCustomers / windowDays),
    },
    spend: {
      google: googleSpend,
      meta: metaSpend,
      blended: round2(blendedSpend),
      googleSource: googleSpendResult.source,
      metaSource: metaSpendResult.source,
      dailyAvg: round2(blendedSpend / windowDays),
    },
    layer1: {
      cm: {
        value: round2(cm),
        status: cmStatus,
        perDay: round2(cm / windowDays),
        note: 'Layer 1 scoreboard — Net New-Customer Sales minus Cost of Delivery minus Blended Ad Spend. This IS the bottom line.',
      },
      costOfDelivery: {
        total: round2(costOfDelivery),
        cogs,
        paymentFees,
        shipping,
      },
    },
    layer3: {
      ncac: {
        value: round2(ncac),
        status: ncacStatus,
        thresholds: {
          green: round2(ncacThresholds.green),
          amber: round2(ncacThresholds.amber),
          red: round2(ncacThresholds.red),
        },
        historicalAvg: round2(historicalBaseline.historicalAvg),
        historicalSource: historicalBaseline.source,
        perDay: round2(ncac),
      },
      fovCac: {
        value: round2(fovCac),
        status: fovCacStatus,
        firstOrderAov: round2(stats.firstOrderAov),
        marginApplied: grossMarginPct,
        note: `First-order gross profit (FOV × margin) compared to nCAC. <1.0x for 3+ days = framework PAUSE gate.`,
      },
      aMer: {
        value: round2(aMer),
        status: aMerStatus,
        newCustomerRevenue: round2(stats.newCustomerRevenue),
        note: 'Isolates acquisition activity. If aMER << overall MER, ads are re-converting existing customers not acquiring new.',
      },
      newCustomerCount: {
        total: stats.newCustomers,
        dailyAvg: round2(stats.newCustomers / windowDays),
        thisWeek: trend.thisWeek,
        lastWeek: trend.lastWeek,
        wowChangePct: trend.wowChangePct,
        trend: trend.trend,
      },
      ltgpNcac: {
        pending: true,
        note: 'Cohort tracking not yet built. Phase 2b delivery after this thin slice is verified.',
      },
    },
    config: {
      grossMarginPct,
      grossMarginSource: 'agent-config',
      windowDays,
    },
    gaps,
    computedAt: new Date().toISOString(),
  }
}
