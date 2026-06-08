import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Search Google Images for Pexels-hosted (free-license) pregnant woman photos
for (const q of ['pregnant woman site:pexels.com','pregnant belly site:pexels.com','maternity site:pexels.com']) {
  console.log(`\n=== "${q}" ===`)
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/images/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:q, location_code:2036, language_code:'en', depth:20}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items||[]
  for (const it of items.slice(0,8)) {
    const url = it.source_url || it.image_url || it.url || it.original?.url
    if (!url) continue
    if (!/pexels|images\.pexels/i.test(url)) continue
    const sz = it.original ? `${it.original.width}x${it.original.height}` : ''
    console.log(`  [${sz}] ${(it.alt||it.title||'').slice(0,60)}`)
    console.log(`    ${url}`)
  }
}
