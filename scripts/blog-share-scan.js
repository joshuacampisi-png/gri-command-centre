/**
 * Blog/informational-query share scan
 * Looks specifically at INFORMATIONAL queries (how/why/what/ideas) where
 * blog content typically wins, and measures what % of top-10 results are GRI blogs.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const auth = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const BLOG_QUERIES = [
  // Dry ice
  'dry ice gender reveal',
  'how to do a dry ice gender reveal',
  'gender reveal dry ice',
  // DIY / How-to
  'how to do a gender reveal',
  'diy gender reveal',
  'how to make gender reveal smoke',
  'easy gender reveal ideas',
  'simple gender reveal ideas',
  'cheap gender reveal ideas',
  'small gender reveal ideas',
  'intimate gender reveal ideas',
  'gender reveal ideas at home',
  'best gender reveal ideas',
  'creative gender reveal ideas',
  'unique gender reveal ideas',
  // Photo / aesthetic
  'gender reveal photos',
  'smoke bomb gender reveal photos',
  'gender reveal photoshoot',
  // Party/setup
  'gender reveal party ideas',
  'outdoor gender reveal ideas',
  'gender reveal for family',
  'gender reveal countdown',
  // Comparison / understanding
  'what is a gender reveal',
  'gender reveal vs baby shower',
  'when to have a gender reveal',
  // Sports
  'sports gender reveal ideas',
  'football gender reveal',
  // Seasonal
  'winter gender reveal ideas',
  'summer gender reveal ideas',
  'christmas gender reveal ideas',
]

const ORGANIC_CTR = {1:0.30,2:0.15,3:0.10,4:0.07,5:0.05,6:0.04,7:0.03,8:0.025,9:0.02,10:0.018}

function classify(url, domain) {
  if (!url && !domain) return 'unknown'
  const u = (url || '').toLowerCase()
  const d = (domain || '').toLowerCase()
  if (/genderrevealideas\.com\.au\/blogs\//i.test(u)) return 'GRI Blog'
  if (/genderrevealideas/i.test(d)) return 'GRI (non-blog)'
  if (/confettified/i.test(d)) return 'Confettified'
  if (/etsy/i.test(d)) return 'Etsy'
  if (/amazon/i.test(d)) return 'Amazon'
  if (/pinterest|instagram|tiktok|facebook/i.test(d)) return 'Social'
  if (/youtube/i.test(d)) return 'YouTube'
  if (/kmart|bigw|spotlight|kogan/i.test(d)) return 'BigBox'
  if (/reddit|quora|mumsnet/i.test(d)) return 'Forum'
  if (/wikihow|hellomagazine|popsugar|momjunction|theknot|brides|babycenter|whattoexpect|peanut/i.test(d)) return 'Big Media Blog'
  // Treat any blog-style page as a blog
  if (/\/blog|\/blogs\/|\/article|\/guide|\/ideas/.test(u)) return 'Other Blog'
  return 'Other Site'
}

async function getSerp(q) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:auth,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:q, location_code:2036, language_code:'en', device:'desktop', depth:30}])
  })
  return r.json()
}

console.log(`\n=== BLOG/INFORMATIONAL QUERY SHARE — Australia ===\n`)
console.log(`Scanning ${BLOG_QUERIES.length} informational queries...\n`)

const results = []
for (let i = 0; i < BLOG_QUERIES.length; i++) {
  const q = BLOG_QUERIES[i]
  process.stdout.write(`[${(i+1).toString().padStart(2)}/${BLOG_QUERIES.length}] ${q.padEnd(42)} `)
  try {
    const j = await getSerp(q)
    const items = (j?.tasks?.[0]?.result?.[0]?.items || []).filter(it => it.type === 'organic' && it.rank_absolute <= 10)
    const slots = items.map(it => ({ pos: it.rank_absolute, domain: it.domain, url: it.url, type: classify(it.url, it.domain) }))
    const gri = slots.find(s => s.type === 'GRI Blog' || s.type === 'GRI (non-blog)')
    process.stdout.write(`GRI: ${gri ? '#'+gri.pos+' ('+gri.type+')' : '— not in top 10'}\n`)
    results.push({ query: q, slots, gri })
    await new Promise(r=>setTimeout(r,400))
  } catch (e) { console.log('ERR:',e.message); results.push({query:q,error:e.message}) }
}

console.log(`\n=== BLOG SHARE ROLLUP ===\n`)
const valid = results.filter(r => !r.error)
const N = valid.length

const tally = {}
let totalSlots = 0
for (const r of valid) {
  for (const s of r.slots) {
    if (!tally[s.type]) tally[s.type] = { slots:0, top3:0, '1':0, posSum:0 }
    tally[s.type].slots++
    if (s.pos === 1) tally[s.type]['1']++
    if (s.pos <= 3) tally[s.type].top3++
    tally[s.type].posSum += s.pos
    totalSlots++
  }
}

console.log(`Total top-10 slots scanned: ${totalSlots} across ${N} queries\n`)
console.log(`Player                    | Slots | #1 | Top3 | Avg pos | % of all slots`)
console.log(`-`.repeat(80))
for (const [name, t] of Object.entries(tally).sort((a,b)=>b[1].slots-a[1].slots)) {
  const avg = (t.posSum/t.slots).toFixed(1)
  const pct = (t.slots/totalSlots*100).toFixed(0)
  console.log(`  ${name.padEnd(24)} | ${String(t.slots).padStart(5)} | ${String(t['1']).padStart(2)} | ${String(t.top3).padStart(4)} | ${avg.padStart(7)} | ${pct.padStart(5)}%`)
}

// GRI specifically
const griBlog = tally['GRI Blog']?.slots || 0
const griNonBlog = tally['GRI (non-blog)']?.slots || 0
const griTotal = griBlog + griNonBlog
const griTop1 = (tally['GRI Blog']?.['1']||0) + (tally['GRI (non-blog)']?.['1']||0)
const griTop3 = (tally['GRI Blog']?.top3||0) + (tally['GRI (non-blog)']?.top3||0)

console.log(`\n=== GRI BLOG SHARE ===\n`)
console.log(`GRI Blog (/blogs/news/*) slots: ${griBlog}`)
console.log(`GRI non-blog (product/collection) slots: ${griNonBlog}`)
console.log(`GRI total slots: ${griTotal} / ${totalSlots} (${(griTotal/totalSlots*100).toFixed(0)}% of all top-10 positions)`)
console.log(`GRI ranking in top 10: ${valid.filter(r => r.gri).length}/${N} queries (${(valid.filter(r=>r.gri).length/N*100).toFixed(0)}%)`)
console.log(`GRI #1: ${griTop1}/${N} queries (${(griTop1/N*100).toFixed(0)}%)`)
console.log(`GRI top 3: ${griTop3}/${N} queries (${(griTop3/N*100).toFixed(0)}%)`)

// Click share
let griCtr=0, otherCtr=0
for (const r of valid) {
  for (const s of r.slots) {
    const ctr = ORGANIC_CTR[s.pos]||0
    if (s.type === 'GRI Blog' || s.type === 'GRI (non-blog)') griCtr += ctr
    else otherCtr += ctr
  }
}
console.log(`\n=== ESTIMATED INFORMATIONAL CLICK SHARE ===\n`)
console.log(`GRI avg CTR per query: ${(griCtr/N*100).toFixed(1)}%`)
console.log(`Everyone else avg CTR: ${(otherCtr/N*100).toFixed(1)}%`)
console.log(`GRI share of clicked traffic: ${(griCtr/(griCtr+otherCtr)*100).toFixed(0)}%`)

// Per-query detail
console.log(`\n=== QUERY-BY-QUERY (GRI presence) ===\n`)
console.log(`Query                                       | GRI pos | Type`)
console.log(`-`.repeat(80))
for (const r of valid) {
  const griPos = r.gri ? '#'+r.gri.pos : '— not ranking'
  const type = r.gri ? r.gri.type : ''
  console.log(`  ${r.query.padEnd(43)} | ${String(griPos).padStart(7)} | ${type}`)
}

// Gap opportunities — queries where GRI doesn't rank
const gaps = valid.filter(r => !r.gri)
console.log(`\n=== ${gaps.length} QUERIES GRI IS NOT IN TOP 10 (build content for these) ===\n`)
for (const g of gaps) {
  const top3 = g.slots.slice(0,3).map(s=>`#${s.pos} ${s.type}`).join(', ')
  console.log(`  "${g.query}" — top 3: ${top3}`)
}

mkdirSync('data/snapshots/blog-share', { recursive: true })
writeFileSync(`data/snapshots/blog-share/${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(results,null,2))

process.exit(0)
