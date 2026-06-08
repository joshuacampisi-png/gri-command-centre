import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
  method:'POST',
  headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal cannons', location_code:2036, language_code:'en', device:'desktop', depth:30}])
}).then(r=>r.json())
const items = r.tasks?.[0]?.result?.[0]?.items || []
for (const it of items) {
  if (it.type === 'popular_products' || it.type === 'shopping' || it.type === 'shopping_serp' || it.type === 'paid' || it.type === 'product_information' || it.type === 'merchant_listings') {
    console.log('=== TYPE:', it.type, '===')
    console.log(JSON.stringify(it, null, 2).slice(0, 2500))
    console.log('\n')
  }
}
process.exit(0)
