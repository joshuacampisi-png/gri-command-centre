import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const queries = ['gender reveal smoke bomb','gender reveal smoke bombs','gender reveal powder','gender reveal extinguisher','gender reveal balloon','gender reveal kit','gender reveal bundle','gender reveal burnout','gender reveal football','gender reveal golf ball']
for (const kw of queries) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:20}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items || []
  console.log(`\n=== "${kw}" ===`)
  const types = [...new Set(items.map(i=>i.type))]
  console.log(`  Block types: ${types.join(', ')}`)
  for (const block of items) {
    if (!['popular_products','shopping','google_shopping','paid_shopping'].includes(block.type)) continue
    console.log(`  [${block.type}] absolute_pos ${block.rank_absolute}`)
    const subs = block.items || (block.type==='shopping'?[block]:[])
    for (const p of subs.slice(0,15)) {
      const shop = p.shop || p.seller || p.domain || p.source || '?'
      const title = (p.title||'').slice(0,55)
      const isUs = /genderrevealideas/i.test(shop) ? ' <<< US' : ''
      console.log(`    ${String(shop).padEnd(35)} | ${title}${isUs}`)
    }
  }
  // Also check paid container
  const paidAds = items.filter(i=>i.type==='paid')
  if (paidAds.length) {
    console.log(`  [paid text ads] ${paidAds.length} sponsored results`)
    for (const ad of paidAds.slice(0,5)) {
      const isUs = /genderrevealideas/i.test(ad.domain||'') ? ' <<< US' : ''
      console.log(`    ${ad.domain.padEnd(35)} | ${(ad.title||'').slice(0,55)}${isUs}`)
    }
  }
}
