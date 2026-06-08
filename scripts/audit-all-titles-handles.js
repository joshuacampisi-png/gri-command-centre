/**
 * Full SEO title + URL handle audit across every product
 * Scores each against 2026 ecommerce SEO best practice
 *
 * Title rules (50-60 char sweet spot):
 *  - Primary keyword "gender reveal" in first 30 chars
 *  - No price ($X)
 *  - No emoji
 *  - No ALL CAPS section
 *  - Has at least one trust signal (australia, same day, 4.85, 1360, free shipping, mum, eco)
 *  - Brand stripped from end (we ARE the brand — saves chars)
 *  - Length 30-70 chars
 *  - Unique across catalog
 *
 * Handle rules (under 50 chars ideal):
 *  - Hyphens only, no underscores
 *  - Lowercase only
 *  - No stop words (the, and, of, for, with, a, to)
 *  - No duplicate keyword (gender-reveal-gender-reveal-x)
 *  - No category prefix redundancy
 *  - Australian English spelling (colour not color)
 *  - Primary keyword present
 *  - No emojis or special chars
 */
import 'dotenv/config'
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

const Q = `query($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id handle title productType vendor status
      seo { title description }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
      onlineStoreUrl
    }}
  }
}`

console.log(`\n=== FULL SEO TITLE + URL HANDLE AUDIT ===\n`)
console.log('Fetching all products...')

let all = [], cursor = null, hasNext = true
while (hasNext) {
  const r = await gql(Q, { cursor })
  if (r.errors) { console.error('GQL err:', JSON.stringify(r.errors)); break }
  all.push(...(r.data?.products?.edges?.map(e => e.node) || []))
  hasNext = r.data?.products?.pageInfo?.hasNextPage
  cursor = r.data?.products?.pageInfo?.endCursor
  process.stdout.write(`  fetched ${all.length}\r`)
}
console.log(`\nTotal: ${all.length}\n`)

// Filter to ACTIVE products only
const active = all.filter(p => p.status === 'ACTIVE')
console.log(`Active products: ${active.length}\n`)

// Rules engine
const STOP_WORDS = new Set(['the','and','of','for','with','a','to','in','on','by','an','from'])
const TRUST_TOKENS = ['australia','aussie','same day','same-day','4.85','1360','1,360','free shipping','mum','eco','near me','next day','gold coast','australian']
const REQUIRED_KW = 'gender reveal'

function auditTitle(seoTitle, productTitle) {
  const title = seoTitle || productTitle || ''
  const lower = title.toLowerCase()
  const issues = []
  if (!title) issues.push('MISSING')
  if (/\$\d/.test(title)) issues.push('PRICE_IN_TITLE')
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(title)) issues.push('EMOJI')
  if (title.length > 70) issues.push(`TOO_LONG(${title.length}c)`)
  if (title.length > 0 && title.length < 30) issues.push(`TOO_SHORT(${title.length}c)`)
  const first30 = lower.slice(0, 30)
  if (!first30.includes(REQUIRED_KW)) issues.push('KW_NOT_IN_FIRST_30c')
  if (!TRUST_TOKENS.some(t => lower.includes(t))) issues.push('NO_TRUST_SIGNAL')
  // ALL CAPS detection (excluding small words)
  const capsRatio = title.replace(/[^A-Za-z]/g,'').length > 0
    ? (title.replace(/[^A-Z]/g,'').length / title.replace(/[^A-Za-z]/g,'').length)
    : 0
  if (capsRatio > 0.5) issues.push('ALL_CAPS')
  if (lower.includes('color ')) issues.push('US_SPELLING_color')
  if (lower.includes('|||') || /\|\s*\|/.test(title)) issues.push('EMPTY_PIPE_SECTION')
  // Repeated tokens (e.g., "Gender Reveal Gender Reveal")
  const tokens = lower.replace(/[^a-z\s]/g,' ').split(/\s+/).filter(Boolean)
  const dup = tokens.filter((t,i) => tokens.indexOf(t) !== i && t.length > 3 && !STOP_WORDS.has(t))
  if (dup.length) issues.push(`DUP_WORDS(${[...new Set(dup)].join(',')})`)
  return issues
}

function auditHandle(handle, productTitle) {
  const issues = []
  if (!handle) { issues.push('MISSING'); return issues }
  if (handle.length > 75) issues.push(`TOO_LONG(${handle.length}c)`)
  if (handle.includes('_')) issues.push('UNDERSCORE')
  if (handle !== handle.toLowerCase()) issues.push('UPPERCASE')
  const parts = handle.split('-')
  const stops = parts.filter(p => STOP_WORDS.has(p))
  if (stops.length) issues.push(`STOPWORDS(${stops.join(',')})`)
  // Repeated tokens
  const dupParts = parts.filter((p,i) => parts.indexOf(p) !== i && p.length > 2)
  if (dupParts.length) issues.push(`DUP_TOKENS(${[...new Set(dupParts)].join(',')})`)
  // Special chars or numbers indicating versioning
  if (/v\d+|copy|test|draft|nbsp/i.test(handle)) issues.push('SUSPECT_TOKEN')
  if (!handle.includes('gender-reveal') && !handle.includes('reveal')) issues.push('NO_PRIMARY_KW')
  if (parts.some(p => p.length === 1)) issues.push('SINGLE_CHAR_PART')
  if (/color/i.test(handle)) issues.push('US_SPELLING_color')
  return issues
}

