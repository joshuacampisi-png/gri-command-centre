import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

console.log(`\n=== CROSS-CHECK: Yesterday's negative removal — actual signal? ===\n`)

// Check search-term-view for any "gender reveal ideas" related queries showing up since yesterday
const start = new Date(Date.now()-2*86400000).toISOString().slice(0,10)
const end = new Date().toISOString().slice(0,10)
console.log(`--- Search terms last 2 days, looking for "gender reveal ideas" or "ideas" hits ---`)
try {
  const rows = await c.query(`SELECT campaign.id, campaign.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros FROM search_term_view WHERE segments.date BETWEEN '${start}' AND '${end}'`)
  let found = 0
  for (const r of rows) {
    const term = r.search_term_view?.search_term || ''
    if (/gender reveal ideas|genderrevealideas/i.test(term)) {
      const imp = Number(r.metrics?.impressions||0)
      const clk = Number(r.metrics?.clicks||0)
      const sp = Number(r.metrics?.cost_micros||0)/1e6
      console.log(`  "${term}" → ${imp}imp ${clk}clk $${sp.toFixed(2)} | ${r.campaign?.name}`)
      found++
    }
  }
  if (!found) console.log(`  No "gender reveal ideas" related search terms visible yet (PMAX redacts most)`)
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,80)}`) }

// Live SERP check — are we showing on "gender reveal ideas" Sponsored Shopping now?
console.log(`\n--- Live SERP check: do we appear in Sponsored Shopping for "gender reveal ideas" today? ---`)
const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
  method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal ideas', location_code:2036, language_code:'en', device:'desktop', depth:30}])
}).then(r=>r.json())
const items = r.tasks?.[0]?.result?.[0]?.items||[]
const shoppingBlocks = items.filter(i => i.type==='popular_products' || i.type==='shopping_ads' || i.type==='shopping')
console.log(`Shopping carousel blocks: ${shoppingBlocks.length}`)
for (const b of shoppingBlocks) {
  let usCount = 0, totalSlots = 0
  for (const p of b.items||[]) {
    totalSlots++
    if (/gender reveal ideas/i.test(p.shop||p.seller||p.domain||'')) usCount++
  }
  console.log(`  [${b.type}] ${totalSlots} slots — us in ${usCount}`)
}

// Architecture validation — what IS applied to enabled campaigns
console.log(`\n=== ARCHITECTURE VALIDATION — negatives applied to ENABLED campaigns ===`)
const enabled = await c.query(`SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status='ENABLED'`)
for (const cmp of enabled) {
  const id = cmp.campaign?.id
  const name = cmp.campaign?.name
  // Find shared lists applied
  const links = await c.query(`SELECT shared_set.name FROM campaign_shared_set WHERE campaign.id=${id}`)
  const sharedLists = links.map(l => l.shared_set?.name).filter(Boolean)
  // Find campaign-level negatives count
  let campNegs = []
  try {
    const cn = await c.query(`SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id=${id} AND campaign_criterion.type='KEYWORD' AND campaign_criterion.negative=TRUE`)
    campNegs = cn.map(c2 => c2.campaign_criterion?.keyword?.text).filter(Boolean)
  } catch (e) {}
  console.log(`\n[${name}]`)
  console.log(`  Shared lists: ${sharedLists.length ? sharedLists.join(', ') : '(none)'}`)
  console.log(`  Campaign-level negative keywords: ${campNegs.length}`)
}

process.exit(0)
