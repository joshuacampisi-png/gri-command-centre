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
  // Tax provision as a share of revenue (Josh: 5%).
  taxPct: 0.05,
  // Shopify Capital repayment — Shopify withholds this share of revenue
  // weekly until the loan is cleared. Set to 0 once repaid.
  shopifyCapitalPct: 0.25,
  // null = auto: trailing-3-full-month average CM × 1.1 stretch.
  cmTargetMonthly: null,
  // Blended gross margin for non-TNT products (Josh-confirmed 2026-04-05).
  grossMarginPct: 0.47,
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

  const tmp = CONFIG_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, CONFIG_FILE)
  return next
}
