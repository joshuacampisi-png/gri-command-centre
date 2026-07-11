/**
 * NovaPeptides giveaways / off-stock (vials taken for self or given to friends).
 * Removes from stocktake and represents forgone revenue. Persists to volume.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const FILE = dataFile('nova-giveaways.json')

function read() {
  try {
    if (!existsSync(FILE)) return []
    const a = JSON.parse(readFileSync(FILE, 'utf8'))
    return Array.isArray(a) ? a : []
  } catch (e) { console.error('[NovaGiveaways] read failed:', e.message); return [] }
}
function write(g) {
  try { writeFileSync(FILE, JSON.stringify(g, null, 2)) }
  catch (e) { console.error('[NovaGiveaways] write failed:', e.message) }
}

export function listGiveaways() {
  return read().sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

export function addGiveaway({ product, qty, to, note, cost, retail }) {
  const g = read()
  const q = Math.max(1, Math.round(Number(qty) || 1))
  const c = Math.max(0, Number(cost) || 0)
  const r = Math.max(0, Number(retail) || 0)
  const item = {
    id: 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    ts: Date.now(),
    product: String(product || '').slice(0, 80),
    qty: q,
    to: String(to || '').slice(0, 40),
    note: String(note || '').slice(0, 120),
    cost: +c.toFixed(2),
    retail: +r.toFixed(2),
    costTotal: +(c * q).toFixed(2),
    retailTotal: +(r * q).toFixed(2)
  }
  g.push(item)
  write(g)
  return item
}

export function deleteGiveaway(id) {
  write(read().filter(g => g.id !== id))
  return true
}

export function giveawayTotals(list) {
  const t = list.reduce((a, g) => {
    a.vials += g.qty || 0
    a.cost += g.costTotal || 0
    a.retail += g.retailTotal || 0
    return a
  }, { vials: 0, cost: 0, retail: 0 })
  t.cost = +t.cost.toFixed(2)
  t.retail = +t.retail.toFixed(2)
  t.entries = list.length
  return t
}
