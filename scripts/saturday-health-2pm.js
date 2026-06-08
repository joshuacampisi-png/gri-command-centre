/**
 * Saturday May 23 2pm health check
 * Weekend-vs-weekend + 30-day context
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== ACCOUNT HEALTH — Saturday May 23, 2pm AEST ===\n`)

async function day(date) {
  const r = await c.query(`SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${date}'`)
  let s=0,cl=0,i=0,cv=0,v=0
  for (const x of r) {
    s+=Number(x.metrics?.cost_micros||0)/1e6
    cl+=Number(x.metrics?.clicks||0)
    i+=Number(x.metrics?.impressions||0)
    cv+=Number(x.metrics?.conversions||0)
    v+=Number(x.metrics?.conversions_value||0)
  }
  return {s,cl,i,cv,v}
}

// 1. 30-day daily trajectory
console.log(`--- 30-DAY DAILY (paid only) ---`)
console.log(`Date       | DoW | Spend | Clicks | Impr   | Conv | Rev    | ROAS`)
const start = new Date('2026-04-24T00:00:00Z')
const end = new Date('2026-05-23T00:00:00Z')
const days = []
for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
  const ds = d.toISOString().slice(0,10)
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]
  const r = await day(ds)
  days.push({date:ds, dow, ...r})
  const roas = r.s>0?(r.v/r.s).toFixed(2)+'x':'-'
  const flag = ds === '2026-05-19' ? ' ⚡ change day' : (ds >= '2026-05-19' && ds <= '2026-05-21' ? ' ⚡' : '')
  console.log(`  ${ds} | ${dow} | $${r.s.toFixed(0).padStart(4)} | ${String(r.cl).padStart(4)} | ${String(r.i).padStart(5)} | ${r.cv.toFixed(1).padStart(4)} | $${r.v.toFixed(0).padStart(4)} | ${roas.padStart(5)}${flag}`)
}

// 2. Weekend-vs-weekend
console.log(`\n--- SATURDAY-VS-SATURDAY COMPARISON ---`)
const saturdays = days.filter(d => d.dow === 'Sat')
console.log(`Date       | Spend | Clicks | Conv | Rev    | ROAS  | Note`)
for (const s of saturdays) {
  const roas = s.s>0?(s.v/s.s).toFixed(2)+'x':'-'
  const note = s.date === '2026-05-23' ? ' ← TODAY (in-flight)' : s.date >= '2026-05-19' ? ' (post-change)' : ' (pre-change)'
  console.log(`  ${s.date} | $${s.s.toFixed(0).padStart(4)} | ${String(s.cl).padStart(4)} | ${s.cv.toFixed(1).padStart(4)} | $${s.v.toFixed(0).padStart(4)} | ${roas.padStart(5)}${note}`)
}

console.log(`\n--- SUNDAY-VS-SUNDAY COMPARISON ---`)
const sundays = days.filter(d => d.dow === 'Sun')
for (const s of sundays) {
  const roas = s.s>0?(s.v/s.s).toFixed(2)+'x':'-'
  const note = s.date >= '2026-05-19' ? ' (post-change)' : ' (pre-change)'
  console.log(`  ${s.date} | $${s.s.toFixed(0).padStart(4)} | ${String(s.cl).padStart(4)} | ${s.cv.toFixed(1).padStart(4)} | $${s.v.toFixed(0).padStart(4)} | ${roas.padStart(5)}${note}`)
}

console.log(`\n--- FRIDAY-VS-FRIDAY (last 4) ---`)
const fridays = days.filter(d => d.dow === 'Fri')
for (const s of fridays) {
  const roas = s.s>0?(s.v/s.s).toFixed(2)+'x':'-'
  const note = s.date >= '2026-05-19' ? ' (post-change)' : ' (pre-change)'
  console.log(`  ${s.date} | $${s.s.toFixed(0).padStart(4)} | ${String(s.cl).padStart(4)} | ${s.cv.toFixed(1).padStart(4)} | $${s.v.toFixed(0).padStart(4)} | ${roas.padStart(5)}${note}`)
}

// 3. Pre vs Post 30-day blocks
console.log(`\n--- 30-DAY BLOCKS ---`)
const pre = days.filter(d => d.date >= '2026-04-24' && d.date <= '2026-05-18')
const post = days.filter(d => d.date >= '2026-05-19')
function tally(arr) {
  return arr.reduce((a,d) => ({s:a.s+d.s, cl:a.cl+d.cl, cv:a.cv+d.cv, v:a.v+d.v}), {s:0,cl:0,cv:0,v:0})
}
const preT = tally(pre)
const postT = tally(post)
console.log(`PRE-CHANGE   (Apr 24-May 18, ${pre.length}d): $${preT.s.toFixed(0)} spend | ${preT.cv.toFixed(1)} conv | $${preT.v.toFixed(0)} rev | ${(preT.v/preT.s).toFixed(2)}x ROAS | avg $${(preT.v/pre.length).toFixed(0)}/day`)
console.log(`POST-CHANGE  (May 19-23, ${post.length}d):    $${postT.s.toFixed(0)} spend | ${postT.cv.toFixed(1)} conv | $${postT.v.toFixed(0)} rev | ${(postT.v/postT.s).toFixed(2)}x ROAS | avg $${(postT.v/post.length).toFixed(0)}/day`)

// 4. Account health check
console.log(`\n--- ACCOUNT HEALTH SIGNALS ---`)
const camps = await c.query(`SELECT campaign.name, campaign.status, campaign.bidding_strategy_type, campaign.serving_status, campaign.optimization_score FROM campaign WHERE campaign.status IN ('ENABLED')`)
for (const r of camps) {
  console.log(`  ${r.campaign.name.padEnd(36)} | bid:${r.campaign.bidding_strategy_type} | serving:${r.campaign.serving_status} | opt:${r.campaign.optimization_score?.toFixed(2)||'-'}`)
}

process.exit(0)
