/**
 * finance-engine.js
 *
 * Aggregation engine behind the Finance tab. Builds the full business-health
 * picture from LIVE sources (feedback rule: live API on demand, 5-min TTL,
 * every payload carries dataFetchedAt):
 *
 *   - Shopify orders (25 months — monthly series, YoY, customer metrics)
 *   - Meta ad spend (Graph API, daily granularity)
 *   - Google ad spend (Google Ads API, daily granularity)
 *   - Fixed outgoings + model settings from finance-config.js
 *
 * Money model (layered):
 *   1. Contribution Margin = Net Sales − Cost of Delivery − Ad Spend
 *      where CoD applies the blended margin to PRODUCT revenue only —
 *      hire revenue (TNT + balloon boxes) carries 100% margin (no COGS),
 *      per Josh 2026-07-13. Payment processing applies to all revenue;
 *      shipping cost applies to product (shipped) orders only.
 *   2. − Shopify Capital remittance (25% of revenue until loan cleared)
 *   3. − Tax provision (5% of revenue)
 *   4. − Fixed outgoings (wages, rent, accountant, etc.)
 *   5. = Net position — the real health number.
 *
 * Caching:
 *   - Closed months (orders + ad spend) are immutable → cached on disk in
 *     data/finance/. Fetched from APIs once, then reused forever.
 *   - Current month → in-memory 5-min TTL.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { getShopifyOrdersRange } from '../connectors/shopify.js'
import { fetchAccountSpendByDay } from './meta-api.js'
import { fetchGoogleSpendByDayRange } from './gads-live-spend.js'
import { GRI_ADS, calculateCM, calculateAcquisitionMER, calculateFOVCAC } from './ads-metrics.js'
import { getFinanceConfig, fixedTotalMonthly, monthlyAmount } from './finance-config.js'
import { dataFile, dataDir } from './data-dir.js'
import { createHash } from 'crypto'

dataDir('finance')

const TTL_MS = 5 * 60 * 1000
let _summaryCache = null // { t, v }

// ── Date helpers (Australia/Brisbane, UTC+10, no DST) ──────────────────────

const BRIS_OFFSET_MS = 10 * 60 * 60 * 1000

function brisbaneNow() {
  return new Date(Date.now() + BRIS_OFFSET_MS)
}

/** 'YYYY-MM-DD' in Brisbane time for a given ISO timestamp. */
function brisDate(iso) {
  return new Date(new Date(iso).getTime() + BRIS_OFFSET_MS).toISOString().slice(0, 10)
}

function monthKey(dateStr) { return dateStr.slice(0, 7) }

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** List of 'YYYY-MM' strings, oldest first, ending at the current month. */
function lastNMonths(n) {
  const now = brisbaneNow()
  let y = now.getUTCFullYear()
  let m = now.getUTCMonth() + 1
  const out = []
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m--
    if (m === 0) { m = 12; y-- }
  }
  return out
}

function monthBounds(ym) {
  return { from: `${ym}-01`, to: `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}` }
}

function hashEmail(email) {
  return createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex')
}

function pctDelta(now, then) {
  if (!then || then === 0) return null
  return Math.round(((now - then) / Math.abs(then)) * 1000) / 10
}

function r2(n) { return Math.round(n * 100) / 100 }
function r0(n) { return Math.round(n) }

// ── Disk caches for closed months ───────────────────────────────────────────

function loadJson(path) {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function saveJson(path, data) {
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data))
  renameSync(tmp, path)
}

/**
 * Compact orders for one month: [{ d(date), e(hashedEmail), t(total),
 * h(hireRevenue), p(productRevenue) }]. Closed months read from disk cache.
 */
