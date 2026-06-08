import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const kws = ['gender reveal ideas','gender reveal','gender reveal smoke bombs','gender reveal cannon','gender reveal extinguisher','gender reveal australia','gender reveal smoke bomb','gender reveal balloon','gender reveal powder','gender reveal kit']
const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
  method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{location_code:2036, language_code:'en', keywords:kws}])
}).then(r=>r.json())
const rows = r.tasks?.[0]?.result||[]
console.log('Keyword                          | AU Vol/mo | CPC   | Comp')
console.log('---------------------------------+-----------+-------+------')
for (const x of rows.sort((a,b)=>(b.search_volume||0)-(a.search_volume||0))) {
  console.log(`${x.keyword.padEnd(33)} | ${String(x.search_volume||0).padStart(9)} | $${(x.cpc||0).toFixed(2).padStart(5)} | ${x.competition_index||0}`)
}
