/**
 * Paid Search competitive intelligence — Google Ads
 *  - 15 high-intent AU queries
 *  - For each: who's running text ads (top+bottom) + Shopping PLA
 *  - Aggregate share of voice
 *  - Identify #1/#2/#3 for each query
 *  - Spot dominant product themes
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  // Core / generic high-intent
  'gender reveal ideas',
  'gender reveal cannon',
  'gender reveal cannons',
  'gender reveal smoke bomb',
  'gender reveal smoke bombs',
  'gender reveal extinguisher',
  'gender reveal australia',
  'gender reveal kit',
  'gender reveal party',
  'gender reveal bundle',
  'confetti cannon',
  'confetti cannon australia',
  'baby shower decorations',
  'gender reveal balloons',
  'gender reveal cake',
]

const US_DOMAINS = ['genderrevealideas.com.au']

const KNOWN_COMPETITORS = {
  'joyful':           ['joyfulreveals.com','joyfulreveals.com.au'],
  'celebrationhq':    ['celebrationhq.com','celebrationhq.com.au'],
  'confettified':     ['confettified.com.au'],
  'aussiereveals':    ['aussiereveals.com.au'],
  'genderrevealcannon':['genderrevealcannon.com.au'],
  'genderrevealer':   ['genderrevealer.com.au','www.genderrevealer.com.au'],
  'kaboomconfetti':   ['kaboomconfetti.com.au','www.kaboomconfetti.com.au'],
  'kingconfetti':     ['kingconfetti.com.au'],
  'bowerbirdbride':   ['bowerbirdbride.com.au','www.bowerbirdbride.com.au'],
  'amazon':           ['amazon.com.au','www.amazon.com.au','amazon.com'],
  'etsy':             ['etsy.com','www.etsy.com'],
  'kmart':            ['kmart.com.au','www.kmart.com.au'],
  'bigw':             ['bigw.com.au','www.bigw.com.au'],
  'target':           ['target.com.au','www.target.com.au'],
  'spotlight':        ['spotlight.com.au','www.spotlight.com.au'],
  'ebay':             ['ebay.com.au','www.ebay.com.au'],
  'catch':            ['catch.com.au','www.catch.com.au'],
  'temu':             ['temu.com'],
  'shein':            ['shein.com','au.shein.com'],
}

function classify(domain) {
  if (!domain) return 'unknown'
  const d = domain.toLowerCase()
  if (US_DOMAINS.some(u => d.includes(u))) return 'US (Gender Reveal Ideas)'
  for (const [name, doms] of Object.entries(KNOWN_COMPETITORS)) {
    if (doms.some(x => d.includes(x))) return name
  }
  return d
}

async function scrapeAdvanced(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword: kw,
      location_code: 2036, // AU
      language_code: 'en',
      device: 'desktop',
      depth: 30,
    }]),
  })
  const j = await r.json()
  return j.tasks?.[0]?.result?.[0]?.items || []
}

console.log(`\n=== PAID COMPETITIVE AUDIT — ${new Date().toISOString().slice(0,10)} ===\n`)
console.log(`Scanning ${QUERIES.length} AU queries...\n`)

const allData = []
for (const q of QUERIES) {
  process.stdout.write(`  ${q.padEnd(38)}`)
  try {
    const items = await scrapeAdvanced(q)
    const textAds  = items.filter(i => i.type === 'paid' || i.type === 'paid_with_seller' || i.type === 'shopping_with_seller' || /^paid/i.test(i.type||''))
    const shopping = items.filter(i => /shopping/i.test(i.type||''))
    const organic  = items.filter(i => i.type === 'organic')
    const adsCnt    = textAds.length
    const shopCnt   = shopping.length
    const orgCnt    = organic.length
    console.log(`ads:${adsCnt} shop:${shopCnt} org:${orgCnt}`)
    allData.push({ q, textAds, shopping, organic })
  } catch (e) {
    console.log(`ERR ${e.message?.slice(0,40)}`)
    allData.push({ q, textAds: [], shopping: [], organic: [], error: e.message })
  }
  await new Promise(rs => setTimeout(rs, 600))
}

// ── Aggregate paid text ad share of voice ──
console.log(`\n\n━━━ TEXT ADS — SHARE OF VOICE (across ${QUERIES.length} queries) ━━━\n`)
const textAdAppearances = new Map()
for (const row of allData) {
  for (const ad of row.textAds || []) {
    const dom = classify(ad.domain || ad.url || '')
    if (!textAdAppearances.has(dom)) textAdAppearances.set(dom, { appearances: 0, topSlots: 0, queries: new Set() })
    const x = textAdAppearances.get(dom)
    x.appearances++
    x.queries.add(row.q)
    if (ad.rank_absolute && ad.rank_absolute <= 4) x.topSlots++
  }
}
console.log('Domain'.padEnd(36) + ' | Ads | TopSlot | Queries appeared on')
console.log('-'.repeat(110))
for (const [dom, x] of [...textAdAppearances.entries()].sort((a,b) => b[1].appearances - a[1].appearances)) {
  const flag = dom.includes('Gender Reveal Ideas') ? '👈 YOU' : ''
  console.log(`${dom.slice(0,34).padEnd(36)} | ${String(x.appearances).padStart(3)} | ${String(x.topSlots).padStart(6)}  | ${[...x.queries].slice(0,5).join(', ').slice(0,55)}${flag}`)
}

// ── Shopping carousel share of voice ──
console.log(`\n\n━━━ SHOPPING CAROUSEL — SHARE OF VOICE ━━━\n`)
const shopAppearances = new Map()
for (const row of allData) {
  for (const item of row.shopping || []) {
    // Each shopping item may contain a nested items[] with sub-products
    const subs = Array.isArray(item.items) ? item.items : [item]
    for (const s of subs) {
      const shop = s.shop || s.source || s.domain || s.url || ''
      const dom = classify(shop)
      if (!shopAppearances.has(dom)) shopAppearances.set(dom, { appearances: 0, queries: new Set() })
      const x = shopAppearances.get(dom)
      x.appearances++
      x.queries.add(row.q)
    }
  }
}
if (shopAppearances.size === 0) {
  console.log('  No shopping items found in any query (DataForSEO may not be returning PLA data for these queries).')
} else {
  console.log('Domain'.padEnd(36) + ' | Slots | Queries appeared on')
  console.log('-'.repeat(110))
  for (const [dom, x] of [...shopAppearances.entries()].sort((a,b) => b[1].appearances - a[1].appearances).slice(0, 25)) {
    const flag = dom.includes('Gender Reveal Ideas') ? '👈 YOU' : ''
    console.log(`${dom.slice(0,34).padEnd(36)} | ${String(x.appearances).padStart(5)} | ${[...x.queries].slice(0,5).join(', ').slice(0,55)}${flag}`)
  }
}

// ── Per-query #1/#2/#3 leaderboard ──
console.log(`\n\n━━━ PER-QUERY LEADERBOARD — Top 3 PAID + ORGANIC ━━━\n`)
for (const row of allData) {
  console.log(`\n[${row.q}]`)
  const adsTop = (row.textAds || []).slice(0, 3)
  const orgTop = (row.organic || []).slice(0, 3)
  console.log(`  Top 3 Text Ads:`)
  if (!adsTop.length) console.log(`    (no text ads detected — query may have no commercial competition)`)
  for (let i = 0; i < adsTop.length; i++) {
    const a = adsTop[i]
    console.log(`    ${i+1}. ${classify(a.domain||a.url||'').padEnd(28)} | ${(a.title||'').slice(0,60)}`)
  }
  console.log(`  Top 3 Organic:`)
  for (let i = 0; i < orgTop.length; i++) {
    const o = orgTop[i]
    const flag = US_DOMAINS.some(u => (o.domain||o.url||'').includes(u)) ? '👈 YOU' : ''
    console.log(`    ${i+1}. ${classify(o.domain||o.url||'').padEnd(28)} | ${(o.title||'').slice(0,60)}${flag}`)
  }
}

mkdirSync('data/snapshots/paid-competitive-audit', { recursive: true })
writeFileSync('data/snapshots/paid-competitive-audit/audit.json', JSON.stringify({
  fetchedAt: new Date().toISOString(),
  queries: QUERIES,
  textAdSOV: Object.fromEntries([...textAdAppearances.entries()].map(([k,v])=>[k,{...v, queries:[...v.queries]}])),
  shoppingSOV: Object.fromEntries([...shopAppearances.entries()].map(([k,v])=>[k,{...v, queries:[...v.queries]}])),
  rawData: allData,
}, null, 2))
console.log(`\nFull data: data/snapshots/paid-competitive-audit/audit.json`)
process.exit(0)
