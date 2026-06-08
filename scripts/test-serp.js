import 'dotenv/config'
const auth = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_USER}:${process.env.DATAFORSEO_PASS}`).toString('base64')
const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
  method:'POST', headers:{Authorization:auth,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal cannons', location_code:2036, language_code:'en', device:'desktop', depth:30}])
})
const j = await r.json()
console.log('status:', j.status_code, j.status_message)
const items = j?.tasks?.[0]?.result?.[0]?.items || []
console.log('items:', items.length, 'types:', [...new Set(items.map(i=>i.type))])
for (const it of items.slice(0,5)) console.log({type:it.type, rank:it.rank_absolute, domain:it.domain, url:it.url?.slice(0,80)})
