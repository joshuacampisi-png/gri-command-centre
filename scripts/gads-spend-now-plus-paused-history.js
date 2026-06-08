/**
 * Live spend + complete paused-campaign historical performance.
 * Surfaces: today's spend, 7d spend, 30d spend, plus 90d/180d performance of every paused campaign.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const days = (n) => fmt(new Date(Date.now() - n*86400000))

console.log('\n=== LIVE SPEND ===\n')

// Today
const todayRows = await c.query(`
  SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date = '${days(0)}'
`)
const STATUS = { 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED' }
let todaySp = 0, todayVal = 0
console.log(`TODAY (${days(0)}):`)
for (const r of todayRows) {
  const sp = Number(r.metrics?.cost_micros || 0)/1e6
  if (sp < 0.5) continue
  const val = Number(r.metrics?.conversions_value || 0)
  todaySp += sp; todayVal += val
  console.log(`  ${(STATUS[r.campaign?.status]||'').padEnd(7)} $${sp.toFixed(2).padStart(6)}  $${val.toFixed(0).padStart(4)} val  | ${r.campaign?.name}`)
}
console.log(`  TODAY TOTAL: $${todaySp.toFixed(2)} spent, $${todayVal.toFixed(0)} val (${todaySp > 0 ? (todayVal/todaySp).toFixed(2) : '-'}x)`)

// 7d
const sevenRows = await c.query(`
  SELECT campaign.name, metrics.cost_micros, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${days(7)}' AND '${days(1)}'
`)
let sevenSp = 0, sevenVal = 0
for (const r of sevenRows) { sevenSp += Number(r.metrics?.cost_micros || 0)/1e6; sevenVal += Number(r.metrics?.conversions_value || 0) }
console.log(`\n7d ROLLING (${days(7)} → ${days(1)}): $${sevenSp.toFixed(0)} spent, $${sevenVal.toFixed(0)} val, ${sevenSp > 0 ? (sevenVal/sevenSp).toFixed(2) : '-'}x`)
console.log(`  Daily avg: $${(sevenSp/7).toFixed(0)}/day spent, $${(sevenVal/7).toFixed(0)}/day val`)

// Monthly projection
console.log(`  Monthly projection: $${(sevenSp/7*30).toFixed(0)} spend, $${(sevenVal/7*30).toFixed(0)} val`)

// === PAUSED CAMPAIGNS HISTORY ===
console.log('\n=== PAUSED CAMPAIGNS — 180d HISTORY ===\n')
const start180 = days(180)
const pausedRows = await c.query(`
  SELECT campaign.name, campaign.id, segments.month,
         metrics.cost_micros, metrics.conversions_value, metrics.conversions, metrics.clicks, metrics.impressions
  FROM campaign
  WHERE segments.date BETWEEN '${start180}' AND '${days(1)}'
    AND campaign.status = 'PAUSED'
`)

const byCamp = new Map()
for (const r of pausedRows) {
  const k = r.campaign?.name
  const cur = byCamp.get(k) || { id: r.campaign?.id, months: {} }
  const m = r.segments?.month
  if (m) {
    cur.months[m] = cur.months[m] || { sp: 0, val: 0, conv: 0, clk: 0, imp: 0 }
    cur.months[m].sp += Number(r.metrics?.cost_micros || 0)/1e6
    cur.months[m].val += Number(r.metrics?.conversions_value || 0)
    cur.months[m].conv += Number(r.metrics?.conversions || 0)
    cur.months[m].clk += Number(r.metrics?.clicks || 0)
    cur.months[m].imp += Number(r.metrics?.impressions || 0)
  }
  byCamp.set(k, cur)
}

const named = [...byCamp.entries()].filter(([_, c]) => Object.values(c.months).some(m => m.sp > 0))
named.sort((a, b) => {
  const aMax = Math.max(...Object.values(a[1].months).map(m => m.sp))
  const bMax = Math.max(...Object.values(b[1].months).map(m => m.sp))
  return bMax - aMax
})
for (const [name, c2] of named) {
  console.log(`▸ ${name} (id ${c2.id}):`)
  let tot = { sp: 0, val: 0, conv: 0 }
  for (const [m, x] of Object.entries(c2.months).sort()) {
    if (x.sp < 1) continue
    const roas = x.sp > 0 ? (x.val/x.sp).toFixed(2) : '-'
    console.log(`    ${m}: $${x.sp.toFixed(0).padStart(4)} spent → $${x.val.toFixed(0).padStart(4)} val (${roas}x) ${x.conv.toFixed(0)}c ${x.clk}clk`)
    tot.sp += x.sp; tot.val += x.val; tot.conv += x.conv
  }
  console.log(`    ─── 180d TOTAL: $${tot.sp.toFixed(0)} → $${tot.val.toFixed(0)} (${tot.sp > 0 ? (tot.val/tot.sp).toFixed(2) : '-'}x)`)
  console.log()
}

const noHistory = [...byCamp.entries()].filter(([_, c]) => !Object.values(c.months).some(m => m.sp > 0))
if (noHistory.length) {
  console.log(`\n⚠ Paused with NO 180d spend history (probably never ran or paused before window):`)
  for (const [name, c2] of noHistory) console.log(`    ${name}`)
}

process.exit(0)
