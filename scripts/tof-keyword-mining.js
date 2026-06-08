import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// TOF queries adjacent to "gender reveal" that AVOID the blocked phrase
const CANDIDATES = [
  // Baby shower cluster
  'baby shower','baby shower ideas','baby shower decorations','baby shower games',
  'baby shower themes','baby shower party','baby shower invitations','baby shower gifts',
  // Pregnancy announcement cluster
  'pregnancy announcement','pregnancy announcement ideas','pregnancy reveal','pregnancy reveal ideas',
  'maternity announcement','i am pregnant','we are expecting','baby on the way',
  // Boy or girl cluster
  'boy or girl','boy or girl game','pink or blue','team boy team girl','team pink team blue',
  // Scan / medical timing
  '12 week scan','20 week scan','anatomy scan','ultrasound results','dating scan',
  // Sex reveal (alternative phrasing)
  'sex reveal','sex reveal party','baby sex reveal','baby reveal',
  // Mum-to-be cluster
  'mum to be','mom to be','first time mum','new mum','expecting parents',
  // Big sibling
  'big sister announcement','big brother announcement','big sister shirt','big brother shirt',
  // Smoke bomb generic (high volume!)
  'smoke bomb','colored smoke','coloured smoke','smoke flare','pink smoke','blue smoke',
  // Confetti / balloon / party
  'confetti cannon','confetti popper','baby balloons','pink balloons','blue balloons',
  // Photography / event
  'newborn photography','pregnancy photoshoot','maternity photoshoot','reveal photoshoot',
]

const BATCH = 50
const chunks = []
for (let i=0; i<CANDIDATES.length; i+=BATCH) chunks.push(CANDIDATES.slice(i,i+BATCH))

const all = []
for (const ch of chunks) {
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{location_code:2036, language_code:'en', keywords:ch}])
  }).then(r=>r.json())
  for (const x of r.tasks?.[0]?.result||[]) all.push(x)
}

console.log('\n=== TOF / ADJACENT KEYWORDS — AU MONTHLY VOLUME ===\n')
console.log('Keyword                                  | Vol/mo  | CPC   | Comp')
console.log('-----------------------------------------+---------+-------+------')
for (const x of all.sort((a,b)=>(b.search_volume||0)-(a.search_volume||0))) {
  const v = x.search_volume||0
  if (v < 50) continue
  console.log(`${x.keyword.padEnd(40)} | ${String(v).padStart(7)} | $${(x.cpc||0).toFixed(2).padStart(5)} | ${x.competition_index||0}`)
}

const totalVol = all.reduce((s,x)=>s+(x.search_volume||0),0)
console.log(`\nTotal addressable TOF volume (AU): ${totalVol.toLocaleString()}/mo`)
process.exit(0)
