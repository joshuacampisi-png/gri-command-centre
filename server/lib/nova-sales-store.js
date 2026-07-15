/**
 * NovaPeptides sales log store.
 * Persists to the Railway volume (survives redeploys) via data-dir.
 * Small 2-person business — a flat JSON array is plenty.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const FILE = dataFile('nova-sales.json')

function read() {
  try {
    if (!existsSync(FILE)) return []
    const arr = JSON.parse(readFileSync(FILE, 'utf8'))
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.error('[NovaSales] read failed:', e.message)
    return []
  }
}

function write(sales) {
  try { writeFileSync(FILE, JSON.stringify(sales, null, 2)) }
  catch (e) { console.error('[NovaSales] write failed:', e.message) }
}

export function listSales() {
  // newest first
  return read().sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

// Build a single line-item record. `orderId` groups line items belonging to
// the same customer order (an order can hold several peptides).
function buildLine({ product, price, cost, qty, note, by, cohort, commission }, orderId, seq = 0) {
  const p = Number(price) || 0
  const c = Number(cost) || 0
  const q = Math.max(1, Math.round(Number(qty) || 1))
  const comm = Math.max(0, Number(commission) || 0)
  const gross = (p - c) * q
  return {
    id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + seq,
    orderId,
    ts: Date.now(),
    product: String(product || '').slice(0, 80),
    qty: q,
    price: +p.toFixed(2),
    cost: +c.toFixed(2),
    revenue: +(p * q).toFixed(2),
    totalCost: +(c * q).toFixed(2),
    profit: +gross.toFixed(2),               // gross profit (before commission)
    cohort: String(cohort || '').slice(0, 40),
    commission: +comm.toFixed(2),            // paid to the cohort for this sale
    net: +(gross - comm).toFixed(2),         // profit after commission
    note: String(note || '').slice(0, 120),
    by: String(by || '').slice(0, 24)
  }
}

export function addSale(input) {
  const sales = read()
  const orderId = 'o_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const sale = buildLine(input, orderId)
  sales.push(sale)
  write(sales)
  return sale
}

// Add one customer order made up of one or more peptide line items.
// All items share a single orderId so the order counts once.
export function addOrder({ items = [], note, by }) {
  const list = Array.isArray(items) ? items.filter(it => it && Number(it.price) > 0) : []
  if (!list.length) return []
  const sales = read()
  const orderId = 'o_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const created = list.map((it, i) => buildLine({ ...it, note: it.note != null ? it.note : note, by }, orderId, i))
  created.forEach(s => sales.push(s))
  write(sales)
  return created
}

export function updateSale(id, patch = {}) {
  const sales = read()
  const i = sales.findIndex(s => s.id === id)
  if (i < 0) return null
  const s = sales[i]
  const price = patch.price != null ? Number(patch.price) || 0 : s.price
  const cost = patch.cost != null ? Number(patch.cost) || 0 : s.cost
  const qty = patch.qty != null ? Math.max(1, Math.round(Number(patch.qty) || 1)) : (s.qty || 1)
  const commission = patch.commission != null ? Math.max(0, Number(patch.commission) || 0) : (Number(s.commission) || 0)
  const cohort = patch.cohort != null ? String(patch.cohort).slice(0, 40) : (s.cohort || '')
  const note = patch.note != null ? String(patch.note).slice(0, 120) : (s.note || '')
  const product = patch.product != null ? String(patch.product).slice(0, 80) : s.product
  const gross = (price - cost) * qty
  sales[i] = {
    ...s, product, qty,
    price: +price.toFixed(2), cost: +cost.toFixed(2),
    revenue: +(price * qty).toFixed(2), totalCost: +(cost * qty).toFixed(2),
    profit: +gross.toFixed(2), cohort, commission: +commission.toFixed(2),
    net: +(gross - commission).toFixed(2), note
  }
  write(sales)
  return sales[i]
}

export function deleteSale(id) {
  write(read().filter(s => s.id !== id))
  return true
}

export function totals(sales) {
  const t = sales.reduce((a, s) => {
    a.units += s.qty || 1
    a.revenue += s.revenue || 0
    a.cost += s.totalCost || 0
    a.profit += s.profit || 0
    a.commission += Number(s.commission) || 0
    return a
  }, { units: 0, revenue: 0, cost: 0, profit: 0, commission: 0 })
  // Count distinct customer orders. Legacy rows without orderId each count as
  // their own order (fall back to the line id) so the tally stays correct.
  t.orders = new Set(sales.map(s => s.orderId || s.id)).size
  t.lineItems = sales.length
  t.revenue = +t.revenue.toFixed(2)
  t.cost = +t.cost.toFixed(2)
  t.profit = +t.profit.toFixed(2)          // gross profit
  t.commission = +t.commission.toFixed(2)  // total paid to cohorts
  t.net = +(t.profit - t.commission).toFixed(2)  // profit after commission
  t.margin = t.revenue ? Math.round((t.net / t.revenue) * 100) : 0
  // per-cohort commission + sale count
  const byCohort = {}
  for (const s of sales) {
    const key = (s.cohort || '').trim()
    if (!key) continue
    if (!byCohort[key]) byCohort[key] = { name: key, commission: 0, sales: 0, revenue: 0 }
    byCohort[key].commission += Number(s.commission) || 0
    byCohort[key].revenue += Number(s.revenue) || 0
    byCohort[key].sales += 1
  }
  t.cohorts = Object.values(byCohort).map(c => ({ ...c, commission: +c.commission.toFixed(2), revenue: +c.revenue.toFixed(2) }))
  return t
}
