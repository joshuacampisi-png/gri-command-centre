/**
 * Check pregnancy theme performance ~19hrs since ship
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const today = new Date().toISOString().slice(0,10)
const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10)

console.log(`\n=== PREGNANCY ANNOUNCEMENT THEMES — POST-SHIP CHECK ===`)
console.log(`Shipped: ~02:46 UTC today (~19hrs ago)`)
console.log(`Themes added: "pregnancy announcement", "pregnancy announcement ideas"`)
console.log(`To asset groups: All Products (6500812492), Bundles (6598765304)\n`)

// 1. Search-term visibility — check for any pregnancy-related terms triggering
console.log('--- 1. SEARCH TERMS containing "pregnancy" or "announcement" (last 7d) ---')
const start = new Date(Date.now()-7*86400000).toISOString().slice(0,10)
try {
  const rows = await c.query(`
    SELECT campaign.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${today}'
      AND (search_term_view.search_term LIKE '%pregnancy%' OR search_term_view.search_term LIKE '%announcement%' OR search_term_view.search_term LIKE '%expecting%' OR search_term_view.search_term LIKE '%maternity%')
  `)
  if (!rows.length) console.log('  (no pregnancy/announcement search terms visible — PMAX hides most queries)')
  else {
    for (const r of rows) {
      const imp=Number(r.metrics?.impressions||0), clk=Number(r.metrics?.clicks||0), sp=Number(r.metrics?.cost_micros||0)/1e6, conv=Number(r.metrics?.conversions||0), val=Number(r.metrics?.conversions_value||0)
      console.log(`  "${r.search_term_view?.search_term}" → ${imp}imp ${clk}clk $${sp.toFixed(2)} ${conv}c $${val.toFixed(0)} | ${r.campaign?.name}`)
    }
  }
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,80)}`) }

// 2. Asset group spend today — check if All Products + Bundles bid more today
console.log('\n--- 2. TARGET ASSET GROUP SPEND — Today vs Yesterday ---')
const TARGET_AGS = ['6500812492','6598765304']
const NAMES = {'6500812492':'All Products','6598765304':'Bundles'}
for (const id of TARGET_AGS) {
  const t = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM asset_group WHERE asset_group.id=${id} AND segments.date='${today}'`)
  const y = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM asset_group WHERE asset_group.id=${id} AND segments.date='${yesterday}'`)
  let tSp=0,tVal=0,tImp=0,tConv=0, ySp=0,yVal=0,yImp=0,yConv=0
  for (const r of t) { tImp+=Number(r.metrics?.impressions||0); tSp+=Number(r.metrics?.cost_micros||0)/1e6; tVal+=Number(r.metrics?.conversions_value||0); tConv+=Number(r.metrics?.conversions||0) }
  for (const r of y) { yImp+=Number(r.metrics?.impressions||0); ySp+=Number(r.metrics?.cost_micros||0)/1e6; yVal+=Number(r.metrics?.conversions_value||0); yConv+=Number(r.metrics?.conversions||0) }
  const tRoas = tSp?(tVal/tSp).toFixed(2):'-', yRoas = ySp?(yVal/ySp).toFixed(2):'-'
  console.log(`  ${NAMES[id]}: TODAY ${tImp}imp $${tSp.toFixed(0)} → $${tVal.toFixed(0)} ${tRoas}x | YESTERDAY ${yImp}imp $${ySp.toFixed(0)} → $${yVal.toFixed(0)} ${yRoas}x`)
}

// 3. DataForSEO live volume check — is "pregnancy announcement" SERP rendering Shopping?
console.log('\n--- 3. SERP CHECK — does "pregnancy announcement" render Shopping ads? ---')
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
for (const kw of ['pregnancy announcement','pregnancy announcement ideas','pregnancy reveal']) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:20}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items||[]
  const types = [...new Set(items.map(i=>i.type))]
  const shoppingBlock = items.find(i=>['popular_products','shopping','google_shopping'].includes(i.type))
  // Check if any organic result is ours
  let orgIdx=0, ourOrg=null
  for (const it of items) {
    if (it.type==='organic') { orgIdx++; if (/genderrevealideas\.com\.au/i.test(it.domain||it.url||'') && !ourOrg) ourOrg=orgIdx }
  }
  // Check if any of our products in popular_products carousel
  let inShopping = false
  if (shoppingBlock?.items) {
    for (const p of shoppingBlock.items) {
      if (/gender reveal ideas/i.test(p.shop||p.seller||p.domain||'')) { inShopping = true; break }
    }
  }
  console.log(`  "${kw}" → block types: ${types.join(',')}`)
  console.log(`     Shopping carousel: ${shoppingBlock?'YES ('+(shoppingBlock.items||[]).length+' items)':'NO'} | Us in Shopping: ${inShopping?'YES ✅':'no'} | Our organic rank: ${ourOrg?'#'+ourOrg:'not in top 30'}`)
}

process.exit(0)
