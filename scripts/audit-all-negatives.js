import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}

console.log(`\n=== FULL NEGATIVE KEYWORD AUDIT — ${new Date().toISOString().slice(0,16)} ===\n`)

// 1. Shared negative lists
console.log('--- SHARED NEGATIVE LISTS ---')
const sharedSets = await c.query(`SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.member_count, shared_set.status FROM shared_set`)
const setNames = {}
for (const r of sharedSets) {
  const ss = r.shared_set
  setNames[ss?.id] = ss?.name
  console.log(`  ${ss?.name?.padEnd(40)} | type:${ss?.type} | members:${ss?.member_count}`)
}

// 2. All shared criteria — flag any that look like real product/category queries
console.log(`\n--- SHARED NEGATIVE CRITERIA (all keywords across all lists) ---`)
const shared = await c.query(`SELECT shared_set.id, shared_set.name, shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion`)
console.log(`Total shared negatives: ${shared.length}\n`)

// Group by set
const bySet = new Map()
for (const r of shared) {
  const setName = r.shared_set?.name || 'unknown'
  if (!bySet.has(setName)) bySet.set(setName, [])
  bySet.get(setName).push({
    text: r.shared_criterion?.keyword?.text,
    mt: r.shared_criterion?.keyword?.match_type,
    critId: r.shared_criterion?.criterion_id,
  })
}

// Print all groups
for (const [name, items] of bySet) {
  console.log(`\n[${name}] (${items.length} negatives)`)
  for (const x of items.sort((a,b)=>(a.text||'').localeCompare(b.text||''))) {
    console.log(`  • [${MT[x.mt]||x.mt}] "${x.text}"`)
  }
}

// 3. Flag suspicious ones — anything that looks like a buyable product/category query
console.log(`\n\n--- 🚨 POTENTIALLY DAMAGING NEGATIVES (review these) ---`)
const DANGER_PATTERNS = [
  /\bgender reveal (smoke|smoke bomb|smoke bombs|cannon|cannons|extinguisher|powder|bundle|burnout|football|ball|kit|balloon|ideas|party|gift|reveal|aussie|australia|near me)/i,
  /\b(buy|shop|purchase|order|cheap|best)\b.*\b(gender reveal|reveal)\b/i,
  /^gender reveal$/i,
  /^reveal$/i,
  /\b(smoke bomb|smoke bombs|cannon|cannons|extinguisher|powder cannon|burnout powder)\b/i,
]
const RED_FLAGS = ['ideas','australia','buy','shop','order','cheap','best','near me','genderrevealideas']

const suspect = []
for (const r of shared) {
  const text = r.shared_criterion?.keyword?.text || ''
  if (DANGER_PATTERNS.some(p => p.test(text))) {
    suspect.push({ list: r.shared_set?.name, text, mt: r.shared_criterion?.keyword?.match_type })
  }
}
if (suspect.length === 0) console.log('  ✓ No suspicious negatives found in shared lists (good)')
for (const s of suspect) {
  console.log(`  ⚠ [${s.list}] "${s.text}" ${MT[s.mt]||s.mt}`)
}

// 4. Campaign-level negative criteria
console.log(`\n--- CAMPAIGN-LEVEL NEGATIVES (per enabled campaign) ---`)
try {
  const cn = await c.query(`SELECT campaign.id, campaign.name, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.negative FROM campaign_criterion WHERE campaign.status='ENABLED' AND campaign_criterion.type='KEYWORD' AND campaign_criterion.negative=TRUE`)
  if (!cn.length) console.log('  No campaign-level negative keywords')
  const byCamp = new Map()
  for (const r of cn) {
    const k = r.campaign?.name
    if (!byCamp.has(k)) byCamp.set(k, [])
    byCamp.get(k).push({text:r.campaign_criterion?.keyword?.text, mt:r.campaign_criterion?.keyword?.match_type})
  }
  for (const [name, items] of byCamp) {
    console.log(`\n  [${name}]`)
    for (const x of items) console.log(`    • [${MT[x.mt]||x.mt}] "${x.text}"`)
  }
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,100)}`) }

console.log(`\n--- SUMMARY ---`)
console.log(`Total shared negatives across all lists: ${shared.length}`)
console.log(`Suspicious (product/category queries blocked): ${suspect.length}`)
process.exit(0)
