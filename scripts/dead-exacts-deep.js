import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const CAMP = 21094179575
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-180*86400000).toISOString().slice(0,10)

const TARGETS = [
  { text:'gender reveal powder cannon', mt:2, name:'EXACT' },
  { text:'gender reveal confetti cannon', mt:2, name:'EXACT' },
  { text:'gender reveal bomb', mt:3, name:'PHRASE' },
]

console.log(`\n=== 3 DEAD EXACTS — LIFETIME ANALYSIS ===`)
console.log(`Window: ${start} → ${end} (180 days)\n`)

for (const t of TARGETS) {
  // Find criterion
  const kw = await c.query(`SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id=${CAMP} AND ad_group_criterion.keyword.text='${t.text}' AND ad_group_criterion.type='KEYWORD' AND ad_group_criterion.status='ENABLED'`)
  const k = kw.find(r=>r.ad_group_criterion?.keyword?.match_type===t.mt)
  if (!k) { console.log(`\n❌ "${t.text}" ${t.name} not found enabled`); continue }
  const critId = k.ad_group_criterion?.criterion_id
  const agId = k.ad_group?.id

  console.log(`\n--- "${t.text}" ${t.name} (crit ${critId}) ---`)

  // Pull daily history with both last-click AND all-conversions
  const daily = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.all_conversions, metrics.all_conversions_value FROM keyword_view WHERE ad_group_criterion.criterion_id=${critId} AND ad_group.id=${agId} AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.date`)
  
  let lastClickConv=0, lastClickVal=0, allConv=0, allVal=0
  let totalImp=0, totalClk=0, totalSp=0
  let firstActive=null, lastActive=null
  let lastConvDate = null
  
  for (const r of daily) {
    const imp = Number(r.metrics?.impressions||0)
    if (imp===0) continue
    if (!firstActive) firstActive = r.segments?.date
    lastActive = r.segments?.date
    totalImp += imp
    totalClk += Number(r.metrics?.clicks||0)
    totalSp += Number(r.metrics?.cost_micros||0)/1e6
    const lc = Number(r.metrics?.conversions||0)
    const lv = Number(r.metrics?.conversions_value||0)
    const ac = Number(r.metrics?.all_conversions||0)
    const av = Number(r.metrics?.all_conversions_value||0)
    lastClickConv += lc; lastClickVal += lv
    allConv += ac; allVal += av
    if (lc > 0) lastConvDate = r.segments?.date
  }

  console.log(`  First active: ${firstActive||'never'} | Last active: ${lastActive||'never'}`)
  console.log(`  Last LAST-CLICK conversion date: ${lastConvDate||'NEVER'}`)
  console.log(`  Last 180d totals:`)
  console.log(`    Impressions:           ${totalImp.toLocaleString()}`)
  console.log(`    Clicks:                ${totalClk}`)
  console.log(`    Spend:                 $${totalSp.toFixed(0)}`)
  console.log(`    LAST-CLICK conv:       ${lastClickConv.toFixed(0)}  ($${lastClickVal.toFixed(0)})`)
  console.log(`    ALL-CONV (incl assist): ${allConv.toFixed(0)}  ($${allVal.toFixed(0)})`)
  console.log(`    Assist diff:           ${(allConv-lastClickConv).toFixed(0)} extra conversion events worth $${(allVal-lastClickVal).toFixed(0)}`)
  console.log(`    LAST-CLICK ROAS:       ${totalSp?(lastClickVal/totalSp).toFixed(2):'-'}x`)
  console.log(`    ALL-CONV ROAS:         ${totalSp?(allVal/totalSp).toFixed(2):'-'}x`)
}

process.exit(0)
