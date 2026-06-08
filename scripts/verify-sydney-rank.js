/**
 * Verify "gender reveal sydney" rank — desktop + mobile, AU + Sydney metro
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const TESTS = [
  { label: 'AU desktop',         loc: 2036, device:'desktop' },
  { label: 'AU mobile',          loc: 2036, device:'mobile'  },
  { label: 'Sydney metro desktop', loc: 1000286, device:'desktop' }, // Sydney location_code
  { label: 'Sydney metro mobile',  loc: 1000286, device:'mobile'  },
]

async function scrape(loc, device) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:'gender reveal sydney', location_code:loc, language_code:'en', device, depth:20}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items||[]
}

console.log('\n=== "gender reveal sydney" rank verification ===\n')
for (const t of TESTS) {
  const items = await scrape(t.loc, t.device)
  const organic = items.filter(it=>it.type==='organic')
  const ours = organic.find(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
  console.log(`${t.label.padEnd(24)} | GRI: ${ours ? '#'+(ours.rank_absolute||ours.rank_group)+' '+(ours.url||'').replace('https://genderrevealideas.com.au','').slice(0,40) : 'NOT FOUND in top 20'}`)
  console.log(`  Top 5 actual:`)
  organic.slice(0,5).forEach(it => console.log(`    #${it.rank_absolute||it.rank_group} ${it.domain} — ${(it.title||'').slice(0,55)}`))
  console.log('')
  await new Promise(r=>setTimeout(r,400))
}
process.exit(0)