async function getMonthOrders(ym, currentYm) {
  const cachePath = dataFile(`finance/orders-${ym}.json`)
  if (ym !== currentYm) {
    const cached = loadJson(cachePath)
    if (cached) return cached
  }
  const { from, to } = monthBounds(ym)
  const res = await getShopifyOrdersRange(from, to, { includeOrderDetails: true })
  if (!res.ok) throw new Error(`Shopify orders fetch failed for ${ym}: ${res.error}`)
  const compact = (res.orderDetails || []).map(o => ({
    d: brisDate(o.createdAt),
    e: hashEmail(o.email),
    t: r2(o.aov),
    h: o.hireRevenue,
    p: o.productRevenue,
  }))
  // Only persist CLOSED months — current month changes constantly.
  // Never cache an EMPTY closed month: without the read_all_orders scope
  // Shopify silently returns nothing past 60 days, and caching that would
  // freeze the gap even after the scope is granted.
  if (ym !== currentYm && compact.length > 0) saveJson(cachePath, compact)
  return compact
}

/** Ad spend for one month: { meta: {date: $}, google: {date: $} } */
async function getMonthAdSpend(ym, currentYm) {
  const cachePath = dataFile(`finance/adspend-${ym}.json`)
  if (ym !== currentYm) {
    const cached = loadJson(cachePath)
    if (cached) return cached
  }
  const { from, to } = monthBounds(ym)
  // Don't ask the APIs for the future
  const today = brisbaneNow().toISOString().slice(0, 10)
  const until = to > today ? today : to

  const [metaDays, googleRes] = await Promise.all([
    fetchAccountSpendByDay(from, until).catch(e => {
      console.error(`[finance] Meta spend fetch failed ${ym}:`, e.message)
      return null
    }),
    fetchGoogleSpendByDayRange(from, until),
  ])

  const meta = {}
  for (const d of metaDays || []) meta[d.date] = d.spend
  const google = {}
  for (const d of googleRes.ok ? googleRes.days : []) google[d.date] = d.spend

  const out = {
    meta, google,
    metaOk: metaDays !== null,
    googleOk: googleRes.ok,
  }
  if (ym !== currentYm && out.metaOk && out.googleOk) saveJson(cachePath, out)
  return out
}

// ── Per-month financial rollup ──────────────────────────────────────────────

function sumSpend(spendMap) {
  return Object.values(spendMap || {}).reduce((s, v) => s + v, 0)
}

/** Real AusPost shipping bill, converted to a monthly figure. */
function auspostMonthly(config) {
  return ((config.auspostWeekly || 0) * 52) / 12
}

/**
 * Cost of Delivery with the hire-at-100%-margin rule:
 *   COGS           = productRevenue × (1 − grossMarginPct)   (hire rev: $0 COGS)
 *   payment fees   = 2.6% × all revenue + $0.30 × orders
 *   shipping       = real AusPost bill ($1,400/wk, Josh 2026-07-13),
 *                    prorated by fractionOfMonth — replaces the old
 *                    $4.50/order estimate which undercounted ~3×.
 */
function costOfDelivery(orders, config, fractionOfMonth = 1) {
  let productRev = 0, allRev = 0
  for (const o of orders) {
    allRev += o.t
    productRev += o.p
  }
  const cogs = productRev * (1 - config.grossMarginPct)
  const fees = allRev * GRI_ADS.paymentProcessingRate + orders.length * GRI_ADS.paymentProcessingFixed
  const ship = auspostMonthly(config) * fractionOfMonth
  return cogs + fees + ship
}

