/**
 * Match UGC video filenames to correct Shopify products
 * Output: side-by-side table showing current mapping + my suggestion
 *         Josh approves, then I ship corrections
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

// 1. Pull all active products with titles + handles
console.log('Pulling product catalog...')
let allProducts = [], cursor = null, hasNext = true
while (hasNext) {
  const r = await gql(`query($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges { node { handle title status } }
    }
  }`, { cursor })
  if (r.errors) { console.error(JSON.stringify(r.errors)); break }
  allProducts.push(...(r.data?.products?.edges?.map(e => e.node).filter(p => p.status === 'ACTIVE') || []))
  hasNext = r.data?.products?.pageInfo?.hasNextPage
  cursor = r.data?.products?.pageInfo?.endCursor
}
console.log(`  ${allProducts.length} active products`)

// 2. Pull video carousel blocks from index.json
const themeR = await fetch(`https://${SHOP}/admin/api/2026-01/themes/163830661209/assets.json?asset[key]=templates/index.json`, { headers: { 'X-Shopify-Access-Token': TOKEN } }).then(r => r.json())
const tjson = JSON.parse(themeR.asset?.value || '{}')
const sec = tjson.sections?.video_carousel_6HwtRR
const blocks = sec?.blocks || {}
const order = sec?.block_order || []

// 3. Build keyword → product mapping table
const KEYWORD_MAP = [
  { kw: ['tnt'],                             prefer: 'tnt-gender-reveal-australia' },
  { kw: ['smoke bomb', 'smoke.bomb', 'smoke bombs'], prefer: 'gender-reveal-smoke-bombs' },
  { kw: ['smoke colour', 'smoke color', 'coloured smoke'], prefer: 'gender-reveal-smoke-bombs' },
  { kw: ['burn away', 'burn-away', 'cake topper'], prefer: 'gender-reveal-burn-away-topper' },
  { kw: ['mini blaster', 'mini-blaster'],    prefer: 'gender-reveal-extinguisher-australia' },
  { kw: ['mega blaster', 'mega-blaster'],    prefer: 'mega-gender-reveal-powder-blaster' },
  { kw: ['powder blaster', 'powder-blaster'], prefer: 'mega-gender-reveal-powder-blaster' },
  { kw: ['extinguisher'],                    prefer: 'gender-reveal-extinguisher-australia' },
  { kw: ['confetti cannon', 'confetti-cannon'], prefer: 'gender-reveal-confetti-cannons' },
  { kw: ['powder cannon'],                   prefer: 'gender-reveal-powder-cannon-australia' },
  { kw: ['cannon'],                          prefer: 'gender-reveal-cannons' },
  { kw: ['soccer'],                          prefer: 'gender-reveal-exploding-soccer-ball' },
  { kw: ['rugby', 'nrl'],                    prefer: 'gender-reveal-rugby-ball' },
  { kw: ['football', 'afl', 'nfl'],          prefer: 'gender-reveal-football' },
  { kw: ['golf'],                            prefer: 'gender-reveal-golf-balls' },
  { kw: ['cricket'],                         prefer: 'gender-reveal-cricket-ball' },
  { kw: ['basketball'],                      prefer: 'gender-reveal-powder-basketball' },
  { kw: ['baseball'],                        prefer: 'gender-reveal-powder-baseball' },
]

function suggestFromFilename(filename) {
  const lower = filename.toLowerCase()
  for (const m of KEYWORD_MAP) {
    if (m.kw.some(k => lower.includes(k))) return { handle: m.prefer, confidence: 'HIGH (filename match)' }
  }
  // No filename hint
  return { handle: null, confidence: 'UNKNOWN (needs Josh to specify)' }
}

const handleToTitle = new Map(allProducts.map(p => [p.handle, p.title]))

console.log(`\n━━━ 19 VIDEO BLOCKS — CURRENT vs SUGGESTED ━━━\n`)
console.log('#  | Filename | Current product → title | Suggested → title | Action')
console.log('-'.repeat(160))

const fixList = []
let i = 0
for (const bid of order) {
  const b = blocks[bid]
  if (!b) continue
  i++
  const filename = (b.settings?.html5_video || '').split('/').pop() || '(none)'
  const currentHandle = b.settings?.product || ''
  const currentTitle = handleToTitle.get(currentHandle) || '(handle not found in active products)'
  const suggestion = suggestFromFilename(filename)
  const suggestTitle = suggestion.handle ? (handleToTitle.get(suggestion.handle) || 'NOT FOUND') : '???'

  // Decide action
  let action
  if (!suggestion.handle) action = '🟡 NEEDS YOUR INPUT'
  else if (suggestion.handle === currentHandle) action = '✓ ALREADY CORRECT'
  else action = `🔴 CHANGE → ${suggestion.handle}`

  console.log(`${String(i).padStart(2)} | ${filename.slice(0,42).padEnd(42)} | ${currentHandle.slice(0,40).padEnd(40)} → ${currentTitle.slice(0,28)}`)
  console.log(`   | ${' '.repeat(42)} | SUGGEST: ${suggestion.handle ? suggestion.handle.padEnd(40) : '?'.repeat(40)} → ${suggestTitle.slice(0,28)}`)
  console.log(`   | ${action}\n`)

  fixList.push({
    rank: i, blockId: bid, filename,
    current: { handle: currentHandle, title: currentTitle },
    suggested: { handle: suggestion.handle, title: suggestTitle, confidence: suggestion.confidence },
    needsAction: action,
  })
}

// Summary
const needsChange = fixList.filter(f => f.needsAction.startsWith('🔴'))
const needsInput = fixList.filter(f => f.needsAction.startsWith('🟡'))
const correct    = fixList.filter(f => f.needsAction.startsWith('✓'))
console.log(`━━━ SUMMARY ━━━`)
console.log(`  Already correct: ${correct.length}`)
console.log(`  Can auto-fix:    ${needsChange.length}`)
console.log(`  Needs Josh:      ${needsInput.length}`)

mkdirSync('data/snapshots/ugc-video-match', { recursive: true })
writeFileSync('data/snapshots/ugc-video-match/proposal.json', JSON.stringify({
  totalBlocks: i,
  fixList,
  summary: { correct: correct.length, autoFix: needsChange.length, needsInput: needsInput.length },
}, null, 2))
console.log(`\nFull data: data/snapshots/ugc-video-match/proposal.json`)
process.exit(0)
