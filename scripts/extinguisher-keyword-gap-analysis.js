/**
 * Find every gender reveal extinguisher / blaster keyword opportunity
 *  1. AU search volume on all variants
 *  2. Your 24-month account history (Search + PMAX) — what's converting
 *  3. Current Cannons campaign keyword inventory
 *  4. Gaps — high-volume queries you're NOT currently targeting
 *  5. Validate proposed negatives
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync } from 'fs'

const c = getGadsCustomer()
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

console.log(`\n=== EXTINGUISHER + BLASTER KEYWORD GAP ANALYSIS ===\n`)

// ─────────────────────────────────────────────
// 1. AU search volume on variants
// ─────────────────────────────────────────────
const CANDIDATES = [
  // CORE EXTINGUISHER
  'gender reveal extinguisher', 'gender reveal extinguisher australia',
  'gender reveal fire extinguisher', 'gender reveal powder extinguisher',
  'powder extinguisher gender reveal', 'extinguisher gender reveal',
  'extinguisher for gender reveal', 'powder fire extinguisher gender reveal',
  'gender reveal fire extinguisher australia',
  // COLOUR VARIANTS
  'pink extinguisher gender reveal', 'blue extinguisher gender reveal',
  'pink gender reveal extinguisher', 'blue gender reveal extinguisher',
  'pink powder extinguisher', 'blue powder extinguisher',
  // MEGA / MINI / SIZE
  'mini blaster gender reveal', 'mini blaster extinguisher',
  'mega blaster gender reveal', 'mega extinguisher gender reveal',
  'mega powder blaster', 'mega powder extinguisher',
  // BLASTER
  'gender reveal blaster', 'gender reveal powder blaster',
  'powder blaster gender reveal', 'powder blaster',
  'gender reveal colour blaster', 'gender reveal color blaster',
  'color blaster gender reveal', 'colour blaster gender reveal',
  // BIODEGRADABLE / ECO
  'biodegradable gender reveal extinguisher', 'eco gender reveal extinguisher',
  'biodegradable extinguisher gender reveal', 'eco friendly powder extinguisher',
  // BUYER INTENT
  'best gender reveal extinguisher', 'gender reveal extinguisher near me',
  'buy gender reveal extinguisher', 'cheap gender reveal extinguisher',
  'where to buy gender reveal extinguisher',
  // SMOKE/CANNON HYBRID
  'gender reveal smoke extinguisher', 'gender reveal cannon extinguisher',
  // BABY-RELATED
  'baby reveal extinguisher', 'baby shower extinguisher',
  // GEO
  'gender reveal extinguisher sydney', 'gender reveal extinguisher melbourne',
  'gender reveal extinguisher brisbane', 'gender reveal extinguisher perth',
  // BUNDLES
  'gender reveal extinguisher bundle', 'gender reveal extinguisher pack',
  'double gender reveal extinguisher', 'quad gender reveal extinguisher',
  // ADJACENT — fire extinguisher decor
  'small fire extinguisher gender reveal', 'powder fire extinguisher',
  'fire extinguisher gender reveal party',
  // POTENTIAL NEGATIVES TO VALIDATE
  'real fire extinguisher', 'fire extinguisher for sale',
  'fire extinguisher refill', 'co2 fire extinguisher',
  'water fire extinguisher', 'foam fire extinguisher',
  'fire extinguisher service', 'fire extinguisher inspection',
  'fire extinguisher cabinet', 'fire extinguisher bracket',
]

async function vol(keywords) {
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_code: 2036, language_code: 'en' }]),
  })
  return (await r.json()).tasks?.[0]?.result || []
}

console.log(`Querying ${CANDIDATES.length} keyword variants...`)
const volData = []
for (let i = 0; i < CANDIDATES.length; i += 100) {
  const batch = CANDIDATES.slice(i, i + 100)
  const r = await vol(batch)
  volData.push(...r)
  await new Promise(res => setTimeout(res, 500))
}

const volSorted = volData
  .filter(x => x.keyword)
  .map(x => ({ kw: x.keyword, monthly: x.search_volume || 0, cpc: x.cpc, comp: x.competition }))
  .sort((a, b) => (b.monthly || 0) - (a.monthly || 0))

console.log(`\n━━━ AU SEARCH VOLUME (${volSorted.length} keywords) ━━━`)
console.log('Vol/mo  | CPC    | Comp   | Keyword')
console.log('-'.repeat(80))
for (const v of volSorted) {
  if (v.monthly === 0) continue
  console.log(`${v.monthly.toString().padStart(6)}  | $${(v.cpc || 0).toFixed(2).padStart(4)} | ${(v.comp || '—').padEnd(6)} | "${v.kw}"`)
}
console.log(`\n(${volSorted.filter(v => v.monthly === 0).length} keywords returned 0 volume — skipped from display)`)

// ─────────────────────────────────────────────
// 2. 24-month account history
// ─────────────────────────────────────────────
console.log(`\n\n━━━ YOUR 24-MONTH ACCOUNT HISTORY — extinguisher/blaster terms ━━━\n`)

const PATTERN = /extinguisher|blaster/i

console.log('Pulling Search search-term history...')
const stData = await c.query(`
  SELECT campaign.name, search_term_view.search_term,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-29'
    AND metrics.impressions > 0
`)
const stAgg = new Map()
for (const r of stData) {
  const t = (r.search_term_view?.search_term || '').toLowerCase()
  if (!PATTERN.test(t)) continue
  if (!stAgg.has(t)) stAgg.set(t, { term: t, imp: 0, clk: 0, conv: 0, val: 0 })
  const x = stAgg.get(t)
  x.imp += Number(r.metrics?.impressions || 0)
  x.clk += Number(r.metrics?.clicks || 0)
  x.conv += Number(r.metrics?.conversions || 0)
  x.val += Number(r.metrics?.conversions_value || 0)
}
const stRanked = [...stAgg.values()].sort((a, b) => b.imp - a.imp)
console.log(`Search distinct extinguisher/blaster search terms: ${stRanked.length}\n`)
console.log('Imp   | Clk | Conv | Rev    | Search Term')
console.log('-'.repeat(85))
for (const x of stRanked.slice(0, 40)) {
  console.log(`${String(x.imp).padStart(4)}  | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | "${x.term}"`)
}

console.log('\nPulling PMAX category-label history...')
const pmaxData = await c.query(`
  SELECT campaign_search_term_insight.category_label,
         metrics.impressions, metrics.clicks,
         metrics.conversions, metrics.conversions_value
  FROM campaign_search_term_insight
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-29'
    AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
`)
const pmaxAgg = new Map()
for (const r of pmaxData) {
  const t = (r.campaign_search_term_insight?.category_label || '').toLowerCase()
  if (!PATTERN.test(t)) continue
  if (!pmaxAgg.has(t)) pmaxAgg.set(t, { lbl: t, imp: 0, clk: 0, conv: 0, val: 0 })
  const x = pmaxAgg.get(t)
  x.imp += Number(r.metrics?.impressions || 0)
  x.clk += Number(r.metrics?.clicks || 0)
  x.conv += Number(r.metrics?.conversions || 0)
  x.val += Number(r.metrics?.conversions_value || 0)
}
const pmaxRanked = [...pmaxAgg.values()].sort((a, b) => b.imp - a.imp)
console.log(`PMAX distinct extinguisher/blaster category labels: ${pmaxRanked.length}\n`)
console.log('Imp     | Clk | Conv | Rev    | Category Label')
console.log('-'.repeat(95))
for (const x of pmaxRanked.slice(0, 30)) {
  console.log(`${String(x.imp).padStart(6)}  | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | "${x.lbl}"`)
}

// ─────────────────────────────────────────────
// 3. Current Cannons campaign keyword inventory
// ─────────────────────────────────────────────
console.log(`\n\n━━━ CURRENT Cannons campaign — extinguisher/blaster positive keywords ━━━\n`)
const existing = await c.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE campaign.id = 21094179575
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.negative = FALSE
`)
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
const STATUS = {2:'ENABLED',3:'PAUSED',4:'REMOVED'}
const existingMap = new Map()
for (const r of existing) {
  const t = (r.ad_group_criterion?.keyword?.text || '').toLowerCase()
  if (!PATTERN.test(t)) continue
  const key = `${t}|${r.ad_group_criterion?.keyword?.match_type}`
  if (existingMap.has(key)) continue
  existingMap.set(key, {
    text: t,
    mt: MT[r.ad_group_criterion?.keyword?.match_type] || '?',
    status: STATUS[r.ad_group_criterion?.status] || r.ad_group_criterion?.status,
  })
}
console.log(`Extinguisher/blaster positive keywords currently in Cannons: ${existingMap.size}\n`)
for (const k of existingMap.values()) {
  console.log(`  [${k.mt.padEnd(6)}] [${k.status.padEnd(8)}] "${k.text}"`)
}

// ─────────────────────────────────────────────
// 4. Actionable gaps — high volume / proven conv, NOT active
// ─────────────────────────────────────────────
console.log(`\n\n━━━ ACTIONABLE GAPS — keywords you should ADD ━━━\n`)
const activeKeywordTexts = new Set()
for (const k of existingMap.values()) {
  if (k.status === 'ENABLED') activeKeywordTexts.add(k.text)
}

const gaps = []
for (const v of volSorted) {
  if ((v.monthly || 0) === 0) continue
  // Skip clearly non-product intent
  if (/inspection|service|cabinet|bracket|refill|foam|water|co2 fire/i.test(v.kw)) continue
  const alreadyActive = [...activeKeywordTexts].some(active =>
    active === v.kw || active.includes(v.kw) || v.kw.includes(active)
  )
  if (alreadyActive) continue
  const stMatch = stAgg.get(v.kw)
  const pmaxMatch = pmaxAgg.get(v.kw)
  // Also look for partial matches in our history
  let histImp = stMatch?.imp || 0
  let histConv = stMatch?.conv || 0
  let histRev = stMatch?.val || 0
  if (pmaxMatch) {
    histImp += pmaxMatch.imp
    histConv += pmaxMatch.conv
    histRev += pmaxMatch.val
  }
  gaps.push({
    keyword: v.kw,
    volume: v.monthly,
    cpc: v.cpc,
    competition: v.comp,
    historicalImp: histImp,
    historicalConv: histConv,
    historicalRev: histRev,
  })
}

console.log(`Candidates not currently active: ${gaps.length}\n`)
console.log('Vol/mo | CPC   | HistImp | HistConv | HistRev   | Keyword')
console.log('-'.repeat(100))
for (const g of gaps.sort((a, b) => (b.volume * Math.log(1 + b.historicalImp)) - (a.volume * Math.log(1 + a.historicalImp)))) {
  console.log(`${g.volume.toString().padStart(5)}  | $${(g.cpc || 0).toFixed(2).padStart(4)} | ${String(g.historicalImp).padStart(6)}  | ${g.historicalConv.toFixed(1).padStart(7)}  | $${g.historicalRev.toFixed(0).padStart(7)}  | "${g.keyword}"`)
}

// ─────────────────────────────────────────────
// 5. Validate proposed negatives
// ─────────────────────────────────────────────
console.log(`\n\n━━━ VALIDATE NEGATIVE CANDIDATES (no-conversion check) ━━━\n`)
const NEG_CANDIDATES = [
  'real fire extinguisher',
  'fire extinguisher for sale',
  'fire extinguisher refill',
  'fire extinguisher service',
  'fire extinguisher inspection',
  'fire extinguisher cabinet',
  'fire extinguisher bracket',
  'foam fire extinguisher',
  'water fire extinguisher',
  'co2 fire extinguisher',
]
for (const neg of NEG_CANDIDATES) {
  const stMatches = [...stAgg.values()].filter(x => x.term.includes(neg) || neg.includes(x.term))
  const pmaxMatches = [...pmaxAgg.values()].filter(x => x.lbl.includes(neg) || neg.includes(x.lbl))
  const totalImp = stMatches.reduce((s, x) => s + x.imp, 0) + pmaxMatches.reduce((s, x) => s + x.imp, 0)
  const totalConv = stMatches.reduce((s, x) => s + x.conv, 0) + pmaxMatches.reduce((s, x) => s + x.conv, 0)
  const verdict = totalConv >= 1 ? '🔴 DO NOT BLOCK' : totalImp >= 50 ? '🟡 review' : '✅ safe'
  const auVol = volSorted.find(v => v.kw === neg)?.monthly || 0
  console.log(`  "${neg}"  AU vol: ${auVol}/mo  history: ${totalImp} imp, ${totalConv.toFixed(1)} conv  → ${verdict}`)
}

mkdirSync('data/snapshots/extinguisher-gap', { recursive: true })
writeFileSync('data/snapshots/extinguisher-gap/analysis.json', JSON.stringify({
  searchTermHistory: stRanked,
  pmaxHistory: pmaxRanked,
  auVolume: volSorted,
  currentlyActive: [...existingMap.values()].filter(k => k.status === 'ENABLED'),
  actionableGaps: gaps,
}, null, 2))
console.log(`\nFull data: data/snapshots/extinguisher-gap/analysis.json`)
process.exit(0)