function rollupMonth(ym, orders, adspend, config, fractionOfMonth = 1, fixedTotal = 0) {
  const revenue = orders.reduce((s, o) => s + o.t, 0)
  const hireRevenue = orders.reduce((s, o) => s + o.h, 0)
  // Counted ad spend: Google is paid by a different business (config flag),
  // so by default only Meta reduces CM. Google spend is still reported
  // separately as external info.
  const spend = sumSpend(adspend.meta)
    + (config.includeGoogleSpend ? sumSpend(adspend.google) : 0)
  const cod = costOfDelivery(orders, config, fractionOfMonth)
  const cm = calculateCM(revenue, cod, spend)

  // Data completeness — without the read_all_orders scope Shopify only
  // serves ~60 days of history, which leaves older months empty and the
  // boundary month PARTIAL (orders start mid-month). A month only counts
  // as complete when its orders actually start near the 1st. Incomplete
  // months are excluded from every average, target and YoY comparison.
  const earliestDay = orders.length
    ? Math.min(...orders.map(o => Number(o.d.slice(8, 10))))
    : null
  const isCurrent = fractionOfMonth < 1
  const complete = isCurrent ? false : orders.length > 0 && earliestDay <= 3

  // Full P&L for the month: what actually lands after everything
  const capitalWithheld = revenue * config.shopifyCapitalPct
  const tax = revenue * config.taxPct
  const fixed = fixedTotal * fractionOfMonth
  const net = cm - capitalWithheld - tax - fixed

  return {
    month: ym,
    revenue: r2(revenue),
    hireRevenue: r2(hireRevenue),
    orders: orders.length,
    adSpend: r2(spend),
    metaSpend: r2(sumSpend(adspend.meta)),
    googleSpend: r2(sumSpend(adspend.google)),
    costOfDelivery: r2(cod),
    cm: r2(cm),
    aov: orders.length ? r2(revenue / orders.length) : 0,
    complete,
    current: isCurrent,
    capitalWithheld: r2(capitalWithheld),
    tax: r2(tax),
    fixed: r2(fixed),
    net: r2(net),
  }
}

// ── Customer classification across the whole window ────────────────────────

/**
 * Build a first-seen index from ALL loaded orders (25 months), then classify
 * orders in a given month as new / returning / reactivated (>365d gap).
 */
function buildCustomerTimeline(allOrdersByMonth) {
  // email hash → sorted array of { d, t, h, p }
  const byCustomer = new Map()
  for (const ym of Object.keys(allOrdersByMonth)) {
    for (const o of allOrdersByMonth[ym]) {
      if (!o.e) continue
      if (!byCustomer.has(o.e)) byCustomer.set(o.e, [])
      byCustomer.get(o.e).push(o)
    }
  }
  for (const arr of byCustomer.values()) arr.sort((a, b) => a.d.localeCompare(b.d))
  return byCustomer
}

function customerStatsForRange(byCustomer, fromDate, toDate) {
  let newCustomers = 0, reactivated = 0, returningOrders = 0, totalOrders = 0
  let newCustomerRevenue = 0, firstOrderSum = 0
  for (const arr of byCustomer.values()) {
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i]
      if (o.d < fromDate || o.d > toDate) continue
      totalOrders++
      if (i === 0) {
        newCustomers++
        newCustomerRevenue += o.t
        firstOrderSum += o.t
      } else {
        returningOrders++
        const gapDays = (new Date(o.d) - new Date(arr[i - 1].d)) / 86400000
        if (gapDays > 365) reactivated++
      }
    }
  }
  return {
    newCustomers, reactivated, returningOrders, totalOrders,
    newCustomerRevenue: r2(newCustomerRevenue),
    firstOrderAov: newCustomers ? r2(firstOrderSum / newCustomers) : 0,
    repeatRate: totalOrders ? r2((returningOrders / totalOrders) * 100) : 0,
  }
}

/**
 * LTGP:nCAC — for customers whose first order is old enough to have a full
 * window, average gross profit (hire @100%, product @margin) accumulated
 * within N days of first order, divided by current nCAC.
 * Cohort: first orders in the trailing 12 months that clear the window.
 */
