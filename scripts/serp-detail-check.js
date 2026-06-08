import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = ['gender reveal gold coast','gender reveal brisbane','gender reveal sydney','gender reveal melbourne']

for (const kw of QUERIES) {
  console.log(`\n\n========== "${kw}" ==========`)
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:20}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items||[]
  let orgRank = 0
  for (const it of items) {
    if (it.type === 'organic') {
      orgRank++
      const isUs = /genderrevealideas\.com\.au/i.test(it.domain||it.url||'')
      console.log(`  ORG #${orgRank} (abs ${it.rank_absolute}) ${isUs?'🟢 US':'  '} ${it.domain?.padEnd(35)} ${(it.title||'').slice(0,55)}`)
    } else {
      console.log(`  [${it.type}] (abs ${it.rank_absolute}) ${it.title ? (it.title||'').slice(0,60) : `${(it.items||[]).length} items`}`)
    }
  }
  console.log(`\n  → Organic results above us would be #${orgRank-1} if we're the lowest US match`)
}
process.exit(0)
