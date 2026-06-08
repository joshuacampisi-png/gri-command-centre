/**
 * Remove 8 campaign-level negative keywords blocking high-intent queries
 * on Brand Defence + Search Cannons (both Manual CPC, zero relearn risk).
 *
 * Rollback: --rollback re-adds the keywords
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/remove-campaign-negatives-batch8'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

// Match-type enum: 2=EXACT, 3=PHRASE, 4=BROAD
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}

// 8 targets: text + match_type + campaign name (must match live data exactly)
const TARGETS = [
  { text: 'ideas',                       mt: 3, camp: 'GRI | Search | Brand Defence' },
  { text: 'ideas',                       mt: 3, camp: 'GRI | Search | Cannons' },
  { text: 'gender reveal blasters',      mt: 2, camp: 'GRI | Search | Cannons' },
  { text: 'gender reveal spray',         mt: 2, camp: 'GRI | Search | Cannons' },
  { text: 'baby gender reveal',          mt: 2, camp: 'GRI | Search | Cannons' },
  { text: 'smoke cannons',               mt: 2, camp: 'GRI | Search | Cannons' },
  { text: 'gender smoke cannon',         mt: 2, camp: 'GRI | Search | Cannons' },
  { text: 'smoke cannons gender reveal', mt: 2, camp: 'GRI | Search | Cannons' },
]

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'REMOVE'} — 8 campaign-level negatives ===\n`)

// Pull current negatives on enabled campaigns
const rows = await customer.query(`SELECT campaign.id, campaign.name, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.status='ENABLED' AND campaign_criterion.type='KEYWORD' AND campaign_criterion.negative=TRUE`)

const toRemove = []
for (const t of TARGETS) {
  const found = rows.find(r =>
    r.campaign?.name === t.camp &&
    r.campaign_criterion?.keyword?.text?.toLowerCase() === t.text.toLowerCase() &&
    r.campaign_criterion?.keyword?.match_type === t.mt
  )
  if (found) {
    toRemove.push({
      campId: found.campaign.id,
      campName: found.campaign.name,
      critId: found.campaign_criterion.criterion_id,
      text: t.text,
      mt: t.mt,
    })
  } else {
    console.log(`  ⚠ NOT FOUND: [${t.camp}] "${t.text}" ${MT[t.mt]}`)
  }
}

console.log(`\nFound ${toRemove.length}/${TARGETS.length} targets:`)
for (const x of toRemove) console.log(`  • [${x.campName}] "${x.text}" ${MT[x.mt]}`)

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const prev = JSON.parse(readFileSync(LOG,'utf8'))
  console.log(`\nRe-adding ${prev.removed?.length||0} negatives...`)
  for (const r of prev.removed||[]) {
    try {
      await customer.campaignCriteria.create([{
        campaign: `customers/${custId}/campaigns/${r.campId}`,
        negative: true,
        keyword: { text: r.text, match_type: MT[r.mt] },
      }])
      console.log(`  ✓ Re-added "${r.text}" ${MT[r.mt]} to ${r.campName}`)
    } catch(e) {
      console.log(`  ✗ Failed "${r.text}": ${e?.errors?.[0]?.message}`)
    }
    await new Promise(r=>setTimeout(r,400))
  }
  console.log('Rollback complete')
  process.exit(0)
}

if (!toRemove.length) {
  console.log('\nNothing to remove')
  process.exit(0)
}

const log = { shippedAt: new Date().toISOString(), removed: [] }
const resourceNames = toRemove.map(x => `customers/${custId}/campaignCriteria/${x.campId}~${x.critId}`)

try {
  const res = await customer.campaignCriteria.remove(resourceNames)
  console.log(`\n✓ Bulk removed ${res?.results?.length||resourceNames.length} negatives`)
  for (const x of toRemove) log.removed.push(x)
} catch (e) {
  console.error(`\n✗ Bulk failed: ${e?.errors?.[0]?.message}`)
  console.log('Retrying one-by-one...')
  for (let i = 0; i < toRemove.length; i++) {
    try {
      await customer.campaignCriteria.remove([resourceNames[i]])
      console.log(`  ✓ Removed "${toRemove[i].text}" ${MT[toRemove[i].mt]} from ${toRemove[i].campName}`)
      log.removed.push(toRemove[i])
    } catch (e2) {
      console.log(`  ✗ "${toRemove[i].text}": ${e2?.errors?.[0]?.message}`)
    }
    await new Promise(r=>setTimeout(r,400))
  }
}

writeFileSync(LOG, JSON.stringify(log,null,2))
console.log(`\n✓ DONE — ${log.removed.length}/${TARGETS.length} negatives removed`)
console.log(`Log: ${LOG}`)
console.log(`Rollback: node scripts/remove-campaign-negatives-batch8.js --rollback`)
console.log(`\nExpected effect:`)
console.log(`  • Brand Defence now eligible for "gender reveal ideas" (head term, 5,400/mo AU)`)
console.log(`  • Search Cannons now eligible for blaster, spray, smoke cannon queries`)
console.log(`  • Watch: Friday — Brand Defence impressions + Cannons query-list breadth`)
process.exit(0)
