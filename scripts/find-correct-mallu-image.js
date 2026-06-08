import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL  = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function gql(q,v){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

// Query most recent files (sorted by created date)
const q = await gql(`query { files(first: 10, sortKey: CREATED_AT, reverse: true) { nodes { ... on MediaImage { id image { url width height } fileStatus alt createdAt } } } }`)
const files = q.data?.files?.nodes || []
console.log('\n=== 10 most recent files ===\n')
for (const f of files) {
  console.log(`  ${f.createdAt} | ${f.fileStatus.padEnd(10)} | ${f.image?.width || '?'}x${f.image?.height || '?'} | alt: "${(f.alt||'').slice(0,40)}" | ${f.image?.url || '(no URL yet)'}`)
}

// Find the one matching our recent upload by ID
const targetId = 'gid://shopify/MediaImage/28377657245785'
console.log(`\n=== Looking for our upload (id ${targetId}) ===`)
for (let i = 0; i < 10; i++) {
  await sleep(2000)
  const single = await gql(`query { node(id: "${targetId}") { ... on MediaImage { id image { url width height } fileStatus alt } } }`)
  const f = single.data?.node
  console.log(`  Try ${i+1}: status=${f?.fileStatus}, url=${f?.image?.url || '—'}`)
  if (f?.image?.url) {
    console.log(`\n✓ FOUND: ${f.image.url}`)
    console.log(`  Dimensions: ${f.image.width}x${f.image.height}`)

    // Update Author Hub with this correct URL
    const allPages = await rest('/pages.json?limit=250')
    const hub = allPages.pages.find(p => p.handle === 'about-the-founders')
    if (hub) {
      const cur = await rest(`/pages/${hub.id}.json`)
      // Replace any wrong URLs in the body
      let body = cur.page.body_html
        .replace(/https:\/\/cdn\.shopify\.com\/s\/files\/1\/0584\/7410\/2873\/files\/5\.png[^"']*/g, f.image.url)
        .replace(/https:\/\/genderrevealideas\.com\.au\/cdn\/shop\/files\/founder-placeholder\.png/g, f.image.url)
      const upd = await rest(`/pages/${hub.id}.json`, { method:'PUT', body: JSON.stringify({ page: { id: hub.id, body_html: body }})})
      console.log(upd.errors ? '✗ ' + JSON.stringify(upd.errors) : '✓ Author Hub updated with correct image URL')
    }
    process.exit(0)
  }
}
console.log('\n⚠ Still processing after 20s — try again in a minute')
process.exit(0)
