import 'dotenv/config'
const D4S_USER = process.env.DATAFORSEO_USER || process.env.DFS_USER
const D4S_PASS = process.env.DATAFORSEO_PASS || process.env.DFS_PASS
const auth = 'Basic ' + Buffer.from(`${D4S_USER}:${D4S_PASS}`).toString('base64')

const KEYWORDS = [
  'gender reveal','gender reveal ideas','gender reveal party','gender reveal australia',
  'gender reveal cannon','gender reveal cannons','gender reveal smoke bomb','gender reveal smoke bombs',
  'gender reveal powder','gender reveal extinguisher','gender reveal balloon','gender reveal balloons',
  'gender reveal kit','gender reveal bundle','gender reveal cake','gender reveal decorations',
  'gender reveal confetti','gender reveal blaster','gender reveal sports','gender reveal football',
  'gender reveal golf','gender reveal soccer','gender reveal afl','gender reveal car','gender reveal burnout',
  'gender reveal tnt','gender reveal fireworks','gender reveal dry ice','pregnancy announcement',
  'pregnancy announcement ideas','baby shower ideas','baby shower decorations','boy or girl',
  'gender reveal sydney','gender reveal melbourne','gender reveal brisbane','gender reveal perth',
  'gender reveal adelaide','gender reveal gold coast'
]

// Use the dataforseo_labs endpoint with location_code 2036 (Australia)
const body = [{
  keywords: KEYWORDS,
  location_code: 2036,
  language_code: 'en',
}]

const r = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live', {
  method: 'POST',
  headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const j = await r.json()
console.log('status:', j.status_code, j.status_message)
console.log('tasks:', j.tasks?.length, 'cost:', j.cost)
const items = j?.tasks?.[0]?.result?.[0]?.items || []
console.log('items:', items.length)

let total = 0, cpcTotal = 0
console.log(`\nKeyword                                  | Vol/mo   | CPC    | Comp%`)
console.log(`-`.repeat(75))
for (const it of items.sort((a,b)=>(b.keyword_info?.search_volume||0)-(a.keyword_info?.search_volume||0))) {
  const k = it.keyword
  const ki = it.keyword_info || {}
  const v = ki.search_volume || 0
  const cpc = ki.cpc || 0
  const comp = ki.competition_index || 0
  total += v; cpcTotal += v*cpc
  console.log(`  ${k.padEnd(40)} | ${String(v).padStart(7)} | $${cpc.toFixed(2).padStart(5)} | ${String(comp).padStart(3)}`)
}

console.log(`\nTotal AU monthly search volume: ${total.toLocaleString()}`)
console.log(`Weighted avg CPC: $${total>0?(cpcTotal/total).toFixed(2):'n/a'}`)
process.exit(0)