function ltgpWindows(byCustomer, config, ncac, asOfDate) {
  const windows = [30, 60, 90, 180, 365]
  const out = {}
  let gp90 = 0
  const asOf = new Date(asOfDate)
  for (const w of windows) {
    let cohort = 0, gpSum = 0
    const cohortStart = new Date(asOf); cohortStart.setDate(cohortStart.getDate() - w - 365)
    const cohortEnd = new Date(asOf); cohortEnd.setDate(cohortEnd.getDate() - w)
    const startStr = cohortStart.toISOString().slice(0, 10)
    const endStr = cohortEnd.toISOString().slice(0, 10)
    for (const arr of byCustomer.values()) {
      const first = arr[0]
      if (first.d < startStr || first.d > endStr) continue
      cohort++
      const windowEnd = new Date(new Date(first.d).getTime() + w * 86400000).toISOString().slice(0, 10)
      for (const o of arr) {
        if (o.d > windowEnd) break
        gpSum += o.h + o.p * config.grossMarginPct
      }
    }
    const gpPerCustomer = cohort ? gpSum / cohort : 0
    out[String(w)] = ncac > 0 && cohort > 0 ? r2(gpPerCustomer / ncac) : null
    if (w === 90) gp90 = r0(gpPerCustomer)
  }
  return { windows: out, gpPerCustomer90d: gp90 }
}

// ── Main summary builder ────────────────────────────────────────────────────

// Single-flight: concurrent callers (staff dashboards + 5-min polls) share
// one in-progress build instead of each hammering the Shopify/Meta/Google
// APIs — parallel builds trip Shopify's 2-calls/sec limit.
let _inFlight = null

export async function buildFinanceSummary({ force = false } = {}) {
  if (!force && _summaryCache && Date.now() - _summaryCache.t < TTL_MS) {
    return _summaryCache.v
  }
  if (_inFlight) return _inFlight
  _inFlight = _buildFinanceSummary()
    .finally(() => { _inFlight = null })
  return _inFlight
}

