import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const queries = ['gender reveal ideas', 'gender reveal', 'gender reveal smoke bomb', 'gender reveal cannon', 'gender reveal australia']
for (const kw of queries) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:20}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items || []
  console.log(`\n=== "${kw}" ===`)
  const shoppingTypes = items.filter(i => ['popular_products','shopping','google_shopping','product_information'].includes(i.type))
  if (!shoppingTypes.length) { console.log('  NO SHOPPING CAROUSEL'); continue }
  for (const block of shoppingTypes) {
    console.log(`  [${block.type}] position ${block.rank_absolute}`)
    const subs = block.items || []
    for (const p of subs.slice(0,20)) {
      const shop = p.shop || p.seller || p.domain || '?'
      const title = (p.title||'').slice(0,60)
      const isUs = /genderrevealideas/i.test(shop) ? ' <<< US' : ''
      console.log(`    ${shop.padEnd(35)} | ${title}${isUs}`)
    }
  }
}
