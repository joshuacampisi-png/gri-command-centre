/**
 * Fixed regex — GRI per-query Shopping presence
 * "Gender Reveal Ideas" has spaces, not /genderrevealideas/
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  'gender reveal cannons','gender reveal cannon','gender reveal extinguisher',
  'gender reveal','gender reveal ideas','gender reveal powder cannon',
  'gender reveal balloons','gender reveal bundle'
]

async function scrape(kw, device='desktop') {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device, depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

const isGRI = s => /gender\s*reveal\s*ideas?/i.test(s||'')
const normSeller = s => !s ? '' : s.split(' - ')[0].split('|')[0].trim()

console.log(`\n=== PER-QUERY GRI SHOPPING POSITIONS (CORRECTED) ===\n`)
console.log('Query                          | Desktop total | GRI desk | Mobile total | GRI mob | Positions')
console.log('-'.repeat(120))

for (const kw of QUERIES) {
  let dskTotal=0, dskGRI=0, mobTotal=0, mobGRI=0
  let positions = []
  for (const device of ['desktop','mobile']) {
    const items = await scrape(kw, device)
    let pos = 0
    for (const it of items) {
      if ((it.type==='popular_products'||it.type==='shopping_serp'||it.type==='shopping') && Array.isArray(it.items)) {
        for (const p of it.items) {
          pos++
          const seller = normSeller(p.seller||'')
          if (!seller) continue
          if (device==='desktop') dskTotal++; else mobTotal++
          if (isGRI(seller)) {
            if (device==='desktop') dskGRI++; else mobGRI++
            positions.push(`${device[0]}#${pos}`)
          }
        }
      }
    }
    await new Promise(r=>setTimeout(r,250))
  }
  console.log(`${kw.padEnd(30)} | ${String(dskTotal).padStart(13)} | ${String(dskGRI).padStart(8)} | ${String(mobTotal).padStart(12)} | ${String(mobGRI).padStart(7)} | ${positions.slice(0,8).join(',')}`)
}
process.exit(0)
