import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const end = fmt(new Date(Date.now()-86400000))
const start = fmt(new Date(Date.now()-30*86400000))
const priorEnd = fmt(new Date(Date.now()-31*86400000))
const priorStart = fmt(new Date(Date.now()-60*86400000))

console.log(`\n=== AGENCY CLAIMS — DATA VERIFICATION ===\n`)

// CLAIM 1: Spend up 18%, Revenue down 23%, CVR + CPA up 30%+
console.log('--- CLAIM 1: Spend +18%, Revenue -23%, CVR/CPA +30%+ ---')
const sum = async (s,e) => {
  const r = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${s}' AND '${e}'`)
  let i=0,cl=0,sp=0,co=0,v=0
  for (const x of r) { i+=Number(x.metrics?.impressions||0); cl+=Number(x.metrics?.clicks||0); sp+=Number(x.metrics?.cost_micros||0)/1e6; co+=Number(x.metrics?.conversions||0); v+=Number(x.metrics?.conversions_value||0) }
  return { i,cl,sp,co,v, cvr:cl?co/cl*100:0, roas:sp?v/sp:0, cpc:cl?sp/cl:0, cpa:co?sp/co:0 }
}
const cur = await sum(start, end)
const pri = await sum(priorStart, priorEnd)
const pct = (now, then) => then ? Math.round((now-then)/then*100) : '-'
console.log(`Current 30d (${start}→${end}): Spend $${cur.sp.toFixed(0)} | Conv ${cur.co.toFixed(0)} | Rev $${cur.v.toFixed(0)} | CVR ${cur.cvr.toFixed(2)}% | CPA $${cur.cpa.toFixed(0)} | ROAS ${cur.roas.toFixed(2)}x`)
console.log(`Prior 30d   (${priorStart}→${priorEnd}): Spend $${pri.sp.toFixed(0)} | Conv ${pri.co.toFixed(0)} | Rev $${pri.v.toFixed(0)} | CVR ${pri.cvr.toFixed(2)}% | CPA $${pri.cpa.toFixed(0)} | ROAS ${pri.roas.toFixed(2)}x`)
console.log(`\nDeltas:`)
console.log(`  Spend:  ${pct(cur.sp, pri.sp)}%  (agency said +18%)`)
console.log(`  Revenue: ${pct(cur.v, pri.v)}%  (agency said -23%)`)
console.log(`  CVR:    ${pct(cur.cvr, pri.cvr)}%  (agency said deteriorated)`)
console.log(`  CPA:    ${pct(cur.cpa, pri.cpa)}%  (agency said +30%)`)
console.log(`  ROAS:   ${pct(cur.roas, pri.roas)}%`)

// CLAIM 5: "gender reveal Australia" as phrase negative
console.log(`\n--- CLAIM 5: "gender reveal Australia" PHRASE NEGATIVE? ---`)
try {
  const negs = await c.query(`SELECT shared_set.name, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion`)
  let found = false
  for (const r of negs) {
    const t = r.shared_criterion?.keyword?.text || ''
    if (/gender\s*reveal\s*australia|gender\s*reveal\s*ideas/i.test(t)) {
      console.log(`  ⚠ FOUND: "${t}" [match=${r.shared_criterion?.keyword?.match_type}] in list "${r.shared_set?.name}"`)
      found = true
    }
  }
  if (!found) console.log('  ✓ No "gender reveal australia" or "gender reveal ideas" phrase negatives found in shared lists')
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,100)}`) }

// Campaign-level negatives
try {
  const cn = await c.query(`SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.negative FROM campaign_criterion WHERE campaign.status='ENABLED' AND campaign_criterion.type='KEYWORD' AND campaign_criterion.negative=true`)
  let found = false
  for (const r of cn) {
    const t = r.campaign_criterion?.keyword?.text || ''
    if (/gender\s*reveal\s*australia|gender\s*reveal\s*ideas/i.test(t)) {
      console.log(`  ⚠ FOUND campaign neg: "${t}" [match=${r.campaign_criterion?.keyword?.match_type}] in "${r.campaign?.name}"`)
      found = true
    }
  }
  if (!found) console.log(`  ✓ No "gender reveal australia/ideas" campaign-level negatives`)
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,100)}`) }

// CLAIM 3: Bid strategies all over the place
console.log(`\n--- CLAIM 3: BID STRATEGIES ACROSS ALL CAMPAIGNS ---`)
const camps = await c.query(`SELECT campaign.id, campaign.name, campaign.bidding_strategy_type, campaign.maximize_conversion_value.target_roas FROM campaign WHERE campaign.status='ENABLED'`)
const BID = {3:'MANUAL_CPC',8:'MAX_CONV',10:'MAX_CONV_VALUE',11:'TARGET_IMP_SHARE',2:'PAGE_ONE_PROMOTED'}
for (const r of camps) {
  const t = r.campaign?.bidding_strategy_type
  console.log(`  ${(r.campaign?.name||'').padEnd(38)} | ${BID[t]||t} | tROAS: ${r.campaign?.maximize_conversion_value?.target_roas||'(none)'}`)
}

// CLAIM 2: How many changes in last 14 days?
console.log(`\n--- CLAIM 2: CAMPAIGN CHANGE FREQUENCY (last 14d) ---`)
console.log('Note: Google Ads API does not expose change history via standard reports.')
console.log('Self-audit from our scripts/snapshots:')
console.log('  May 17 (Sat): Brand Defence reactivation + pregnancy themes + 9 location page amplifications')
console.log('  May 18 (Mon): Bundles budget cut $75→$60, GMC promos, 5 SEO titles, poppers BROAD paused')
console.log('  May 19 (Tue/Wed): Cannons keyword swap')
console.log('  → 12-15 distinct campaign changes in 72 hours')

process.exit(0)
