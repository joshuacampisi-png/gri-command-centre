import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const HEAD = ['gender reveal','gender reveal ideas','gender reveal australia','gender reveal smoke bomb','gender reveal smoke bombs','gender reveal cannon','gender reveal cannons','gender reveal extinguisher','gender reveal powder','gender reveal balloon','gender reveal kit','gender reveal bundle','gender reveal burnout','gender reveal poppers']
const CITIES = ['sydney','melbourne','brisbane','perth','adelaide','gold coast','newcastle','canberra','darwin','hobart','wollongong','sunshine coast','geelong','cairns','central coast','launceston','townsville']
const STATES = ['nsw','vic','qld','wa','sa','tas','act','nt']
const QUERIES = [
  ...HEAD,
  ...CITIES.map(c=>`gender reveal ${c}`),
  ...CITIES.slice(0,10).map(c=>`gender reveal ideas ${c}`),
  ...STATES.map(s=>`gender reveal ${s}`),
]

console.log(`\n=== FULL RANK REPORT — ${new Date().toISOString().slice(0,16)} ===`)
console.log(`Scanning ${QUERIES.length} queries...\n`)

const results = []
let i=0
for (const kw of QUERIES) {
  i++
  process.stdout.write(`\r[${i}/${QUERIES.length}] ${kw.slice(0,50).padEnd(50)}`)
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items||[]
    let orgIdx = 0, ourOrgRank = null, ourUrl = null
    let inLocalPack = false, localPackRank = null
    for (const it of items) {
      if (it.type === 'organic') {
        orgIdx++
        if (/genderrevealideas\.com\.au/i.test(it.domain||it.url||'') && !ourOrgRank) {
          ourOrgRank = orgIdx
          ourUrl = (it.url||'').replace('https://genderrevealideas.com.au','')
        }
      } else if (it.type === 'local_pack') {
        // Check sub-items
        const subItems = it.items || (it.title ? [it] : [])
        for (const sub of subItems) {
          if (/gender reveal ideas/i.test(sub.title||sub.name||'')) {
            inLocalPack = true
            if (!localPackRank) localPackRank = sub.rank_absolute || 1
          }
        }
      }
    }
    results.push({ kw, orgRank: ourOrgRank, url: ourUrl, localPack: inLocalPack })
  } catch (e) {
    results.push({ kw, orgRank: null, error: e.message?.slice(0,30) })
  }
  await new Promise(r=>setTimeout(r,250))
}
console.log('\n')

// HEAD terms
console.log(`\n=== HEAD KEYWORDS ===`)
console.log('Query                                  | Org # | Local | URL')
console.log('---------------------------------------+-------+-------+-----------')
for (const x of results.filter(r => HEAD.includes(r.kw))) {
  const rank = x.orgRank ? `#${x.orgRank}`.padStart(4) : ' --- '
  const lp = x.localPack ? '✓' : ' '
  console.log(`${x.kw.padEnd(38)} | ${rank.padEnd(5)} | ${lp.padEnd(5)} | ${(x.url||'').slice(0,40)}`)
}

// Cities
console.log(`\n=== CITY KEYWORDS ===`)
console.log('Query                                  | Org # | Local | URL')
console.log('---------------------------------------+-------+-------+-----------')
const cityRows = results.filter(r => CITIES.some(c => r.kw.endsWith(c)))
cityRows.sort((a,b)=>(a.orgRank||99)-(b.orgRank||99))
for (const x of cityRows) {
  const rank = x.orgRank ? `#${x.orgRank}`.padStart(4) : ' --- '
  const lp = x.localPack ? '✓' : ' '
  console.log(`${x.kw.padEnd(38)} | ${rank.padEnd(5)} | ${lp.padEnd(5)} | ${(x.url||'').slice(0,40)}`)
}

// States
console.log(`\n=== STATE KEYWORDS ===`)
console.log('Query                                  | Org # | URL')
console.log('---------------------------------------+-------+-----------')
for (const x of results.filter(r => STATES.some(s => r.kw.endsWith(s)))) {
  const rank = x.orgRank ? `#${x.orgRank}`.padStart(4) : ' --- '
  console.log(`${x.kw.padEnd(38)} | ${rank.padEnd(5)} | ${(x.url||'').slice(0,40)}`)
}

// Summary
console.log(`\n=== SUMMARY ===`)
const total = results.length
const ranking = results.filter(r => r.orgRank).length
const top1 = results.filter(r => r.orgRank===1).length
const top3 = results.filter(r => r.orgRank && r.orgRank<=3).length
const top5 = results.filter(r => r.orgRank && r.orgRank<=5).length
const top10 = results.filter(r => r.orgRank && r.orgRank<=10).length
const localP = results.filter(r => r.localPack).length
console.log(`Total queries: ${total}`)
console.log(`Ranking organically: ${ranking} (${(ranking/total*100).toFixed(0)}%)`)
console.log(`Organic #1:    ${top1}  (${(top1/total*100).toFixed(0)}%)`)
console.log(`Top 3:         ${top3}  (${(top3/total*100).toFixed(0)}%)`)
console.log(`Top 5:         ${top5}  (${(top5/total*100).toFixed(0)}%)`)
console.log(`Top 10:        ${top10}  (${(top10/total*100).toFixed(0)}%)`)
console.log(`In Local Pack: ${localP}`)

// Not ranking
const notRanking = results.filter(r => !r.orgRank)
if (notRanking.length) {
  console.log(`\nNot ranking in top 30:`)
  for (const x of notRanking) console.log(`  - ${x.kw}`)
}
process.exit(0)
