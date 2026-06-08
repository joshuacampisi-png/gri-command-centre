import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// 1. Search Cannons campaign bid strategy
console.log('--- 1. SEARCH CANNONS BID STRATEGY ---')
const camp = await c.query(`SELECT campaign.id, campaign.name, campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled, campaign.maximize_conversions, campaign.maximize_conversion_value FROM campaign WHERE campaign.id=21094179575`)
const BID_TYPES = {3:'MANUAL_CPC',8:'MAXIMIZE_CONVERSIONS',10:'MAXIMIZE_CONVERSION_VALUE',11:'TARGET_IMPRESSION_SHARE',2:'PAGE_ONE_PROMOTED'}
console.log(JSON.stringify(camp[0], null, 2))
const t = camp[0]?.campaign?.bidding_strategy_type
console.log(`\nBidding strategy: ${BID_TYPES[t]||t}`)

// 2. Existing keyword CPC actuals (last 30d)
console.log(`\n--- 2. EXISTING KEYWORD ACTUAL CPCs (last 30d) ---`)
const kw = await c.query(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, metrics.average_cpc, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value FROM keyword_view WHERE campaign.id=21094179575 AND segments.date BETWEEN '${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}' AND '${new Date().toISOString().slice(0,10)}' AND metrics.clicks > 0`)
const m = new Map()
for (const r of kw) {
  const k = `${r.ad_group_criterion?.keyword?.text}|${r.ad_group_criterion?.keyword?.match_type}`
  const cur = m.get(k) || { text:r.ad_group_criterion?.keyword?.text, mt:r.ad_group_criterion?.keyword?.match_type, bid:Number(r.ad_group_criterion?.cpc_bid_micros||0)/1e6, clk:0, conv:0, sp:0, val:0 }
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.val+=Number(r.metrics?.conversions_value||0)
  m.set(k,cur)
}
console.log('Keyword                            | Set Bid | Actual CPC | Clicks | CVR  | ROAS')
for (const x of [...m.values()].sort((a,b)=>b.sp-a.sp).slice(0,12)) {
  const cpc = x.clk?(x.sp/x.clk).toFixed(2):'-'
  const cvr = x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  const mtName = x.mt===2?'EX':x.mt===3?'PH':x.mt===4?'BR':'?'
  console.log(`[${mtName}] ${x.text.padEnd(33)} | $${x.bid.toFixed(2)} | $${cpc.padStart(5)} | ${String(x.clk).padStart(4)} | ${cvr}% | ${roas}x`)
}

// 3. Market CPC for "gender reveal smoke bomb"
console.log(`\n--- 3. MARKET CPC (DataForSEO Google Ads data) ---`)
const dfs = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
  method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{location_code:2036, language_code:'en', keywords:['gender reveal smoke bomb','gender reveal smoke bombs','gender reveal bomb','gender reveal cannon','gender reveal']}])
}).then(r=>r.json())
for (const x of dfs.tasks?.[0]?.result||[]) {
  console.log(`  "${x.keyword.padEnd(30)}" Vol:${String(x.search_volume||0).padStart(5)}/mo | CPC:$${(x.cpc||0).toFixed(2)} | Competition:${x.competition_index||0}`)
}

// 4. Unit economics — what's the max CPC we can afford for Smoke Bombs?
console.log(`\n--- 4. UNIT ECONOMICS — max CPC at target ROAS ---`)
const SMOKE_AOV = 32  // typical smoke bombs PDP price
const CANNON_AOV = 50 // mixed cannon products
const expectedCVRs = [0.02, 0.03, 0.05, 0.08]
const targetROAS = [2, 3, 4]

console.log('At Smoke Bombs $32 AOV:')
console.log('         | 2x ROAS | 3x ROAS | 4x ROAS')
for (const cvr of expectedCVRs) {
  console.log(`CVR ${(cvr*100).toFixed(0)}% | ${targetROAS.map(r=>`$${(SMOKE_AOV*cvr/r).toFixed(2)}`).join(' | ')}`)
}

console.log('\nAt Cannon Bundles ~$50 AOV (mix of $35-$135 products):')
console.log('         | 2x ROAS | 3x ROAS | 4x ROAS')
for (const cvr of expectedCVRs) {
  console.log(`CVR ${(cvr*100).toFixed(0)}% | ${targetROAS.map(r=>`$${(CANNON_AOV*cvr/r).toFixed(2)}`).join(' | ')}`)
}

process.exit(0)
