import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const PMAX = ['21113841118','21511998936','22841772135']
const SEARCH = ['20956049281','23425232813']

// Define windows
const PRE_START = '2026-03-15', PRE_END = '2026-04-13'  // 30d pre Apr 14
const POST_START = '2026-04-14', POST_END = '2026-05-14'  // 30d post
const NOW_START = new Date(Date.now()-7*86400000).toISOString().slice(0,10)
const NOW_END = new Date(Date.now()-1*86400000).toISOString().slice(0,10)

const sumIS = async (id, s, e) => {
  const rows = await c.query(`SELECT campaign.id, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.impressions, metrics.cost_micros FROM campaign WHERE campaign.id=${id} AND segments.date BETWEEN '${s}' AND '${e}'`)
  let is_sum=0, top_sum=0, abs_sum=0, n=0, imp=0, sp=0
  for (const r of rows) {
    if (r.metrics?.search_impression_share!=null) {
      is_sum+=Number(r.metrics.search_impression_share)
      top_sum+=Number(r.metrics.search_top_impression_share||0)
      abs_sum+=Number(r.metrics.search_absolute_top_impression_share||0)
      n++
    }
    imp+=Number(r.metrics?.impressions||0)
    sp+=Number(r.metrics?.cost_micros||0)/1e6
  }
  return { is: n?is_sum/n*100:0, top: n?top_sum/n*100:0, abs: n?abs_sum/n*100:0, imp, sp, days:n }
}

console.log(`\n=== IMPRESSION SHARE — PRE vs POST APR 14 vs NOW ===\n`)
console.log(`Windows: PRE ${PRE_START}→${PRE_END} | POST ${POST_START}→${POST_END} | NOW ${NOW_START}→${NOW_END}\n`)

const NAMES = {'21113841118':'PMAX All Products','21511998936':'PMAX Cannon & Powder','22841772135':'PMAX Bundles','20956049281':'Search Cannons','23425232813':'Brand Defence'}
const ALL = [...PMAX, ...SEARCH]

console.log('Campaign            | Window | IS%   | Top%  | Abs%  | Imp     | Spend')
console.log('--------------------+--------+-------+-------+-------+---------+--------')

let totalImp = { pre:0, post:0, now:0 }
let totalSp = { pre:0, post:0, now:0 }
let isAggIS = { pre:[], post:[], now:[] }
for (const id of ALL) {
  for (const [label, start, end, key] of [['PRE', PRE_START, PRE_END, 'pre'], ['POST', POST_START, POST_END, 'post'], ['NOW', NOW_START, NOW_END, 'now']]) {
    const x = await sumIS(id, start, end)
    if (x.days === 0 && x.imp === 0) continue
    const is = x.is>0 ? `${x.is.toFixed(0)}%` : '-'
    const tp = x.top>0 ? `${x.top.toFixed(0)}%` : '-'
    const ab = x.abs>0 ? `${x.abs.toFixed(0)}%` : '-'
    console.log(`${NAMES[id].padEnd(20)}| ${label.padEnd(6)} | ${is.padStart(5)} | ${tp.padStart(5)} | ${ab.padStart(5)} | ${String(x.imp).padStart(7)} | $${x.sp.toFixed(0).padStart(5)}`)
    totalImp[key]+=x.imp; totalSp[key]+=x.sp
    if (x.is>0) isAggIS[key].push(x.is)
  }
  console.log(`                    |        |       |       |       |         |`)
}

const avg = arr => arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0
console.log(`\n=== ACCOUNT AVG (search-eligible campaigns) ===`)
console.log(`PRE  avg IS: ${avg(isAggIS.pre).toFixed(0)}%`)
console.log(`POST avg IS: ${avg(isAggIS.post).toFixed(0)}%`)
console.log(`NOW  avg IS: ${avg(isAggIS.now).toFixed(0)}%`)
console.log(`\nImpressions PRE: ${totalImp.pre.toLocaleString()} | POST: ${totalImp.post.toLocaleString()} | NOW: ${totalImp.now.toLocaleString()}`)
console.log(`Spend PRE: $${totalSp.pre.toFixed(0)} | POST: $${totalSp.post.toFixed(0)} | NOW (7d only): $${totalSp.now.toFixed(0)}`)
process.exit(0)