async function _buildFinanceSummary() {
  const config = getFinanceConfig()
  const now = brisbaneNow()
  const todayStr = now.toISOString().slice(0, 10)
  const currentYm = monthKey(todayStr)
  const dayOfMonth = now.getUTCDate()
  const dim = daysInMonth(currentYm)

  // 25 months: 13 for the monthly series + 12 more so 365d LTGP cohorts exist
  const months = lastNMonths(25)
  const seriesMonths = months.slice(-13)

  // Load everything (closed months come from disk after first run)
  const ordersByMonth = {}
  const adspendByMonth = {}
  for (const ym of months) {
    ordersByMonth[ym] = await getMonthOrders(ym, currentYm)
  }
  // Ad spend only needed for the series window (13 months)
  for (const ym of seriesMonths) {
    adspendByMonth[ym] = await getMonthAdSpend(ym, currentYm)
  }

  const fixedTotalForRollup = fixedTotalMonthly(config)
  const monthlySeries = seriesMonths.map(ym =>
    rollupMonth(ym, ordersByMonth[ym], adspendByMonth[ym], config,
      ym === currentYm ? dayOfMonth / dim : 1, fixedTotalForRollup))

  const cur = monthlySeries[monthlySeries.length - 1]      // current month MTD
  const prev = monthlySeries[monthlySeries.length - 2]     // last full month
  const lastYear = monthlySeries[monthlySeries.length - 13] // same month last year

  // ── Daily CM series for the current month ────────────────────────────────
  const curOrders = ordersByMonth[currentYm]
  const curSpend = adspendByMonth[currentYm]
  const ordersByDay = new Map()
  for (const o of curOrders) {
    if (!ordersByDay.has(o.d)) ordersByDay.set(o.d, [])
    ordersByDay.get(o.d).push(o)
  }
  const dailySeries = []
  for (let day = 1; day <= dayOfMonth; day++) {
    const date = `${currentYm}-${String(day).padStart(2, '0')}`
    const dayOrders = ordersByDay.get(date) || []
    const dayRev = dayOrders.reduce((s, o) => s + o.t, 0)
    const dayCod = costOfDelivery(dayOrders, config, 1 / dim)
    const daySpend = (curSpend.meta[date] || 0)
      + (config.includeGoogleSpend ? (curSpend.google[date] || 0) : 0)
    dailySeries.push({ date, cm: r2(calculateCM(dayRev, dayCod, daySpend)) })
  }

  const cmMtd = cur.cm
  const dailyAvg = dayOfMonth ? cmMtd / dayOfMonth : 0
  const projectedEom = r0(dailyAvg * dim)

  // Target: manual override, else trailing-3-COMPLETE-month avg × 1.1
  // stretch. Partial months (data gaps from the missing read_all_orders
  // scope, or the boundary month where orders start mid-month) would skew
  // the average, so only complete months count.
  const closedMonths = monthlySeries.slice(0, -1).filter(m => m.complete).slice(-3)
  const trailing3Avg = closedMonths.length
    ? closedMonths.reduce((s, m) => s + m.cm, 0) / closedMonths.length
    : 0
  const monthlyTarget = config.cmTargetMonthly ?? r0(trailing3Avg * 1.1)
  const mtdTargetPace = r0(monthlyTarget * (dayOfMonth / dim))
  const pacePct = mtdTargetPace > 0 ? r0((cmMtd / mtdTargetPace) * 100) : null

  const annualised = r0(trailing3Avg * 12)
  const cmPctOfRevenue = cur.revenue > 0 ? r2((cmMtd / cur.revenue) * 100) : 0
  // 6-month CM% average — complete months only, so data gaps don't drag it
  const last6Closed = monthlySeries.slice(0, -1).filter(m => m.complete && m.revenue > 0).slice(-6)
  const cmPct6moAvg = last6Closed.length
    ? r2(last6Closed.reduce((s, m) => s + (m.cm / m.revenue) * 100, 0) / last6Closed.length)
    : null

  // ── MTD vs prior-month same-day-count comparisons ────────────────────────
  const prevYm = seriesMonths[seriesMonths.length - 2]
  const prevMtdCutoff = `${prevYm}-${String(Math.min(dayOfMonth, daysInMonth(prevYm))).padStart(2, '0')}`
  const prevMtdOrders = ordersByMonth[prevYm].filter(o => o.d <= prevMtdCutoff)
  const prevMtdRev = prevMtdOrders.reduce((s, o) => s + o.t, 0)
  const prevSpendMap = adspendByMonth[prevYm]
  const prevMtdSpend = [
    ...Object.entries(prevSpendMap.meta),
    ...(config.includeGoogleSpend ? Object.entries(prevSpendMap.google) : []),
  ].filter(([d]) => d <= prevMtdCutoff).reduce((s, [, v]) => s + v, 0)
  const prevMtdCod = costOfDelivery(prevMtdOrders, config,
    Math.min(dayOfMonth, daysInMonth(prevYm)) / daysInMonth(prevYm))
  const prevMtdCm = calculateCM(prevMtdRev, prevMtdCod, prevMtdSpend)
  const prevMtdAov = prevMtdOrders.length ? prevMtdRev / prevMtdOrders.length : 0

  // ── Customer metrics ─────────────────────────────────────────────────────
  const byCustomer = buildCustomerTimeline(ordersByMonth)
  const mtdFrom = `${currentYm}-01`
  const custNow = customerStatsForRange(byCustomer, mtdFrom, todayStr)
  const custPrev = customerStatsForRange(byCustomer, `${prevYm}-01`, prevMtdCutoff)

  const ncacNow = custNow.newCustomers > 0 ? cur.adSpend / custNow.newCustomers : 0
  const ncacPrev = custPrev.newCustomers > 0 ? prevMtdSpend / custPrev.newCustomers : 0

  const deltaSpend = cur.adSpend - prevMtdSpend
  const deltaCust = custNow.newCustomers - custPrev.newCustomers
  const incrementalCac = deltaCust > 0 ? r2(deltaSpend / deltaCust) : null

  const acquiredNow = custNow.newCustomers + custNow.reactivated
  const acquiredPrev = custPrev.newCustomers + custPrev.reactivated
  const adjCacNow = acquiredNow > 0 ? cur.adSpend / acquiredNow : 0
  const adjCacPrev = acquiredPrev > 0 ? prevMtdSpend / acquiredPrev : 0

  const fovNow = calculateFOVCAC(custNow.firstOrderAov, config.grossMarginPct, ncacNow)
  const fovPrev = calculateFOVCAC(custPrev.firstOrderAov, config.grossMarginPct, ncacPrev)

  const amerNow = calculateAcquisitionMER(custNow.newCustomerRevenue, cur.adSpend)
  const amerPrev = calculateAcquisitionMER(custPrev.newCustomerRevenue, prevMtdSpend)

  const ltgp = ltgpWindows(byCustomer, config, ncacNow, todayStr)

  // ── Outgoings + net position ─────────────────────────────────────────────
  const fixedTotal = fixedTotalMonthly(config)
  const fixedMtd = fixedTotal * (dayOfMonth / dim)
  const taxMtd = cur.revenue * config.taxPct
  const capitalMtd = cur.revenue * config.shopifyCapitalPct
  const netMtd = cmMtd - taxMtd - capitalMtd - fixedMtd

  const projRevenue = dayOfMonth ? (cur.revenue / dayOfMonth) * dim : 0
  const netProjected = projectedEom
    - projRevenue * config.taxPct
    - projRevenue * config.shopifyCapitalPct
    - fixedTotal

  const netStatus = netProjected > 0 ? 'green' : netProjected > -2000 ? 'amber' : 'red'

  // ── The verdict: are we actually making money? ───────────────────────────
  const lastComplete = [...monthlySeries].reverse().find(m => m.complete) || null
  const projCapital = projRevenue * config.shopifyCapitalPct
  const projTax = projRevenue * config.taxPct
  const fmtK = n => `$${(Math.abs(n) / 1000).toFixed(1)}k`
  const costParts = [`${fmtK(fixedTotal)} fixed costs`]
  if (projCapital > 0) costParts.push(`${fmtK(projCapital)} Shopify Capital withholding`)
  costParts.push(`${fmtK(projTax)} tax`)
  const costList = costParts.length > 1
    ? costParts.slice(0, -1).join(', ') + ' and ' + costParts[costParts.length - 1]
    : costParts[0]
  const verdictSentence = netProjected > 0
    ? `Yes — at this run rate the business banks ${fmtK(netProjected)} this month after every cost: CM ${fmtK(projectedEom)} covers ${costList}.`
    : `No — at this run rate the business loses ${fmtK(netProjected)} this month: CM ${fmtK(projectedEom)} does not cover ${costList}.`

  const verdict = {
    makingMoney: netProjected > 0,
    netMtd: r0(netMtd),
    netProjectedEom: r0(netProjected),
    status: netStatus,
    sentence: verdictSentence,
    lastCompleteMonth: lastComplete ? {
      month: lastComplete.month,
      revenue: r0(lastComplete.revenue),
      cm: r0(lastComplete.cm),
      net: r0(lastComplete.net),
      makingMoney: lastComplete.net > 0,
    } : null,
  }

  // ── CASH view — the bank account, not the business model ─────────────────
  // The Shopify Capital loan bought the inventory currently being sold
  // (Josh 2026-07-13), so while that stock lasts COGS costs nothing in cash
  // terms; the 25% remittance is the real cash out. This view therefore
  // counts the remittance and skips COGS. It flatters long-term (stock will
  // eventually be re-bought with cash) — the model view predicts the future,
  // the cash view explains this month's bank balance.
  const loanPct = config.capitalLoanActualPct ?? 0
  const feesMtd = cur.revenue * GRI_ADS.paymentProcessingRate + cur.orders * GRI_ADS.paymentProcessingFixed
  const auspostMtdCash = auspostMonthly(config) * (dayOfMonth / dim)
  const cashMtd = cur.revenue
    - cur.revenue * loanPct
    - auspostMtdCash
    - feesMtd
    - cur.adSpend
    - taxMtd
    - fixedMtd
  const projOrders = dayOfMonth ? (cur.orders / dayOfMonth) * dim : 0
  const cashProjected = projRevenue
    - projRevenue * loanPct
    - auspostMonthly(config)
    - (projRevenue * GRI_ADS.paymentProcessingRate + projOrders * GRI_ADS.paymentProcessingFixed)
    - (dayOfMonth ? (cur.adSpend / dayOfMonth) * dim : 0)
    - projRevenue * config.taxPct
    - fixedTotal
  const cashView = {
    loanPct,
    mtd: r0(cashMtd),
    projectedEom: r0(cashProjected),
    status: cashProjected > 0 ? 'green' : cashProjected > -2000 ? 'amber' : 'red',
    note: 'No COGS while loan-funded stock lasts; 25% remittance counted. Flatters long-term — stock must eventually be re-bought with cash.',
  }

  const summary = {
    ok: true,
    dataFetchedAt: new Date().toISOString(),
    dataSources: {
      meta: curSpend.metaOk ? 'live' : 'FAILED',
      google: curSpend.googleOk ? 'live' : 'FAILED',
      shopify: 'live',
    },
    month: currentYm,
    daysInMonth: dim,
    dayOfMonth,
    verdict,
    cashView,
    cm: {
      mtd: r0(cmMtd),
      dailyAvg: r0(dailyAvg),
      dailySeries,
      dailyTarget: r0(monthlyTarget / dim),
      projectedEom,
      monthlyTarget: r0(monthlyTarget),
      mtdTargetPace,
      pacePct,
      annualised,
      cmPctOfRevenue,
      cmPct6moAvg,
      vsPriorMonthPct: pctDelta(cmMtd, prevMtdCm),
      // Only compare against last year when that month's data is complete —
      // comparing against a data gap produces nonsense percentages.
      vsSameMonthLastYearPct: lastYear?.complete ? pctDelta(cmMtd, lastYear.cm * (dayOfMonth / dim)) : null,
      formula: {
        netSales: r0(cur.revenue),
        costOfDelivery: r0(cur.costOfDelivery),
        adSpend: r0(cur.adSpend),
      },
    },
    monthlySeries,
    comparisons: {
      vsLastMonth: {
        ordersPct: pctDelta(cur.orders, prevMtdOrders.length),
        adSpendPct: pctDelta(cur.adSpend, prevMtdSpend),
      },
      vsLastYear: lastYear?.complete ? {
        revenuePct: pctDelta(cur.revenue, lastYear.revenue * (dayOfMonth / dim)),
        revenueNow: r0(cur.revenue), revenueThen: r0(lastYear.revenue),
        ordersPct: pctDelta(cur.orders, lastYear.orders * (dayOfMonth / dim)),
        ordersNow: cur.orders, ordersThen: lastYear.orders,
        adSpendPct: pctDelta(cur.adSpend, lastYear.adSpend * (dayOfMonth / dim)),
        adSpendNow: r0(cur.adSpend), adSpendThen: r0(lastYear.adSpend),
        aovPct: pctDelta(cur.aov, lastYear.aov),
        aovNow: r0(cur.aov), aovThen: r0(lastYear.aov),
      } : null,
    },
    kpis: {
      revenue: { value: r0(cur.revenue), deltaPct: pctDelta(cur.revenue, prevMtdRev) },
      spend: {
        value: r0(cur.adSpend), deltaPct: pctDelta(cur.adSpend, prevMtdSpend),
        meta: r0(cur.metaSpend), google: r0(cur.googleSpend),
        // Google spend is external (paid by another business) unless the
        // config flag counts it — the UI labels it accordingly.
        googleCounted: Boolean(config.includeGoogleSpend),
      },
      mer: {
        value: cur.adSpend > 0 ? r2(cur.revenue / cur.adSpend) : null,
        deltaPct: (cur.adSpend > 0 && prevMtdSpend > 0 && prevMtdRev > 0)
          ? pctDelta(cur.revenue / cur.adSpend, prevMtdRev / prevMtdSpend) : null,
      },
      aov: { value: r0(cur.aov), deltaPct: pctDelta(cur.aov, prevMtdAov) },
    },
    customer: {
      ncac: { value: r0(ncacNow), deltaPct: pctDelta(ncacNow, ncacPrev) },
      incrementalCac: { value: incrementalCac, deltaSpend: r0(deltaSpend), deltaCustomers: deltaCust },
      adjustedCac: { value: r0(adjCacNow), deltaPct: pctDelta(adjCacNow, adjCacPrev) },
      fovCac: { value: r2(fovNow), deltaPct: pctDelta(fovNow, fovPrev) },
      ltgpNcac: ltgp,
      newCustomers: { value: custNow.newCustomers, deltaPct: pctDelta(custNow.newCustomers, custPrev.newCustomers) },
      repeatRate: { value: custNow.repeatRate, deltaPct: pctDelta(custNow.repeatRate, custPrev.repeatRate) },
      amer: { value: r2(amerNow), deltaPct: pctDelta(amerNow, amerPrev) },
    },
    tnt: {
      revenueMtd: r0(cur.hireRevenue),
      pctOfRevenue: cur.revenue > 0 ? r2((cur.hireRevenue / cur.revenue) * 100) : 0,
    },
    outgoings: {
      fixed: config.fixedCosts.map(c => ({
        key: c.key, label: c.label, cadence: c.cadence, amount: c.amount,
        amountMonthly: r0(monthlyAmount(c)),
      })),
      fixedTotal: r0(fixedTotal),
      fixedMtd: r0(fixedMtd),
      adSpendMtd: r0(cur.adSpend),
      // Real AusPost bill — counted inside Cost of Delivery (so inside CM);
      // listed for visibility, NOT added to the outgoings total again.
      auspostWeekly: config.auspostWeekly || 0,
      auspostMonthly: r0(auspostMonthly(config)),
      auspostMtd: r0(auspostMonthly(config) * (dayOfMonth / dim)),
      taxPct: config.taxPct,
      taxMtd: r0(taxMtd),
      // Shopify Capital is NOT an outgoing — Shopify withholds it from
      // payouts before the money reaches the bank (income-side deduction).
      // Reported separately; excluded from the outgoings totals.
      shopifyCapitalPct: config.shopifyCapitalPct,
      shopifyCapitalMtd: r0(capitalMtd),
      shopifyCapitalMonthlyProjected: r0(projRevenue * config.shopifyCapitalPct),
      totalMtd: r0(fixedMtd + cur.adSpend + taxMtd),
      totalMonthlyProjected: r0(fixedTotal + (dayOfMonth ? (cur.adSpend / dayOfMonth) * dim : 0)
        + projRevenue * config.taxPct),
    },
    netPosition: {
      mtd: r0(netMtd),
      projectedEom: r0(netProjected),
      status: netStatus,
    },
  }

  _summaryCache = { t: Date.now(), v: summary }
  return summary
}

export function invalidateFinanceCache() {
  _summaryCache = null
}

/**
 * Wipe all closed-month order caches and refetch from Shopify.
 * Run once after granting the read_all_orders scope so the full history
 * replaces the 60-day-limited snapshots.
 */
export async function rebuildFinanceHistory() {
  const { readdirSync, unlinkSync } = await import('fs')
  const dir = dataDir('finance')
  let wiped = 0
  for (const f of readdirSync(dir)) {
    if (f.startsWith('orders-')) { unlinkSync(`${dir}/${f}`); wiped++ }
  }
  _summaryCache = null
  const summary = await buildFinanceSummary({ force: true })
  const monthsWithOrders = summary.monthlySeries.filter(m => m.orders > 0).length
  return { ok: true, wipedCaches: wiped, monthsWithOrders, of: summary.monthlySeries.length }
}
