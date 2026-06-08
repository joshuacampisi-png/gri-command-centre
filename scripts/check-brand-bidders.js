import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const r = await fetch('https://api.dataforseo.com/v3/serp/google/ads_advertisers/live/advanced', {
  method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal ideas', location_code:2036, language_code:'en'}])
}).then(r=>r.json())
console.log(JSON.stringify(r,null,2).slice(0,3000))

// Fallback: pull regular SERP and look at paid items
console.log(`\n--- Sponsored on gender reveal ideas ---`)
const r2 = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
  method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal ideas', location_code:2036, language_code:'en', device:'desktop', depth:30}])
}).then(r=>r.json())
const items = r2.tasks?.[0]?.result?.[0]?.items||[]
const paid = items.filter(i=>i.type==='paid')
console.log(`paid text ads: ${paid.length}`)
for (const a of paid) console.log(`  ${a.domain} | ${(a.title||'').slice(0,80)}`)
// Shopping carousel
const shop = items.filter(i=>['popular_products','shopping','google_shopping'].includes(i.type))
for (const b of shop) {
  console.log(`\n[${b.type}] subs=${(b.items||[]).length}`)
  for (const p of (b.items||[]).slice(0,5)) console.log(`  ${p.shop||p.seller||p.domain} | ${(p.title||'').slice(0,60)}`)
}
