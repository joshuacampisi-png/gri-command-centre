/**
 * Cannons campaign 12-month history — assess bid strategy viability
 * Decision: stay on TIS, or switch to tROAS / Max Conv Value
 *
 * Key thresholds:
 *  - tROAS needs ≥50 conv/30d to work reliably
 *  - Max Conversion Value needs ≥30 conv/30d
 *  - Manual CPC always viable but no auto-optimization
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = n => n==null?'—':(Number(n)*100).toFixed(1)+'%'

console.log('\n=== CANNONS 12-MONTH BID STRATEGY VIABILITY ===\n')

// 1. Current settings
console.log('--- Current settings ---')
const camp = await c.query(`
  SELECT campaign.id, campaign.name, campaign.bidding_strategy_type,
         campaign.target_impression_share.location, campaign.target_impression_share.location_fraction_micros,
         campaign.target_impression_share.cpc_bid_ceiling_micros,
         campaign.target_roas.target_roas,
         campaign.maximize_conversion_value.target_roas,
         campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.name = 'GRI | Search | Cannons'
`)
for (const r of camp) {
  const bsType = r.campaign?.bidding_strategy_type
  const bsName = {1:'MANUAL_CPC',4:'ENHANCED_CPC',6:'TARGET_SPEND',7:'TARGET_CPA',8:'TARGET_ROAS',9:'MAX_CONVERSIONS',10:'MAX_CONV_VALUE',11:'TARGET_IMPRESSION_SHARE',12:'COMMISSION'}[bsType] || `enum=${bsType}`
  console.log(`  Bid strategy:  ${bsName}`)
  console.log(`  TIS location:  ${r.campaign?.target_impression_share?.location || 'undefined'}`)
  console.log(`  TIS target:    ${pct(Number(r.campaign?.target_impression_share?.location_fraction_micros||0)/1e6)}`)
  console.log(`  CPC ceiling:   $${Number(r.campaign?.target_impression_share?.cpc_bid_ceiling_micros||0)/1e6}`)
  console.log(`  Daily budget:  $${Number(r.campaign_budget?.amount_micros||0)/1e6}`)
}

// 2. Monthly performance over 12 months
console.log('\n--- 12-MONTH PERFORMANCE (monthly) ---\n')
const monthly = await c.query(`
  SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share, metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share,
         metrics.search_top_impression_share, metrics.search_absolute_top_impression_share
  FROM campaign
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND segments.date BETWEEN '2025-05-27' AND '2026-05-27'
`)
const byMonth = new Map()
for (const r of monthly) {
  const m = r.segments?.date?.slice(0,7)
  if (!byMonth.has(m)) byMonth.set(m,{imp:0,clk:0,spend:0,conv:0,val:0,is:[],lb:[],lr:[],top:[],abs:[]})
  const x = byMonth.get(m)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
  if (r.metrics?.search_impression_share!=null) x.is.push(Number(r.metrics.search_impression_share))
  if (r.metrics?.search_budget_lost_impression_share!=null) x.lb.push(Number(r.metrics.search_budget_lost_impression_share))
  if (r.metrics?.search_rank_lost_impression_share!=null) x.lr.push(Number(r.metrics.search_rank_lost_impression_share))
  if (r.metrics?.search_top_impression_share!=null) x.top.push(Number(r.metrics.search_top_impression_share))
  if (r.metrics?.search_absolute_top_impression_share!=null) x.abs.push(Number(r.metrics.search_absolute_top_impression_share))
}
const avg = a => a.length?a.reduce((x,y)=>x+y,0)/a.length:null

console.log('Month   | Imp   | Clk | Spend | Conv | Rev   | ROAS  | CPC   | CVR   | SIS   | LostBud | LostRank | TopSIS | AbsTop')
console.log('-'.repeat(135))
let totConv=0, totSpend=0, totVal=0
for (const [m,x] of [...byMonth.entries()].sort()) {
  const cpc = x.clk>0 ? x.spend/x.clk : 0
  const cvr = x.clk>0 ? x.conv/x.clk : 0
  const roas = x.spend>0 ? x.val/x.spend : 0
  totConv += x.conv; totSpend += x.spend; totVal += x.val
  console.log(`${m} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas.toFixed(2).padStart(4)}x | $${cpc.toFixed(2).padStart(4)} | ${(cvr*100).toFixed(1).padStart(4)}% | ${pct(avg(x.is)).padStart(6)} | ${pct(avg(x.lb)).padStart(6)} | ${pct(avg(x.lr)).padStart(6)} | ${pct(avg(x.top)).padStart(5)} | ${pct(avg(x.abs)).padStart(5)}`)
}

console.log('\n--- 12-MONTH AGGREGATE ---')
console.log(`Total spend:     $${totSpend.toFixed(0)}`)
console.log(`Total conv:      ${totConv.toFixed(1)}  (avg ${(totConv/12).toFixed(1)}/mo)`)
console.log(`Total revenue:   $${totVal.toFixed(0)}`)
console.log(`12-mo ROAS:      ${(totVal/totSpend).toFixed(2)}x`)
console.log(`12-mo avg CPC:   $${(totSpend/(totSpend>0?totConv*10:1)).toFixed(2)} (approx)`)

// 3. Bid strategy viability assessment
console.log('\n--- BID STRATEGY VIABILITY ---\n')
const avgConvPerMo = totConv/12
const recent3moConv = [...byMonth.entries()].sort().slice(-3).reduce((a,[_,x])=>a+x.conv,0)
const recent3moAvg = recent3moConv/3

console.log(`Trailing 3-month avg conv/mo: ${recent3moAvg.toFixed(1)}`)
console.log(`Trailing 12-month avg conv/mo: ${avgConvPerMo.toFixed(1)}`)
console.log('')

const assess = (label, threshold) => {
  const ok = recent3moAvg >= threshold
  const verdict = ok ? '✓ VIABLE' : (recent3moAvg >= threshold*0.5 ? '⚠ MARGINAL' : '✗ NOT VIABLE')
  console.log(`  ${label.padEnd(28)} (needs ≥${threshold}/mo) → ${verdict} (you have ${recent3moAvg.toFixed(1)})`)
}
assess('tROAS', 50)
assess('Maximize Conv Value', 30)
assess('Target CPA', 30)
assess('Max Conversions', 15)
console.log(`  Manual CPC                   (no threshold)    → ✓ ALWAYS VIABLE`)
console.log(`  Enhanced CPC                 (≥10/mo)          → ${recent3moAvg>=10?'✓ VIABLE':'⚠ MARGINAL'} (${recent3moAvg.toFixed(1)})`)
console.log(`  Target Impression Share      (no threshold)    → ✓ ALWAYS VIABLE (current setting)`)

// 4. ROAS / SIS trend — is TIS working?
console.log('\n--- IS CURRENT TIS WORKING? ---')
const sortedM = [...byMonth.entries()].sort()
const first3 = sortedM.slice(0,3)
const last3 = sortedM.slice(-3)
const f3 = first3.reduce((a,[_,x])=>({spend:a.spend+x.spend,val:a.val+x.val,conv:a.conv+x.conv,sis:[...a.sis,...x.is]}),{spend:0,val:0,conv:0,sis:[]})
const l3 = last3.reduce((a,[_,x])=>({spend:a.spend+x.spend,val:a.val+x.val,conv:a.conv+x.conv,sis:[...a.sis,...x.is]}),{spend:0,val:0,conv:0,sis:[]})
console.log(`First 3mo of window:  ${first3.map(([m])=>m).join(',')}`)
console.log(`  Spend $${f3.spend.toFixed(0)} | Rev $${f3.val.toFixed(0)} | ROAS ${(f3.val/f3.spend).toFixed(2)}x | Conv ${f3.conv.toFixed(1)} | SIS ${pct(avg(f3.sis))}`)
console.log(`Last 3mo of window:   ${last3.map(([m])=>m).join(',')}`)
console.log(`  Spend $${l3.spend.toFixed(0)} | Rev $${l3.val.toFixed(0)} | ROAS ${(l3.val/l3.spend).toFixed(2)}x | Conv ${l3.conv.toFixed(1)} | SIS ${pct(avg(l3.sis))}`)

// 5. Detect bid strategy changes via change_event
console.log('\n--- BID STRATEGY CHANGE HISTORY (where detectable) ---')
try {
  const changes = await c.query(`
    SELECT change_event.change_date_time, change_event.user_email,
           change_event.change_resource_type, change_event.changed_fields,
           campaign.name
    FROM change_event
    WHERE campaign.name = 'GRI | Search | Cannons'
      AND change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 30
  `)
  if (!changes.length) console.log('  (no change events in last 14 days for Cannons)')
  for (const r of changes) {
    const dt = r.change_event?.change_date_time?.slice(0,16)
    const fields = JSON.stringify(r.change_event?.changed_fields||'').slice(0,150)
    console.log(`  ${dt} | ${r.change_event?.user_email} | ${fields}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message?.slice(0,200)) }

process.exit(0)
