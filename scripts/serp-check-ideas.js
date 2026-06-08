import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const queries = ['gender reveal ideas','gender reveal smoke bombs','gender reveal','gender reveal cannon']
for (const kw of queries) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30, load_async_ai_overview:true}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items||[]
  const types = items.map(i=>i.type)
  console.log(`\n"${kw}"`)
  console.log(`  all block types: ${[...new Set(types)].join(', ')}`)
  for (const it of items) {
    if (['popular_products','shopping','google_shopping','shopping_ads','popular_shopping','paid_shopping','commercial_units'].includes(it.type)) {
      console.log(`  ★ Shopping-type block: type=${it.type} pos=${it.rank_absolute} sub_items=${(it.items||[]).length}`)
      // check if any sub_items have "sponsored" marker
      for (const sub of (it.items||[]).slice(0,3)) {
        const flags = []
        if (sub.is_paid) flags.push('PAID')
        if (sub.sponsored) flags.push('SPONSORED')
        console.log(`     ${flags.join(',') || 'organic'} | ${sub.shop||sub.seller||sub.domain} | ${(sub.title||'').slice(0,50)}`)
      }
    }
    if (it.type==='paid') {
      console.log(`  ★ Paid text ad: pos=${it.rank_absolute} ${it.domain} | ${(it.title||'').slice(0,60)}`)
    }
  }
}
