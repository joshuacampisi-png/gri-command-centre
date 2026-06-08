import 'dotenv/config'
const EMAIL = process.env.DATAFORSEO_EMAIL
const PASSWORD = process.env.DATAFORSEO_PASSWORD
const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64')

async function dfs(path, body) {
  const r = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return r.json()
}

// Check Shopping carousel for our products specifically — look for rating field
const queries = ['gender reveal smoke bomb australia', 'gender reveal extinguisher', 'gender reveal cannons', 'gender reveal smoke']
for (const kw of queries) {
  console.log(`\n=== ${kw.toUpperCase()} ===`)
  const r = await dfs('serp/google/organic/live/advanced', [{
    keyword: kw, location_code: 2036, language_code: 'en', device: 'desktop', depth: 10,
  }])
  const items = r.tasks?.[0]?.result?.[0]?.items || []
  for (const it of items) {
    if (it.type === 'popular_products' && it.items) {
      for (const p of it.items) {
        const shop = p.shop || p.domain || p.seller || '?'
        if (!shop.toLowerCase().includes('gender reveal ideas') && !shop.toLowerCase().includes('gri')) continue
        console.log(`  ✓ Our listing: "${p.title?.slice(0, 60)}"`)
        console.log(`    Price: $${p.price}, Shop: ${shop}`)
        console.log(`    Rating: ${JSON.stringify(p.rating)}`)
        console.log(`    All fields: ${Object.keys(p).join(', ')}`)
      }
    }
  }
}
