/**
 * Find HD pregnancy lifestyle hero image via DataForSEO Google Images
 * Filter: large size, photos (not clipart)
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const queries = [
  'pregnant woman maternity photoshoot pink blue',
  'pregnancy announcement australia',
  'maternity belly photo',
  'pregnant mum announcement',
]

for (const q of queries) {
  console.log(`\n=== "${q}" ===`)
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/images/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:q, location_code:2036, language_code:'en', depth:20}])
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items || []
    const imageItems = items.filter(i => i.type === 'images_search' || i.type === 'image')
    if (!imageItems.length && items.length) {
      console.log(`  Available types: ${[...new Set(items.map(i=>i.type))].join(', ')}`)
    }
    for (const it of items.slice(0, 5)) {
      const url = it.source_url || it.image_url || it.url || it.original?.url
      const alt = (it.alt || it.title || '').slice(0,60)
      const sz = it.original ? `${it.original.width}x${it.original.height}` : (it.size||'')
      console.log(`  [${sz}] ${alt}`)
      console.log(`    ${url}`)
    }
  } catch (e) { console.log(`  ERR: ${e.message?.slice(0,80)}`) }
  await new Promise(r=>setTimeout(r,500))
}
process.exit(0)
