/**
 * 1. Search Cannons landing pages — exact URL per ad group + which ones get clicks
 * 2. Campaign change history — who/when set up Cannon & Powder
 * 3. Real cost/benefit math on whether to "fix" the misallocation
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

// ============== 1. SEARCH CANNONS LANDING PAGES ==============
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('  1. SEARCH CANNONS — where are clicks going?')
console.log('═══════════════════════════════════════════════════════════════════\n')

const ads = await customer.query(`
  SELECT ad_group.name, ad_group_ad.ad.final_urls, ad_group_ad.status,
         metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
  FROM ad_group_ad
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND ad_group_ad.status = 'ENABLED'
    AND segments.date DURING LAST_30_DAYS
`)
const byAg = new Map()
for (const r of ads) {
  const ag = r.ad_group?.name || '?'
  const urls = r.ad_group_ad?.ad?.final_urls || []
  const key = `${ag} | ${urls.join(', ')}`
  if (!byAg.has(key)) byAg.set(key, { ag, urls, imp:0, clk:0, spend:0, conv:0 })
  const x = byAg.get(key)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
}
console.log('AdGroup                  | URL                                                          | Imp  | Clk | Spend | Conv')
console.log('-'.repeat(135))
for (const [_, x] of [...byAg.entries()].sort((a,b)=>b[1].spend-a[1].spend)) {
  const url = x.urls[0] || '?'
  console.log(`${x.ag.slice(0,24).padEnd(24)} | ${url.replace('https://genderrevealideas.com.au','').slice(0,58).padEnd(58)} | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(1)}`)
}

// ============== 2. CHANGE HISTORY ==============
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  2. WHO MADE THE CHANGES — campaign change history')
console.log('═══════════════════════════════════════════════════════════════════\n')

try {
  const changes = await customer.query(`
    SELECT change_event.change_date_time, change_event.user_email,
           change_event.client_type, change_event.change_resource_type,
           change_event.resource_change_operation, campaign.name
    FROM change_event
    WHERE campaign.name IN ('GRI PMAX | All Products', 'GRI PMAX | Bundles', 'GRI PMAX | Cannon & Powder Reveals')
      AND change_event.change_date_time DURING LAST_30_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 50
  `)
  if (!changes.length) console.log('  No change events returned in last 30 days for the PMAX campaigns.')
  for (const c of changes) {
    console.log(`  ${c.change_event?.change_date_time} | ${(c.change_event?.user_email||'?').padEnd(35)} | ${c.change_event?.client_type||'?'} | ${c.change_event?.resource_change_operation} ${c.change_event?.change_resource_type} | ${c.campaign?.name}`)
  }
} catch(e) {
  console.log('  Change history query failed:', e.errors?.[0]?.message || e.message)
}

// ============== 3. THE COST/BENEFIT MATH ==============
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  3. SHOULD WE FIX IT? — real cost/benefit math')
console.log('═══════════════════════════════════════════════════════════════════\n')

const camp30d = await customer.query(`
  SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM campaign
  WHERE campaign.name IN ('GRI PMAX | All Products', 'GRI PMAX | Bundles', 'GRI PMAX | Cannon & Powder Reveals')
    AND segments.date DURING LAST_30_DAYS
`)
const totals = new Map()
for (const r of camp30d) {
  const n = r.campaign?.name
  if (!totals.has(n)) totals.set(n, {spend:0,conv:0,value:0,allConv:0,allValue:0})
  const x = totals.get(n)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv  += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
  x.allConv += Number(r.metrics?.all_conversions||0)
  x.allValue += Number(r.metrics?.all_conversions_value||0)
}
console.log('Campaign                            | 30d Spend | Conv | Rev   | LC-ROAS | All-Conv | All-Rev | aMER')
console.log('-'.repeat(115))
for (const [n,x] of totals) {
  const lcRoas = x.spend>0?(x.value/x.spend).toFixed(2)+'x':'—'
  const aMer = x.spend>0?(x.allValue/x.spend).toFixed(2)+'x':'—'
  console.log(`${n.slice(0,35).padEnd(35)} | $${x.spend.toFixed(0).padStart(7)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(4)} | ${lcRoas.padStart(7)} | ${x.allConv.toFixed(0).padStart(8)} | $${x.allValue.toFixed(0).padStart(6)} | ${aMer.padStart(6)}`)
}

// Now: are the "misallocated" products in Cannon & Powder ACTUALLY converting in that campaign?
console.log(`\n--- Are the "wrong-category" products in Cannon & Powder actually CONVERTING? ---\n`)
const cp = await customer.query(`
  SELECT campaign.name, segments.product_title,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM shopping_performance_view
  WHERE campaign.name = 'GRI PMAX | Cannon & Powder Reveals'
    AND segments.date DURING LAST_30_DAYS
`)
const cpAgg = new Map()
for (const r of cp) {
  const t = r.segments?.product_title || ''
  if (!t) continue
  if (!cpAgg.has(t)) cpAgg.set(t, {spend:0,conv:0,value:0,allConv:0,allValue:0})
  const x = cpAgg.get(t)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv  += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
  x.allConv += Number(r.metrics?.all_conversions||0)
  x.allValue += Number(r.metrics?.all_conversions_value||0)
}
function classify(t) {
  const x = t.toLowerCase()
  if (/bundle|pack|combo|kit|2x|2 pack|3 pack|4 pack|family/i.test(x)) return 'BUNDLE'
  if (/cannon|powder|extinguisher|blaster|tnt|burn.?away/i.test(x)) return 'CANNON'
  if (/smoke bomb|smoke emitter/i.test(x)) return 'SMOKE'
  return 'OTHER'
}
const wrong = [...cpAgg.entries()].filter(([t]) => classify(t) !== 'CANNON').map(([t,m])=>({t,...m}))
wrong.sort((a,b)=>b.spend-a.spend)
let wrongSpend=0, wrongLcRev=0, wrongAllRev=0
console.log('30d Spend | LC Conv | LC Rev | All-Rev | Cat   | Product')
console.log('-'.repeat(130))
for (const p of wrong.slice(0,15)) {
  wrongSpend += p.spend; wrongLcRev += p.value; wrongAllRev += p.allValue
  console.log(`$${p.spend.toFixed(0).padStart(6)} | ${p.conv.toFixed(1).padStart(7)} | $${p.value.toFixed(0).padStart(5)} | $${p.allValue.toFixed(0).padStart(6)} | ${classify(p.t).padEnd(5)} | ${p.t.slice(0,70)}`)
}
const wrongAll = wrong.reduce((s,p)=>({spend:s.spend+p.spend,conv:s.conv+p.conv,value:s.value+p.value,allValue:s.allValue+p.allValue}), {spend:0,conv:0,value:0,allValue:0})
console.log(`\nAll "wrong category" in C&P (30d):`)
console.log(`  Spend:        $${wrongAll.spend.toFixed(0)}`)
console.log(`  LC conv:      ${wrongAll.conv.toFixed(1)}`)
console.log(`  LC revenue:   $${wrongAll.value.toFixed(0)}  (LC ROAS ${wrongAll.spend>0?(wrongAll.value/wrongAll.spend).toFixed(2)+'x':'—'})`)
console.log(`  All-conv rev: $${wrongAll.allValue.toFixed(0)}  (aMER ${wrongAll.spend>0?(wrongAll.allValue/wrongAll.spend).toFixed(2)+'x':'—'})`)

process.exit(0)
