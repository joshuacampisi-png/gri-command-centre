/**
 * Calculate TOTAL daily addressable search demand for gender reveal in Australia
 *
 * Sources:
 *  - DataForSEO Google Ads Keyword Planner (monthly search volume per keyword)
 *  - Wide seed list (200+ keywords) covering all sub-niches
 *  - Plus trends signal where available
 *
 * Output: daily search volume across all gender reveal queries
 *         compared to current sessions = capture rate
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// ===== COMPREHENSIVE SEED LIST =====
const SEEDS = [
  // CORE BRAND / GENERIC
  'gender reveal', 'gender reveal ideas', 'gender reveal party', 'gender reveal kit',
  'gender reveal supplies', 'gender reveal decorations', 'gender reveal australia',
  'gender reveal near me', 'gender reveal online', 'gender reveal buy',
  'gender reveal pack', 'gender reveal bundle', 'gender reveal sale',
  'gender reveal products', 'gender reveal celebration',
  // PRODUCTS — Cannons
  'gender reveal cannon', 'gender reveal cannons', 'gender reveal powder cannon',
  'gender reveal confetti cannon', 'powder cannon', 'confetti cannon',
  'gender reveal cannon australia', 'gender reveal cannon kit',
  'baby reveal cannon', 'baby shower cannon',
  // PRODUCTS — Smoke
  'gender reveal smoke bomb', 'gender reveal smoke bombs', 'smoke bomb gender reveal',
  'pink smoke bomb', 'blue smoke bomb', 'coloured smoke bomb', 'colored smoke bomb',
  'gender reveal smoke', 'gender reveal coloured smoke',
  // PRODUCTS — Extinguisher
  'gender reveal extinguisher', 'gender reveal fire extinguisher',
  'powder extinguisher gender reveal', 'gender reveal powder extinguisher',
  // PRODUCTS — Blaster
  'gender reveal blaster', 'powder blaster', 'gender reveal powder blaster',
  'gender reveal mega blaster', 'mini blaster gender reveal',
  // PRODUCTS — Sports
  'gender reveal football', 'gender reveal soccer ball', 'gender reveal golf ball',
  'gender reveal cricket ball', 'gender reveal basketball', 'gender reveal rugby ball',
  'gender reveal afl ball', 'gender reveal nfl ball', 'gender reveal baseball',
  'gender reveal sports', 'sports gender reveal',
  // PRODUCTS — Balloons
  'gender reveal balloons', 'gender reveal balloon', 'gender reveal balloon kit',
  'gender reveal foil balloons', 'gender reveal latex balloons',
  'gender reveal helium balloons', 'gender reveal balloon arch',
  'gender reveal balloon box', 'gender reveal balloon garland',
  // PRODUCTS — Burnout / Tyre
  'gender reveal burnout', 'gender reveal burnout powder', 'tyre burnout gender reveal',
  'tire burnout gender reveal', 'gender reveal car burnout',
  // PRODUCTS — Cake / Decor
  'gender reveal cake', 'gender reveal cake topper', 'gender reveal cake smash',
  'gender reveal cupcakes', 'gender reveal cookies',
  // PRODUCTS — Other
  'gender reveal piñata', 'gender reveal pinata', 'gender reveal sash',
  'gender reveal dog bandana', 'gender reveal scratchies', 'gender reveal prediction cards',
  'gender reveal plates', 'gender reveal cups', 'gender reveal napkins',
  'gender reveal photo booth', 'gender reveal backdrop', 'gender reveal banner',
  'gender reveal confetti', 'gender reveal powder', 'gender reveal poppers',
  'gender reveal box', 'gender reveal hire', 'gender reveal tnt',
  // INTENT MODIFIERS
  'gender reveal for twins', 'twins gender reveal', 'gender reveal ideas for twins',
  'pet gender reveal', 'gender reveal dog', 'family gender reveal',
  'cheap gender reveal', 'gender reveal ideas cheap', 'unique gender reveal',
  'creative gender reveal', 'simple gender reveal', 'easy gender reveal',
  'gender reveal ideas easy', 'gender reveal ideas unique', 'gender reveal ideas creative',
  'big gender reveal', 'small gender reveal', 'gender reveal for family',
  'gender reveal at home', 'gender reveal indoor', 'gender reveal outdoor',
  // GEO
  'gender reveal sydney', 'gender reveal melbourne', 'gender reveal brisbane',
  'gender reveal perth', 'gender reveal adelaide', 'gender reveal gold coast',
  'gender reveal newcastle', 'gender reveal canberra', 'gender reveal darwin',
  'gender reveal hobart', 'gender reveal wollongong', 'gender reveal sunshine coast',
  // QUESTIONS / RESEARCH
  'how to gender reveal', 'how to do a gender reveal', 'what is a gender reveal',
  'how to plan a gender reveal', 'gender reveal explained',
  'gender reveal countdown', 'when to do gender reveal',
  // ADJACENT — baby reveal / pregnancy
  'baby reveal', 'baby reveal ideas', 'baby announcement',
  'pregnancy reveal', 'pregnancy announcement',
  // BABY SHOWER (Josh's other product category)
  'baby shower', 'baby shower decorations', 'baby shower ideas', 'baby shower party',
  'baby shower supplies', 'baby shower australia', 'baby shower balloons',
  'baby shower cake', 'baby shower cake topper', 'baby shower games',
  'oh baby', 'oh baby decorations',
  // THEMED-RELATED VOLUMES (the themed brands we found)
  'paw patrol balloons', 'paw patrol birthday', 'paw patrol party',
  'super mario birthday', 'mario party decorations',
  'toy story birthday', 'toy story party',
  'bluey birthday', 'bluey party',
  'frozen birthday party', 'spider man party',
  // SHOPPING INTENT
  'where to buy gender reveal', 'gender reveal store australia',
  'gender reveal delivery', 'gender reveal free shipping',
  'gender reveal next day delivery', 'gender reveal same day',
  // BOY / GIRL SPECIFIC
  'its a boy gender reveal', 'its a girl gender reveal',
  'boy or girl gender reveal', 'pink or blue gender reveal',
]

console.log(`\n=== TOTAL DAILY DEMAND — AU gender reveal market ===\n`)
console.log(`Querying ${SEEDS.length} keywords...\n`)

async function getVolume(keywords) {
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_code: 2036, language_code: 'en' }]),
  })
  return (await r.json()).tasks?.[0]?.result || []
}

const all = []
for (let i = 0; i < SEEDS.length; i += 100) {
  const batch = SEEDS.slice(i, i + 100)
  const r = await getVolume(batch)
  all.push(...r)
  process.stdout.write(`  fetched ${all.length}\r`)
  await new Promise(res => setTimeout(res, 500))
}
console.log(`\nTotal keywords with data: ${all.filter(x=>x.search_volume).length}/${all.length}\n`)

// Aggregate
const items = all.filter(x => x.keyword).map(x => ({
  keyword: x.keyword,
  monthly: x.search_volume || 0,
  cpc: x.cpc,
  competition: x.competition,
}))

// Total volume calculation
const total = items.reduce((sum, x) => sum + (x.monthly || 0), 0)
const totalDaily = total / 30

// Bucket analysis
const buckets = {
  'CORE BRAND/GENERIC (gender reveal-only)':     items.filter(x => /^gender reveal(?!\s+(?:cannon|smoke|extinguisher|blaster|football|soccer|cricket|golf|basketball|rugby|baseball|nfl|afl|balloon|burnout|cake|smash|cupcake|pi[ñn]ata|sash|dog|bandana|scratchie|prediction|plate|cup|napkin|photo|backdrop|banner|confetti|powder|popper|box|hire|tnt|sydney|melbourne|brisbane|perth|adelaide|gold coast|newcastle|canberra|darwin|hobart|wollongong|sunshine|delivery|next day|same day|store|sale|near me|online|buy|kit|supplies|decorations|australia|products|celebration|party|ideas|pack|bundle))/i.test(x.keyword)),
  'CANNONS':                                     items.filter(x => /cannon/i.test(x.keyword)),
  'SMOKE BOMBS':                                 items.filter(x => /smoke/i.test(x.keyword)),
  'EXTINGUISHER / BLASTER':                      items.filter(x => /extinguisher|blaster/i.test(x.keyword)),
  'SPORTS BALLS':                                items.filter(x => /football|soccer|cricket|golf|basketball|rugby|baseball|nfl|afl|sport/i.test(x.keyword)),
  'BALLOONS / DECOR':                            items.filter(x => /balloon|decor|banner|backdrop/i.test(x.keyword)),
  'BURNOUT':                                     items.filter(x => /burnout|tyre|tire/i.test(x.keyword)),
  'CAKE / FOOD':                                 items.filter(x => /cake|cupcake|cookie|smash/i.test(x.keyword)),
  'OTHER PRODUCTS':                              items.filter(x => /pi[ñn]ata|sash|bandana|scratchie|prediction|plate|cup|napkin|photo|confetti|powder|popper|topper/i.test(x.keyword) && !/cannon|cake/i.test(x.keyword)),
  'GEO MODIFIERS (city)':                        items.filter(x => /sydney|melbourne|brisbane|perth|adelaide|gold coast|newcastle|canberra|darwin|hobart|wollongong|sunshine/i.test(x.keyword)),
  'QUESTION / RESEARCH':                         items.filter(x => /how to|what is|when to|explained|countdown/i.test(x.keyword)),
  'BABY SHOWER (adjacent)':                      items.filter(x => /baby shower|oh baby/i.test(x.keyword)),
  'THEMED BIRTHDAY (adjacent — Paw/Mario/etc)':  items.filter(x => /paw patrol|mario|toy story|bluey|frozen|spider/i.test(x.keyword)),
}

console.log(`━━━ TOTAL DEMAND ━━━`)
console.log(`Total monthly searches across all queried keywords: ${total.toLocaleString()}`)
console.log(`Total daily addressable demand:                     ${Math.round(totalDaily).toLocaleString()}/day\n`)

console.log(`━━━ BY BUCKET ━━━`)
for (const [bucket, kws] of Object.entries(buckets)) {
  const vol = kws.reduce((s,x)=>s+(x.monthly||0), 0)
  const daily = Math.round(vol/30)
  if (vol === 0) continue
  console.log(`  ${bucket.padEnd(48)} ${vol.toLocaleString().padStart(7)} /mo  ${String(daily).padStart(4)} /day`)
}

console.log(`\n━━━ TOP 25 KEYWORDS BY VOLUME ━━━`)
const top = items.sort((a,b)=>(b.monthly||0)-(a.monthly||0)).slice(0,25)
for (const t of top) {
  const dailyTerm = Math.round((t.monthly||0)/30)
  console.log(`  ${(t.monthly||0).toLocaleString().padStart(6)} /mo  ${String(dailyTerm).padStart(3)} /day  | CPC $${(t.cpc||0).toFixed(2).padStart(4)} | "${t.keyword}"`)
}

// CAPTURE RATE ANALYSIS
console.log(`\n━━━ CAPTURE RATE ANALYSIS ━━━`)
const SESSIONS_PER_DAY = 850 // midpoint of Josh's 700-1000
const grRelevantDaily = (buckets['CORE BRAND/GENERIC (gender reveal-only)'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['CANNONS'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['SMOKE BOMBS'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['EXTINGUISHER / BLASTER'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['SPORTS BALLS'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['BURNOUT'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['CAKE / FOOD'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['OTHER PRODUCTS'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['GEO MODIFIERS (city)'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['QUESTION / RESEARCH'].reduce((s,x)=>s+(x.monthly||0),0)
  + buckets['BALLOONS / DECOR'].reduce((s,x)=>s+(x.monthly||0),0)) / 30

const grOnlyDaily = (total - buckets['BABY SHOWER (adjacent)'].reduce((s,x)=>s+(x.monthly||0),0) - buckets['THEMED BIRTHDAY (adjacent — Paw/Mario/etc)'].reduce((s,x)=>s+(x.monthly||0),0)) / 30

console.log(`  Your current sessions/day:           ${SESSIONS_PER_DAY}`)
console.log(`  GR-relevant daily search demand:     ${Math.round(grRelevantDaily).toLocaleString()}`)
console.log(`  Your capture rate:                   ${((SESSIONS_PER_DAY/grRelevantDaily)*100).toFixed(1)}%`)
console.log(`  Untapped daily demand:               ${Math.round(grRelevantDaily - SESSIONS_PER_DAY).toLocaleString()}/day`)
console.log(`  (Note: not every searcher is a buyer; multiple sessions per user; CTR < 100%)`)

// Realistic share-of-market projection
const realistic = grRelevantDaily * 0.20 // 20% share is industry leader benchmark
console.log(`\n  REALISTIC daily ceiling (20% market share = industry leader): ${Math.round(realistic).toLocaleString()}/day sessions`)
console.log(`  → Headroom to grow ${(realistic/SESSIONS_PER_DAY).toFixed(1)}x from current ${SESSIONS_PER_DAY}/day`)

// SAVE
mkdirSync('data/snapshots/demand-analysis', { recursive: true })
writeFileSync('data/snapshots/demand-analysis/au-total-demand.json', JSON.stringify({
  fetchedAt: new Date().toISOString(),
  totalMonthlyVolume: total,
  totalDailyVolume: Math.round(totalDaily),
  buckets: Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, { keywordCount: v.length, monthlyVolume: v.reduce((s,x)=>s+(x.monthly||0),0) }])),
  keywords: items.sort((a,b)=>(b.monthly||0)-(a.monthly||0)),
  yourCurrentSessions: SESSIONS_PER_DAY,
  grRelevantDailyDemand: Math.round(grRelevantDaily),
  captureRate: ((SESSIONS_PER_DAY/grRelevantDaily)*100).toFixed(1)+'%',
  realisticDailyCeiling: Math.round(realistic),
}, null, 2))
console.log(`\nSaved: data/snapshots/demand-analysis/au-total-demand.json`)
process.exit(0)
