/**
 * Honest audit — did Josh's changes since Apr 13 cost us money?
 * Compare: pre-changes (Mar 14 - Apr 12) vs post-changes (Apr 13 - Apr 27)
 * Same 14-day windows.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

// Window 1: Mar 30 - Apr 12 (14 days BEFORE all changes)
// Window 2: Apr 13 - Apr 26 (14 days AFTER changes started)
const W1_START = '2026-03-30', W1_END = '2026-04-12'
const W2_START = '2026-04-13', W2_END = '2026-04-26'

console.log('\n=== HONEST AUDIT: PRE vs POST CLAUDE CHANGES ===')
console.log(`Pre  (W1): ${W1_START} → ${W1_END} (14d, before changes)`)
console.log(`Post (W2): ${W2_START} → ${W2_END} (14d, after changes started Apr 13)\n`)

async function pull(start, end) {
  const rows = await customer.query(`
    SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  const m = new Map()
  let tot = { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0 }
  for (const r of rows) {
    const name = r.campaign?.name || '?'
    const cur = m.get(name) || { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0 }
    const spend = Number(r.metrics?.cost_micros || 0) / 1e6
    const clicks = Number(r.metrics?.clicks || 0)
    const imp = Number(r.metrics?.impressions || 0)
    const conv = Number(r.metrics?.conversions || 0)
    const val = Number(r.metrics?.conversions_value || 0)
    cur.spend += spend; cur.clicks += clicks; cur.imp += imp; cur.conv += conv; cur.val += val
    tot.spend += spend; tot.clicks += clicks; tot.imp += imp; tot.conv += conv; tot.val += val
    m.set(name, cur)
  }
  return { byCamp: m, tot }
}

const [w1, w2] = await Promise.all([pull(W1_START, W1_END), pull(W2_START, W2_END)])

console.log('--- ACCOUNT TOTALS (14d each) ---')
console.log(`PRE  | $${w1.tot.spend.toFixed(0)} | ${w1.tot.clicks} clk | ${w1.tot.conv.toFixed(1)} conv | $${w1.tot.val.toFixed(0)} | ${(w1.tot.val/w1.tot.spend).toFixed(2)}x ROAS`)
console.log(`POST | $${w2.tot.spend.toFixed(0)} | ${w2.tot.clicks} clk | ${w2.tot.conv.toFixed(1)} conv | $${w2.tot.val.toFixed(0)} | ${(w2.tot.val/w2.tot.spend).toFixed(2)}x ROAS`)
const dRoas = ((w2.tot.val/w2.tot.spend) - (w1.tot.val/w1.tot.spend)).toFixed(2)
const dVal = (w2.tot.val - w1.tot.val).toFixed(0)
const dConv = (w2.tot.conv - w1.tot.conv).toFixed(1)
console.log(`Δ    | spend +$${(w2.tot.spend-w1.tot.spend).toFixed(0)} | conv ${dConv} | value $${dVal} | ROAS ${dRoas}\n`)

console.log('--- PER-CAMPAIGN COMPARISON ---')
const allNames = new Set([...w1.byCamp.keys(), ...w2.byCamp.keys()])
for (const name of allNames) {
  const a = w1.byCamp.get(name) || { spend: 0, conv: 0, val: 0 }
  const b = w2.byCamp.get(name) || { spend: 0, conv: 0, val: 0 }
  if (a.spend < 5 && b.spend < 5) continue
  const aRoas = a.spend > 0 ? (a.val/a.spend).toFixed(2) : '-'
  const bRoas = b.spend > 0 ? (b.val/b.spend).toFixed(2) : '-'
  console.log(`\n  ${name}`)
  console.log(`    PRE  : $${a.spend.toFixed(0)} | ${a.conv.toFixed(1)} conv | $${a.val.toFixed(0)} val | ${aRoas}x`)
  console.log(`    POST : $${b.spend.toFixed(0)} | ${b.conv.toFixed(1)} conv | $${b.val.toFixed(0)} val | ${bRoas}x`)
  const deltaVal = (b.val - a.val).toFixed(0)
  const deltaConv = (b.conv - a.conv).toFixed(1)
  console.log(`    Δ    : value ${deltaVal >= 0 ? '+' : ''}$${deltaVal} | conv ${deltaConv >= 0 ? '+' : ''}${deltaConv}`)
}

// Day-by-day for context
console.log('\n--- DAILY ACCOUNT (Mar 30 - Apr 26) ---')
const dayRows = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${W1_START}' AND '${W2_END}'
`)
const byDay = new Map()
for (const r of dayRows) {
  const d = r.segments?.date
  const cur = byDay.get(d) || { spend: 0, conv: 0, val: 0 }
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  byDay.set(d, cur)
}
for (const d of [...byDay.keys()].sort()) {
  const x = byDay.get(d)
  const dow = new Date(d).toLocaleDateString('en-AU', { weekday: 'short' })
  const roas = x.spend > 0 ? (x.val/x.spend).toFixed(2) : '-'
  const era = d <= W1_END ? 'PRE ' : 'POST'
  console.log(`  ${d} ${dow.padEnd(4)} ${era} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(1).padStart(5)} conv | $${x.val.toFixed(0).padStart(5)} | ${roas}x`)
}

process.exit(0)
