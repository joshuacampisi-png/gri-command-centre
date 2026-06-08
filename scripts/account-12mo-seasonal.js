/**
 * 12-month account context + seasonal pattern detection
 * For: predicting impact of negative-keyword removal across the cycle
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const strCh = c => typeof c === 'string' ? c : (c?.name || String(c||''))

console.log('\n=== 12-MONTH ACCOUNT CONTEXT — Month-by-Month ===\n')

const rows = await c.query(`
  SELECT segments.date, campaign.name, campaign.advertising_channel_type,
         metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value, metrics.all_conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '2025-05-27' AND '2026-05-27'
    AND campaign.status != 'REMOVED'
`)

const byMonth = new Map()
const byMonthChannel = new Map()
for (const r of rows) {
  const date = r.segments?.date
  if (!date) continue
  const month = date.slice(0,7)
  const channel = strCh(r.campaign?.advertising_channel_type)
  if (!byMonth.has(month)) byMonth.set(month,{spend:0,clicks:0,imp:0,conv:0,val:0,allVal:0})
  const m = byMonth.get(month)
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  m.spend += spend; m.clicks += Number(r.metrics?.clicks||0); m.imp += Number(r.metrics?.impressions||0)
  m.conv += Number(r.metrics?.conversions||0); m.val += Number(r.metrics?.conversions_value||0)
  m.allVal += Number(r.metrics?.all_conversions_value||0)
  const k = `${month}|${channel}`
  if (!byMonthChannel.has(k)) byMonthChannel.set(k,{spend:0,conv:0,val:0,imp:0})
  const mc = byMonthChannel.get(k)
  mc.spend += spend; mc.conv += Number(r.metrics?.conversions||0); mc.val += Number(r.metrics?.conversions_value||0)
  mc.imp += Number(r.metrics?.impressions||0)
}

console.log('Month   | Imp     | Clk    | Spend   | Conv | Rev      | ROAS  | aMER')
console.log('-'.repeat(80))
for (const [m,x] of [...byMonth.entries()].sort()) {
  const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  const amer = x.spend>0 ? (x.allVal/x.spend).toFixed(2)+'x' : '—'
  console.log(`${m} | ${String(x.imp).padStart(6)} | ${String(x.clicks).padStart(5)} | $${x.spend.toFixed(0).padStart(5)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(6)} | ${roas.padStart(5)} | ${amer.padStart(5)}`)
}

console.log('\n=== BY CHANNEL × MONTH (spend mix) ===\n')
const channels = [...new Set([...byMonthChannel.keys()].map(k=>k.split('|')[1]))]
const months = [...new Set([...byMonthChannel.keys()].map(k=>k.split('|')[0]))].sort()
console.log('Month   | ' + channels.map(c=>c.slice(0,10).padEnd(10)).join(' | '))
console.log('-'.repeat(100))
for (const m of months) {
  const cells = channels.map(ch => {
    const v = byMonthChannel.get(`${m}|${ch}`)
    return v ? `$${v.spend.toFixed(0).padStart(4)}` : '$   0'
  })
  console.log(`${m} | ${cells.map(c=>c.padEnd(10)).join(' | ')}`)
}

console.log('\n=== SEASONAL READ — peak vs trough ===\n')
const sortedMonths = [...byMonth.entries()].sort((a,b)=>b[1].val-a[1].val)
const peak = sortedMonths[0]
const trough = sortedMonths[sortedMonths.length-1]
console.log(`Peak revenue month:    ${peak[0]}  $${peak[1].val.toFixed(0)} rev, $${peak[1].spend.toFixed(0)} spend, ROAS ${(peak[1].val/peak[1].spend).toFixed(2)}x`)
console.log(`Trough revenue month:  ${trough[0]}  $${trough[1].val.toFixed(0)} rev, $${trough[1].spend.toFixed(0)} spend, ROAS ${(trough[1].val/trough[1].spend).toFixed(2)}x`)
console.log(`Peak/trough ratio:     ${(peak[1].val/trough[1].val).toFixed(2)}x revenue swing`)

// Current month vs same month last year
const currentMonth = '2026-05'
const yoyMonth = '2025-05'
const cur = byMonth.get(currentMonth), yoy = byMonth.get(yoyMonth)
if (cur && yoy) {
  console.log(`\n--- YoY (${currentMonth} vs ${yoyMonth}, partial month) ---`)
  console.log(`Spend:   $${cur.spend.toFixed(0)} vs $${yoy.spend.toFixed(0)}  Δ ${(((cur.spend-yoy.spend)/yoy.spend)*100).toFixed(1)}%`)
  console.log(`Rev:     $${cur.val.toFixed(0)} vs $${yoy.val.toFixed(0)}  Δ ${(((cur.val-yoy.val)/yoy.val)*100).toFixed(1)}%`)
  console.log(`ROAS:    ${(cur.val/cur.spend).toFixed(2)}x vs ${(yoy.val/yoy.spend).toFixed(2)}x`)
}

console.log('\n=== EXTINGUISHER + SMOKE PRODUCT REVENUE last 365d (Shopping/PMAX search insight) ===\n')
try {
  const shop = await c.query(`
    SELECT segments.month, segments.product_title,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '2025-05-27' AND '2026-05-27'
  `)
  const agg = new Map()
  for (const r of shop) {
    const title = (r.segments?.product_title||'').toLowerCase()
    if (!title) continue
    let bucket = null
    if (title.includes('extinguisher')) bucket = 'EXTINGUISHER'
    else if (title.includes('smoke bomb') || title.includes('smoke-bomb')) bucket = 'SMOKE_BOMB'
    else if (title.includes('blaster')) bucket = 'BLASTER'
    else if (title.includes('cannon')) bucket = 'CANNON'
    else bucket = 'OTHER'
    if (!agg.has(bucket)) agg.set(bucket,{imp:0,clk:0,spend:0,conv:0,val:0})
    const x = agg.get(bucket)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  console.log('Bucket       | Imp      | Clk    | Spend    | Conv   | Rev      | ROAS')
  console.log('-'.repeat(80))
  for (const [b,x] of [...agg.entries()].sort((a,b)=>b[1].val-a[1].val)) {
    const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
    console.log(`${b.padEnd(12)} | ${String(x.imp).padStart(7)} | ${String(x.clk).padStart(5)} | $${x.spend.toFixed(0).padStart(6)} | ${x.conv.toFixed(0).padStart(5)} | $${x.val.toFixed(0).padStart(6)} | ${roas}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

process.exit(0)
