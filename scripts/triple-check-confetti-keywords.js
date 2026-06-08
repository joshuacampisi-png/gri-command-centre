/**
 * Triple-check confetti cannon keyword strategy:
 *  1. Pull ALL confetti cannon search-term history from your account (search_term_view + PMAX)
 *  2. Pull AU search volume for every relevant variant
 *  3. Cross-reference with current campaign keyword list (what's already covered)
 *  4. Identify HIGH-VOLUME or HIGH-CONVERSION queries we're NOT actively targeting
 *  5. Validate each proposed negative — make sure it has zero conversion history
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync } from 'fs'

const c = getGadsCustomer()
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

console.log(`\n=== TRIPLE-CHECK CONFETTI CANNON KEYWORDS ===\n`)

// ─────────────────────────────────────────────
// PART 1: All search-term history (Search campaigns + PMAX) — 24 months max available
// ─────────────────────────────────────────────
console.log('━━━ 1. ALL "confetti cannon" search-term history (24 months) ━━━\n')

const stHistory = await c.query(`
  SELECT campaign.name, search_term_view.search_term,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-29'
    AND metrics.impressions > 0
`)
const stAgg = new Map()
for (const r of stHistory) {
  const term = (r.search_term_view?.search_term||'').toLowerCase()
  if (!/confetti\s*cannon/i.test(term)) continue
  if (!stAgg.has(term)) stAgg.set(term, { term, imp:0, clk:0, spend:0, conv:0, val:0, campaigns:new Set() })
  const x = stAgg.get(term)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
  x.campaigns.add(r.campaign?.name)
}

const ranked = [...stAgg.values()].sort((a,b)=>b.imp - a.imp)
console.log(`Total distinct confetti cannon search terms (24mo): ${ranked.length}\n`)
console.log('Imp    | Clk | Conv | Rev    | Search Term')
console.log('-'.repeat(90))
for (const x of ranked) {
  console.log(`${String(x.imp).padStart(5)}  | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | "${x.term}"`)
}

// PMAX
console.log(`\n\n━━━ 2. ALL PMAX category labels matching "confetti cannon" (24 months) ━━━\n`)
const pmaxHistory = await c.query(`
  SELECT campaign_search_term_insight.category_label,
         metrics.impressions, metrics.clicks,
         metrics.conversions, metrics.conversions_value
  FROM campaign_search_term_insight
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-29'
    AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
`)
const pmaxAgg = new Map()
for (const r of pmaxHistory) {
  const lbl = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
  if (!/confetti\s*cannon/i.test(lbl)) continue
  if (!pmaxAgg.has(lbl)) pmaxAgg.set(lbl, { lbl, imp:0, clk:0, conv:0, val:0 })
  const x = pmaxAgg.get(lbl)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
const pmaxRanked = [...pmaxAgg.values()].sort((a,b)=>b.imp - a.imp)
console.log(`Total distinct PMAX category labels (24mo): ${pmaxRanked.length}\n`)
console.log('Imp     | Clk | Conv | Rev    | Category Label')
console.log('-'.repeat(95))
for (const x of pmaxRanked.slice(0, 30)) {
  console.log(`${String(x.imp).padStart(6)}  | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | "${x.lbl}"`)
}

// ─────────────────────────────────────────────
// PART 3: AU search volume for candidate keywords
// ─────────────────────────────────────────────
console.log(`\n\n━━━ 3. AU SEARCH VOLUME — candidate keywords (live DataForSEO pull) ━━━\n`)

const CANDIDATES = [
  // Already proposed positives
  'confetti cannon australia',
  'confetti cannons australia',
  'biodegradable confetti cannon',
  // Additional high-intent candidates
  'confetti cannon gender reveal',
  'gender reveal confetti cannons',
  'gender reveal confetti cannon',
  'biodegradable confetti cannon gender reveal',
  'biodegradable confetti cannons',
  'eco confetti cannon',
  'eco friendly confetti cannon',
  'large confetti cannon',
  'large confetti cannons',
  'xl confetti cannon',
  'handheld confetti cannon',
  'handheld confetti cannons',
  'pink confetti cannon',
  'blue confetti cannon',
  'gender confetti cannon',
  'baby gender confetti cannon',
  'baby reveal confetti cannon',
  'confetti cannon near me',
  'confetti cannons near me',
  'confetti cannon for sale',
  'confetti cannons for sale',
  'confetti cannon buy',
  'australian made confetti cannon',
  'gender reveal cannon',
  'gender reveal cannons',
  'powder confetti cannon',
  'gender reveal confetti popper',
  // Proposed negatives (verify these are LOW intent)
  'wedding confetti cannon',
  'wedding confetti',
  'dj confetti cannon',
  'stage confetti cannon',
  'rice paper confetti cannon',
  'silver confetti cannon',
  'gold confetti cannon',
  'red confetti cannon',
  'white confetti cannon',
  'red white and blue confetti cannon',
  'biodegradable wedding confetti',
]

async function vol(keywords) {
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method:'POST',
    headers: {Authorization: AUTH, 'Content-Type': 'application/json'},
    body: JSON.stringify([{ keywords, location_code: 2036, language_code: 'en' }]),
  })
  return (await r.json()).tasks?.[0]?.result || []
}
const volData = []
for (let i = 0; i < CANDIDATES.length; i += 100) {
  const batch = CANDIDATES.slice(i, i + 100)
  const r = await vol(batch)
  volData.push(...r)
  await new Promise(res => setTimeout(res, 500))
}

const volSorted = volData
  .map(x => ({ kw: x.keyword, monthly: x.search_volume || 0, cpc: x.cpc, comp: x.competition }))
  .sort((a,b) => (b.monthly||0) - (a.monthly||0))
console.log('Monthly | CPC    | Comp   | Keyword')
console.log('-'.repeat(80))
for (const v of volSorted) {
  const vol = (v.monthly||0).toLocaleString().padStart(6)
  const cpc = v.cpc != null ? `$${v.cpc.toFixed(2)}`.padStart(6) : '   —  '
  const comp = (v.comp || '—').padEnd(6)
  console.log(`${vol}  | ${cpc} | ${comp} | "${v.kw}"`)
}

// ─────────────────────────────────────────────
// PART 4: Current Cannons campaign keyword inventory
// ─────────────────────────────────────────────
console.log(`\n\n━━━ 4. CURRENT Cannons campaign keyword inventory (all confetti cannon variants) ━━━\n`)
const existingKW = await c.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.conversions
  FROM keyword_view
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND ad_group_criterion.negative = FALSE
    AND segments.date DURING LAST_90_DAYS
`)
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
const STATUS = {2:'ENABLED',3:'PAUSED',4:'REMOVED'}
const existingMap = new Map()
for (const r of existingKW) {
  const text = (r.ad_group_criterion?.keyword?.text||'').toLowerCase()
  if (!/confetti/i.test(text) && !/cannon/i.test(text)) continue
  const key = `${text}|${r.ad_group_criterion?.keyword?.match_type}`
  if (existingMap.has(key)) continue
  existingMap.set(key, {
    text,
    mt: MT[r.ad_group_criterion?.keyword?.match_type] || '?',
    status: STATUS[r.ad_group_criterion?.status] || r.ad_group_criterion?.status,
    imp: Number(r.metrics?.impressions||0),
  })
}
const existingList = [...existingMap.values()]
console.log(`Confetti/cannon positive keywords currently in Cannons campaign: ${existingList.length}\n`)
for (const k of existingList.sort((a,b)=>b.imp-a.imp)) {
  console.log(`  [${k.mt.padEnd(6)}] [${k.status.padEnd(8)}] imp:${String(k.imp).padStart(4)}  "${k.text}"`)
}

// ─────────────────────────────────────────────
// PART 5: Identify ACTIONABLE gaps — high volume or proven conversion, NOT currently active
// ─────────────────────────────────────────────
console.log(`\n\n━━━ 5. ACTIONABLE GAPS — keywords we should ADD ━━━\n`)
const activeKeywordTexts = new Set()
for (const k of existingList) {
  if (k.status === 'ENABLED') activeKeywordTexts.add(k.text)
}

const gaps = []
for (const v of volSorted) {
  if ((v.monthly||0) === 0) continue
  // Skip if it's a clear negative-intent term
  if (/wedding|dj|stage/i.test(v.kw)) continue
  if (/(silver|gold|red|white|purple|orange|green) confetti cannon$/i.test(v.kw)) continue // wrong-colour intent
  const alreadyActive = [...activeKeywordTexts].some(active =>
    active === v.kw ||
    active.includes(v.kw) ||
    v.kw.includes(active)
  )
  if (alreadyActive) continue
  // Check conversion history from PMAX/Search for this term
  const stMatch = stAgg.get(v.kw)
  const pmaxMatch = pmaxAgg.get(v.kw)
  gaps.push({
    keyword: v.kw,
    volume: v.monthly,
    cpc: v.cpc,
    competition: v.comp,
    historicalConv: (stMatch?.conv||0) + (pmaxMatch?.conv||0),
    historicalRev: (stMatch?.val||0) + (pmaxMatch?.val||0),
    historicalImp: (stMatch?.imp||0) + (pmaxMatch?.imp||0),
  })
}

console.log(`Candidates not currently active: ${gaps.length}\n`)
console.log('Vol/mo | CPC   | HistImp | HistConv | HistRev  | Keyword')
console.log('-'.repeat(95))
for (const g of gaps.sort((a,b)=>(b.volume*Math.log(1+b.historicalImp))-(a.volume*Math.log(1+a.historicalImp)))) {
  console.log(`${g.volume.toString().padStart(5)}  | $${(g.cpc||0).toFixed(2).padStart(4)} | ${String(g.historicalImp).padStart(6)}  | ${g.historicalConv.toFixed(1).padStart(7)}  | $${g.historicalRev.toFixed(0).padStart(6)}  | "${g.keyword}"`)
}

// ─────────────────────────────────────────────
// PART 6: VALIDATE proposed negatives — ensure zero conversion loss risk
// ─────────────────────────────────────────────
console.log(`\n\n━━━ 6. VALIDATE PROPOSED NEGATIVES ━━━\n`)
const PROPOSED_NEGATIVES = [
  'wedding confetti cannon',
  'wedding confetti',
  'dj confetti cannon',
  'stage confetti cannon',
  'rice paper confetti cannon',
]
console.log('Checking each proposed negative against your conversion history...\n')
for (const neg of PROPOSED_NEGATIVES) {
  const stMatch = [...stAgg.values()].filter(x => x.term.includes(neg) || neg.includes(x.term))
  const pmaxMatch = [...pmaxAgg.values()].filter(x => x.lbl.includes(neg) || neg.includes(x.lbl))
  const totalImp = stMatch.reduce((s,x)=>s+x.imp,0) + pmaxMatch.reduce((s,x)=>s+x.imp,0)
  const totalConv = stMatch.reduce((s,x)=>s+x.conv,0) + pmaxMatch.reduce((s,x)=>s+x.conv,0)
  const totalRev = stMatch.reduce((s,x)=>s+x.val,0) + pmaxMatch.reduce((s,x)=>s+x.val,0)
  const verdict = totalConv >= 1 ? '🔴 DO NOT BLOCK (has conversions!)' : totalImp >= 50 ? '🟡 review — high imp but no conv' : '✅ safe to block'
  console.log(`  "${neg}"`)
  console.log(`    24mo imp: ${totalImp} | conv: ${totalConv.toFixed(1)} | rev: $${totalRev.toFixed(0)} → ${verdict}`)
}

mkdirSync('data/snapshots/confetti-keyword-validation', { recursive: true })
writeFileSync('data/snapshots/confetti-keyword-validation/validation.json', JSON.stringify({
  searchTermHistory: ranked,
  pmaxHistory: pmaxRanked,
  candidateVolume: volSorted,
  existingActive: existingList,
  actionableGaps: gaps,
}, null, 2))
console.log(`\nFull data: data/snapshots/confetti-keyword-validation/validation.json`)
process.exit(0)
