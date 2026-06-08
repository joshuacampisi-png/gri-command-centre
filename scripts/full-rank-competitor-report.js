/**
 * Full state + city rank report with competitor breakdown
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  // Capital cities (direct)
  { kw:'gender reveal sydney', cat:'City - Capital', priority:'TIER 1' },
  { kw:'gender reveal melbourne', cat:'City - Capital', priority:'TIER 1' },
  { kw:'gender reveal brisbane', cat:'City - Capital', priority:'TIER 1' },
  { kw:'gender reveal perth', cat:'City - Capital', priority:'TIER 1' },
  { kw:'gender reveal adelaide', cat:'City - Capital', priority:'TIER 1' },
  { kw:'gender reveal gold coast', cat:'City - Capital', priority:'TIER 1 (HQ)' },
  { kw:'gender reveal canberra', cat:'City - Capital', priority:'TIER 2' },
  { kw:'gender reveal darwin', cat:'City - Capital', priority:'TIER 2' },
  { kw:'gender reveal hobart', cat:'City - Capital', priority:'TIER 2' },
  // Major non-capital
  { kw:'gender reveal newcastle', cat:'City - Major', priority:'TIER 2' },
  { kw:'gender reveal sunshine coast', cat:'City - Major', priority:'TIER 2' },
  { kw:'gender reveal wollongong', cat:'City - Major', priority:'TIER 2' },
  { kw:'gender reveal geelong', cat:'City - Major', priority:'TIER 2' },
  { kw:'gender reveal cairns', cat:'City - Major', priority:'TIER 2' },
  // States
  { kw:'gender reveal nsw', cat:'State', priority:'TIER 1' },
  { kw:'gender reveal vic', cat:'State', priority:'TIER 1' },
  { kw:'gender reveal qld', cat:'State', priority:'TIER 1' },
  { kw:'gender reveal wa', cat:'State', priority:'TIER 1' },
  { kw:'gender reveal sa', cat:'State', priority:'TIER 1' },
  { kw:'gender reveal tas', cat:'State', priority:'TIER 2' },
  { kw:'gender reveal act', cat:'State', priority:'TIER 2' },
  { kw:'gender reveal nt', cat:'State', priority:'TIER 2' },
]

// Competitor classification
const US = 'genderrevealideas.com.au'
const COMPETITORS = {
  'confettified.com.au': 'Confettified',
  'genderrevealexpress.com.au': 'GR Express',
  'genderrevealer.com.au': 'Gender Revealer AU',
  'aussiereveals.com.au': 'Aussie Reveals',
  'babygendersurprise.com.au': 'Baby Gender Surprise',
  'genderrevealsaustralia.com.au': 'GR Australia',
  'genderrevealcannon.com.au': 'GR Cannon',
  'kaboomconfetti.com.au': 'Kaboom Confetti',
  'icandyballoons.com.au': 'iCandy Balloons',
  'preciouspreviews.com.au': 'Precious Previews (ultrasound)',
  'genderrevealfireworks.sydney': 'GR Fireworks Sydney',
  'sydneygenderrevealfireworks.com.au': 'Sydney GR Fireworks',
  'genderrevealcannon.com': 'GR Cannon (overseas)',
  'sky-ads.com.au': 'Sky Ads',
  'allfiredup.com.au': 'All Fired Up',
}
const MARKETPLACES = ['amazon.com.au','amazon.com','kmart.com.au','spotlight.com.au','bigw.com.au','woolworths.com.au','etsy.com','target.com.au','catch.com.au','ebay.com.au']
const BLOGS_INFO = ['cakeinabox','baby village','foodvoyageur','sanlorenzo','clubmusgrave','partybrisbane','partysource','riverquayfish','brookvaleballoons','theage.com.au','reddit.com','facebook.com','instagram.com','youtube.com']

function classify(url) {
  const u = (url||'').toLowerCase()
  if (u.includes('genderrevealideas.com.au')) return { type:'US', name:'YOU' }
  for (const [domain, name] of Object.entries(COMPETITORS)) if (u.includes(domain)) return { type:'COMPETITOR', name }
  if (MARKETPLACES.some(m => u.includes(m))) return { type:'MARKETPLACE', name:u.match(/[a-z]+\.com\.au|[a-z]+\.com/)?.[0]||'?' }
  if (BLOGS_INFO.some(b => u.includes(b))) return { type:'BLOG/INFO', name:u.match(/[a-z]+\.com\.au|[a-z]+\.com/)?.[0]||'?' }
  return { type:'OTHER', name:u.match(/[a-z][\w-]+\.[a-z][\w.-]+/)?.[0]||'?' }
}

console.log(`\n=== FULL STATE + CITY COMPETITIVE RANK REPORT — ${new Date().toISOString().slice(0,16)} ===\n`)

const allResults = []
const competitorSlots = {} // count slots per competitor

let i=0
for (const q of QUERIES) {
  i++
  process.stdout.write(`\r  [${i}/${QUERIES.length}] ${q.kw.slice(0,40).padEnd(40)}`)
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:q.kw, location_code:2036, language_code:'en', device:'desktop', depth:20}])
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items||[]
    const top10 = []
    let orgIdx=0, ourRank=null
    for (const it of items) {
      if (it.type==='organic') {
        orgIdx++
        if (orgIdx > 10) break
        const c = classify(it.url||it.domain||'')
        top10.push({ rank:orgIdx, domain:it.domain, name:c.name, type:c.type })
        if (c.type==='US' && !ourRank) ourRank = orgIdx
        if (c.type==='COMPETITOR') competitorSlots[c.name] = (competitorSlots[c.name]||0) + 1
      }
    }
    allResults.push({ ...q, ourRank, top10 })
  } catch (e) {
    allResults.push({ ...q, error: e.message?.slice(0,40) })
  }
  await new Promise(r=>setTimeout(r,200))
}
console.log('\n')

// Group by category
const cats = ['City - Capital','City - Major','State']
for (const cat of cats) {
  console.log(`\n══════════ ${cat.toUpperCase()} ══════════`)
  const rows = allResults.filter(r => r.cat===cat)
  for (const r of rows) {
    const rankStr = r.ourRank ? `#${r.ourRank}` : '—'
    const status = r.ourRank===1 ? '🥇' : r.ourRank<=3 ? '🥈' : r.ourRank<=10 ? '🥉' : '❌'
    console.log(`\n${status} "${r.kw}" — Our rank: ${rankStr} (${r.priority})`)
    console.log(`Rank | Domain                          | Who`)
    for (const t of r.top10||[]) {
      const flag = t.type==='US'?'🟢':t.type==='COMPETITOR'?'🔴':t.type==='MARKETPLACE'?'🟡':t.type==='BLOG/INFO'?'⚪':'⚫'
      console.log(`  ${String(t.rank).padStart(2)} | ${(t.domain||'').padEnd(32)} | ${flag} ${t.name}`)
    }
  }
}

// Competitor leaderboard
console.log(`\n\n══════════ COMPETITOR SLOT LEADERBOARD ══════════`)
console.log(`Total slots in top 10 across all ${QUERIES.length} queries: ${QUERIES.length*10}`)
console.log()
const sorted = Object.entries(competitorSlots).sort((a,b)=>b[1]-a[1])
console.log('Competitor                        | Slots | Share')
for (const [name, count] of sorted) {
  console.log(`${name.padEnd(33)} | ${String(count).padStart(5)} | ${(count/(QUERIES.length*10)*100).toFixed(1)}%`)
}

// Our share
let ourSlots = 0
for (const r of allResults) {
  for (const t of r.top10||[]) if (t.type==='US') ourSlots++
}
console.log(`\n🟢 YOU (genderrevealideas.com.au) | ${String(ourSlots).padStart(5)} | ${(ourSlots/(QUERIES.length*10)*100).toFixed(1)}%`)

// Scorecard
console.log(`\n══════════ SCORECARD ══════════`)
const ranking = allResults.filter(r=>r.ourRank).length
const top1 = allResults.filter(r=>r.ourRank===1).length
const top3 = allResults.filter(r=>r.ourRank&&r.ourRank<=3).length
const top10 = allResults.filter(r=>r.ourRank&&r.ourRank<=10).length
const lost = allResults.filter(r=>!r.ourRank).length
console.log(`Total queries:       ${allResults.length}`)
console.log(`We rank top 10:      ${top10} (${Math.round(top10/allResults.length*100)}%)`)
console.log(`We rank top 3:       ${top3} (${Math.round(top3/allResults.length*100)}%)`)
console.log(`We rank #1:          ${top1} (${Math.round(top1/allResults.length*100)}%)`)
console.log(`We don't rank top 10: ${lost} (${Math.round(lost/allResults.length*100)}%)`)
process.exit(0)