// Run audit
const audit = []
for (const p of active) {
  const seoTitle = p.titleTag?.value || p.seo?.title || ''
  const titleIssues = auditTitle(seoTitle, p.title)
  const handleIssues = auditHandle(p.handle, p.title)
  audit.push({
    handle: p.handle,
    productTitle: p.title,
    seoTitle,
    titleLength: seoTitle.length,
    handleLength: p.handle?.length || 0,
    titleIssues,
    handleIssues,
    score: 100 - (titleIssues.length * 8) - (handleIssues.length * 8),
  })
}

// Sort by score (worst first)
audit.sort((a,b) => a.score - b.score)

// Aggregate stats
const titleIssueCounts = {}
const handleIssueCounts = {}
for (const a of audit) {
  for (const i of a.titleIssues) {
    const key = i.replace(/\(.*\)/,'')
    titleIssueCounts[key] = (titleIssueCounts[key]||0) + 1
  }
  for (const i of a.handleIssues) {
    const key = i.replace(/\(.*\)/,'')
    handleIssueCounts[key] = (handleIssueCounts[key]||0) + 1
  }
}

console.log(`━━━ TITLE ISSUE COUNTS ━━━`)
for (const [issue, n] of Object.entries(titleIssueCounts).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${String(n).padStart(3)}×  ${issue}`)
}
console.log(`\n━━━ HANDLE ISSUE COUNTS ━━━`)
for (const [issue, n] of Object.entries(handleIssueCounts).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${String(n).padStart(3)}×  ${issue}`)
}

// Score distribution
const buckets = { 'A (90-100)':0, 'B (75-89)':0, 'C (50-74)':0, 'D (25-49)':0, 'F (<25)':0 }
for (const a of audit) {
  if (a.score >= 90) buckets['A (90-100)']++
  else if (a.score >= 75) buckets['B (75-89)']++
  else if (a.score >= 50) buckets['C (50-74)']++
  else if (a.score >= 25) buckets['D (25-49)']++
  else buckets['F (<25)']++
}
console.log(`\n━━━ SCORE DISTRIBUTION ━━━`)
for (const [b, n] of Object.entries(buckets)) console.log(`  ${b}: ${n} products`)

// Top 30 worst (most impact)
console.log(`\n\n━━━ TOP 30 WORST OFFENDERS — fix-priority list ━━━\n`)
console.log('Score | Handle | Title issues | Handle issues')
console.log('-'.repeat(140))
for (const a of audit.slice(0,30)) {
  console.log(`${String(a.score).padStart(4)}  | /${a.handle.slice(0,55).padEnd(55)} | ${a.titleIssues.join(',').slice(0,40).padEnd(40)} | ${a.handleIssues.join(',').slice(0,30)}`)
  console.log(`       seoTitle (${a.titleLength}c): "${a.seoTitle.slice(0,90)}"`)
}

// Duplicate SEO titles
const titleMap = new Map()
for (const a of audit) {
  if (!a.seoTitle) continue
  if (!titleMap.has(a.seoTitle)) titleMap.set(a.seoTitle, [])
  titleMap.get(a.seoTitle).push(a.handle)
}
const dupTitles = [...titleMap.entries()].filter(([_,h]) => h.length > 1)
console.log(`\n━━━ DUPLICATE SEO TITLES ━━━`)
if (!dupTitles.length) console.log('  ✓ All unique')
for (const [t, handles] of dupTitles.slice(0,15)) {
  console.log(`  ${handles.length}× "${t.slice(0,80)}"`)
  for (const h of handles.slice(0,5)) console.log(`     /${h}`)
}

// Save full audit
import { writeFileSync, mkdirSync } from 'fs'
mkdirSync('data/snapshots/title-handle-audit', { recursive: true })
writeFileSync('data/snapshots/title-handle-audit/audit.json', JSON.stringify({
  totalActive: active.length,
  titleIssueCounts,
  handleIssueCounts,
  scoreBuckets: buckets,
  audit,
  duplicateTitles: dupTitles.map(([t,h]) => ({ title: t, handles: h })),
}, null, 2))
console.log(`\nFull audit: data/snapshots/title-handle-audit/audit.json`)

process.exit(0)
