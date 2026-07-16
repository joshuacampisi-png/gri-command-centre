/**
 * finance-config.js
 * Fixed outgoings + finance model settings for the Finance tab.
 *
 * All figures Josh-supplied 2026-07-13. Weekly amounts convert to monthly
 * at ×52/12. Stored in data/finance-config.json (Railway volume) so staff
 * can edit from the UI without a deploy; shipped as a seed baseline so a
 * fresh volume starts with the real numbers.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { dataFile } from './data-dir.js'

const CONFIG_FILE = dataFile('finance-config.json')

export const DEFAULT_CONFIG = {
  fixedCosts: [
    { key: 'wages-beatriz', label: 'Beatriz wages', amount: 1700, cadence: 'weekly' },
    { key: 'wages-josh', label: 'Josh wages', amount: 1500, cadence: 'weekly' },
    { key: 'wages-casual', label: 'Casual wages', amount: 200, cadence: 'weekly' },
    { key: 'marketing-other', label: 'Marketing (non-ads)', amount: 220, cadence: 'weekly' },
    { key: 'accessories', label: 'Everyday accessories', amount: 150, cadence: 'weekly' },
    { key: 'rent', label: 'Rent (Bundall HQ)', amount: 2950, cadence: 'monthly' },
    { key: 'accountant', label: 'Accountant', amount: 300, cadence: 'monthly' },
  ],
  // AusPost shipping — real MONTHLY average (Josh 2026-07-16: $1,364.06/mo,
  // replacing the earlier $1,400/wk figure). Counted INSIDE Cost of
  // Delivery (so inside CM), prorated across the period.
  // auspostMonthly takes precedence; auspostWeekly kept only as a legacy
  // fallback for configs saved before this field existed.
  auspostMonthly: 1364.06,
  auspostWeekly: null,
  // Tax provision as a share of revenue (Josh: 5%).
  taxPct: 0.05,
  // Shopify Capital in the MODEL view. Josh 2026-07-13: the loan bought the
  // inventory currently being sold, so counting full COGS AND the repayment
  // would double-count product costs. Model view = COGS only (this stays 0).
  shopifyCapitalPct: 0,
  // The REAL remittance rate Shopify withholds while the loan runs — used
  // by the CASH view (no COGS while prepaid stock lasts, remittance counted).
  // Set to 0 when the loan actually clears.
  capitalLoanActualPct: 0.25,
  // Google Ads spend is paid by a DIFFERENT business (Josh 2026-07-13), so
  // it does not count as a GRI outgoing and does not reduce CM. Google-
  // driven sales still land in revenue; the spend is shown as external
  // info only. Set true to count it again.
  includeGoogleSpend: false,
  // null = auto: trailing-3-full-month average CM × 1.1 stretch.
  cmTargetMonthly: null,
  // Blended gross margin for non-hire products. Josh 2026-07-13: "we buy
  // $4 and sell for $32 — this is the LOWEST product margin we have" =
  // 87.5% floor; everything else is higher. Set at that floor.
  grossMarginPct: 0.875,
  // Shopify Capital loan — LIVE payoff tracking. Josh 2026-07-16: $27,126
  // owing as of the anchor date. The engine subtracts 25% of every day's
  // Shopify revenue from the anchor automatically, so the remaining
  // balance self-updates daily. Re-anchor whenever Shopify's own figure
  // is checked (update both amount and date).
  loanAnchorAmount: 27126,
  loanAnchorDate: '2026-07-16',
  // Legacy static figure (superseded by the anchor fields)
  loanRemaining: 30000,
  // Stock on hand at RETAIL value (Josh 2026-07-13: ~$1.5M) — all paid for
  // via the loan. Gives the months-of-runway figure: no cash needed for
  // inventory until this sells through.
  stockRetailValue: 1500000,
  // TNT hire revenue carries no COGS — contributes at 100% margin.
  tntFullMargin: true,
  updatedAt: null,
}

export function weeklyToMonthly(amount) {
  return (amount * 52) / 12
}

export function monthlyAmount(cost) {
  return cost.cadence === 'weekly' ? weeklyToMonthly(cost.amount) : cost.amount
}

export function fixedTotalMonthly(config) {
  return (config.fixedCosts || []).reduce((s, c) => s + monthlyAmount(c), 0)
}

export function getFinanceConfig() {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    // Merge so new fields added in code get defaults on old volumes
    return { ...DEFAULT_CONFIG, ...raw }
  } catch (e) {
    console.error('[finance-config] Corrupt config, using defaults:', e.message)
    return { ...DEFAULT_CONFIG }
  }
}

export function saveFinanceConfig(patch) {
  const current = getFinanceConfig()
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }

  // Validation — reject garbage before it poisons the dashboard
  if (!Array.isArray(next.fixedCosts)) throw new Error('fixedCosts must be an array')
  for (const c of next.fixedCosts) {
    if (!c.label || typeof c.amount !== 'number' || c.amount < 0) {
      throw new Error(`Invalid fixed cost: ${JSON.stringify(c)}`)
    }
    if (!['weekly', 'monthly'].includes(c.cadence)) {
      throw new Error(`Invalid cadence "${c.cadence}" — must be weekly or monthly`)
    }
    if (!c.key) c.key = c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }
  for (const f of ['taxPct', 'shopifyCapitalPct', 'grossMarginPct']) {
    if (typeof next[f] !== 'number' || next[f] < 0 || next[f] > 1) {
      throw new Error(`${f} must be a number between 0 and 1`)
    }
  }
  if (next.cmTargetMonthly !== null && (typeof next.cmTargetMonthly !== 'number' || next.cmTargetMonthly < 0)) {
    throw new Error('cmTargetMonthly must be null (auto) or a positive number')
  }
  if (next.auspostMonthly != null && (typeof next.auspostMonthly !== 'number' || next.auspostMonthly < 0)) {
    throw new Error('auspostMonthly must be a number ≥ 0')
  }
  if (next.auspostWeekly != null && (typeof next.auspostWeekly !== 'number' || next.auspostWeekly < 0)) {
    throw new Error('auspostWeekly must be a number ≥ 0')
  }
  if (typeof next.includeGoogleSpend !== 'boolean') {
    next.includeGoogleSpend = Boolean(next.includeGoogleSpend)
  }
  for (const f of ['loanRemaining', 'loanAnchorAmount', 'stockRetailValue']) {
    if (next[f] != null && (typeof next[f] !== 'number' || next[f] < 0)) {
      throw new Error(`${f} must be a number ≥ 0`)
    }
  }
  if (next.loanAnchorDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(next.loanAnchorDate)) {
    throw new Error('loanAnchorDate must be YYYY-MM-DD')
  }

  const tmp = CONFIG_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, CONFIG_FILE)
  return next
}
