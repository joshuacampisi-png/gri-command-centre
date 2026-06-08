/**
 * Remove "gender reveal ideas" variants from Brand Negatives + TNT Hire Negatives
 * shared lists. These were blocking the #1 head query (5,400/mo AU) from PMAX bidding.
 *
 * Rollback: --rollback re-adds the keywords
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/remove-brand-negatives'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

// Target keywords to remove (text + match_type)
const TARGETS = [
  { text: 'gender reveal ideas', mt: 2 },          // EXACT
  { text: 'gender reveal ideas', mt: 3 },          // PHRASE
  { text: 'gender reveal ideas reviews', mt: 2 },  // EXACT
  { text: 'genderrevealideas', mt: 2 },            // EXACT
  { text: 'sports gender reveal ideas', mt: 3 },   // PHRASE
]
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'REMOVE'} — Brand negatives blocking head queries ===\n`)

// Pull current state to find resource names
const rows = await customer.query(`SELECT shared_set.id, shared_set.name, shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion`)
const toRemove = []
for (const r of rows) {
  const text = r.shared_criterion?.keyword?.text || ''
  const mt = r.shared_criterion?.keyword?.match_type
  const setId = r.shared_set?.id
  const critId = r.shared_criterion?.criterion_id
  if (TARGETS.some(t => t.text.toLowerCase() === text.toLowerCase() && t.mt === mt)) {
    toRemove.push({ setId, critId, text, mt, setName: r.shared_set?.name })
  }
}

console.log(`Found ${toRemove.length} matching negatives:`)
for (const x of toRemove) {
  console.log(`  • [${x.setName}] "${x.text}" ${MT[x.mt]}`)
}

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const prev = JSON.parse(readFileSync(LOG,'utf8'))
  console.log(`\nRe-adding ${prev.removed?.length||0} previously-removed negatives...`)
  for (const r of prev.removed||[]) {
    try {
      const res = await customer.sharedCriteria.create([{
        shared_set: `customers/${custId}/sharedSets/${r.setId}`,
        keyword: { text: r.text, match_type: MT[r.mt] },
      }])
      console.log(`  ✓ Re-added: "${r.text}" ${MT[r.mt]} to ${r.setName}`)
    } catch(e) {
      console.log(`  ✗ Failed "${r.text}": ${e?.errors?.[0]?.message}`)
    }
    await new Promise(r=>setTimeout(r,400))
  }
  console.log('Rollback complete')
  process.exit(0)
}

if (!toRemove.length) {
  console.log('\nNothing to remove — already clean.')
  process.exit(0)
}

// Snapshot before removing
const log = { shippedAt: new Date().toISOString(), removed: [] }

// Build resource names to remove
const resourceNames = toRemove.map(x => `customers/${custId}/sharedCriteria/${x.setId}~${x.critId}`)

try {
  const res = await customer.sharedCriteria.remove(resourceNames)
  console.log(`\n✓ Removed ${res?.results?.length||resourceNames.length} negatives`)
  for (const x of toRemove) log.removed.push(x)
} catch (e) {
  console.error(`\n✗ Bulk remove failed: ${e?.errors?.[0]?.message}`)
  // Try one-by-one
  console.log('Retrying one-by-one...')
  for (let i = 0; i < toRemove.length; i++) {
    try {
      const rn = resourceNames[i]
      await customer.sharedCriteria.remove([rn])
      console.log(`  ✓ Removed "${toRemove[i].text}" ${MT[toRemove[i].mt]}`)
      log.removed.push(toRemove[i])
    } catch (e2) {
      console.log(`  ✗ "${toRemove[i].text}": ${e2?.errors?.[0]?.message}`)
    }
    await new Promise(r=>setTimeout(r,400))
  }
}

writeFileSync(LOG, JSON.stringify(log,null,2))
console.log(`\n✓ Done — ${log.removed.length} negatives removed`)
console.log(`Log: ${LOG}`)
console.log(`Rollback: node scripts/remove-brand-negatives.js --rollback`)
console.log(`\nExpected effect: PMAX should start bidding on "gender reveal ideas" + variants within 24-48hrs`)
process.exit(0)
