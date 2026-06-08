import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const today = '2026-05-20'
const yest = '2026-05-19'

async function day(date, label) {
  const rows = await c.query(`SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${date}'`)
  let tS=0,tC=0,tI=0,tCv=0,tV=0
  console.log(`\n--- ${label} (${date}) ---`)
  for (const r of rows.sort((a,b)=>Number(b.metrics?.cost_micros||0)-Number(a.metrics?.cost_micros||0))) {
    const s=Number(r.metrics?.cost_micros||0)/1e6, cl=Number(r.metrics?.clicks||0), i=Number(r.metrics?.impressions||0), cv=Number(r.metrics?.conversions||0), v=Number(r.metrics?.conversions_value||0)
    if (s>0||cl>0) {
      const roas = s>0?(v/s).toFixed(2):'-'
      console.log(`  ${r.campaign.name.padEnd(40)} $${s.toFixed(0).padStart(4)} | ${String(cl).padStart(3)} cl | ${String(i).padStart(5)} imp | ${cv.toFixed(1).padStart(4)} conv | $${v.toFixed(0).padStart(4)} | ${roas}x`)
    }
    tS+=s;tC+=cl;tI+=i;tCv+=cv;tV+=v
  }
  console.log(`  ${'TOTAL'.padEnd(40)} $${tS.toFixed(0).padStart(4)} | ${String(tC).padStart(3)} cl | ${String(tI).padStart(5)} imp | ${tCv.toFixed(1).padStart(4)} conv | $${tV.toFixed(0).padStart(4)} | ${tS>0?(tV/tS).toFixed(2):'-'}x`)
  return {tS,tC,tI,tCv,tV}
}

await day('2026-05-17','Sat May 17')
await day('2026-05-18','Sun May 18')
const d19 = await day(yest,'Mon May 19 — change day')
const d20 = await day(today,'Tue May 20 — TODAY (in-flight)')

console.log(`\n--- HEAD QUERY SERVING (today only, May 20) ---`)
const brand = await c.query(`SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros FROM search_term_view WHERE campaign.id=23425232813 AND segments.date='2026-05-20' ORDER BY metrics.impressions DESC LIMIT 15`)
console.log(`\nBrand Defence:`)
for (const r of brand) console.log(`  "${r.search_term_view.search_term}" | ${r.metrics.impressions} impr | ${r.metrics.clicks} cl | $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2)}`)

const cannon = await c.query(`SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros FROM search_term_view WHERE campaign.id=21094179575 AND segments.date='2026-05-20' ORDER BY metrics.impressions DESC LIMIT 15`)
console.log(`\nSearch Cannons:`)
for (const r of cannon) console.log(`  "${r.search_term_view.search_term}" | ${r.metrics.impressions} impr | ${r.metrics.clicks} cl | $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2)}`)

process.exit(0)
