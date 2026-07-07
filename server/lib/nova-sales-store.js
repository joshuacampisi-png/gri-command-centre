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

export function addSale({ product, price, cost, qty, note, by }) {
  const sales = read()
  const p = Number(price) || 0
  const c = Number(cost) || 0
  const q = Math.max(1, Math.round(Number(qty) || 1))
  const sale = {
    id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    product: String(product || '').slice(0, 80),
    qty: q,
    price: +p.toFixed(2),
    cost: +c.toFixed(2),
    revenue: +(p * q).toFixed(2),
    totalCost: +(c * q).toFixed(2),
    profit: +((p - c) * q).toFixed(2),
    note: String(note || '').slice(0, 120),
    by: String(by || '').slice(0, 24)
  }
  sales.push(sale)
  write(sales)
  return sale
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
    return a
  }, { units: 0, revenue: 0, cost: 0, profit: 0 })
  t.orders = sales.length
  t.revenue = +t.revenue.toFixed(2)
  t.cost = +t.cost.toFixed(2)
  t.profit = +t.profit.toFixed(2)
  t.margin = t.revenue ? Math.round((t.profit / t.revenue) * 100) : 0
  return t
}
