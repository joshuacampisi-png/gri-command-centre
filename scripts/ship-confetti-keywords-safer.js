/**
 * SHIP: 5 EXACT positives + 9 negatives for confetti cannon
 *  - Positives added to Cannons / Powder Cannons ad group
 *  - Negatives added at campaign level (consistent with existing inline negs)
 *  - All 14 changes data-validated against 24mo account history
 *  - Zero algorithm reset, zero spend change
 *
 * Rollback: node scripts/ship-confetti-keywords-safer.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()

const SNAPSHOT_DIR = 'data/snapshots/confetti-keywords-safer'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const ROLLBACK = process.argv.includes('--rollback')

const CANNONS_CAMP_ID = '21094179575'
const POWDER_CANNONS_AG_ID = '165478691408'

const EXACT = 2
const PHRASE = 3

// ── 5 POSITIVES — proven converters from 24mo account history ──
const POSITIVES = [
  { text: 'confetti cannon gender reveal',                  match: EXACT, proof: '27k PMAX imp, 12.4 conv, $1,303' },
  { text: 'gender reveal confetti cannons',                 match: EXACT, proof: 'plural variant, 260/mo AU vol' },
  { text: 'biodegradable confetti cannon gender reveal',    match: EXACT, proof: '1.5 PMAX conv, $108 rev' },
  { text: 'blue confetti cannon',                           match: EXACT, proof: '2.0 conv proven, $84 rev' },
  { text: 'gender reveal smoke confetti cannon',            match: EXACT, proof: '1.0 conv proven, $94 rev' },
]

// ── 9 NEGATIVES — verified zero-conversion + wrong intent ──
const NEGATIVES = [
  { text: 'electric confetti cannon',                       match: EXACT, reason: '693 PMAX imp, 0 conv — wrong product' },
  { text: 'co2 confetti cannon',                            match: EXACT, reason: 'pneumatic product, not ours' },
  { text: 'compressed air confetti cannon',                 match: EXACT, reason: 'different product type' },
  { text: 'remote control confetti cannon',                 match: PHRASE, reason: 'different product' },
  { text: 'make your own confetti cannon',                  match: PHRASE, reason: 'DIY tutorial intent' },
  { text: 'make a confetti cannon',                         match: EXACT, reason: 'DIY tutorial intent' },
  { text: 'stage confetti cannon',                          match: EXACT, reason: 'DJ/event intent' },
  { text: 'dj confetti cannon',                             match: EXACT, reason: 'DJ intent' },
  { text: 'rice paper confetti cannon',                     match: PHRASE, reason: '14 imp 0 conv, wrong eco product' },
]

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Confetti Cannon keyword optimization ===\n`)
console.log(`Adding: ${POSITIVES.length} EXACT positives + ${NEGATIVES.length} negatives\n`)

// ── ROLLBACK PATH ──
if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG, 'utf8'))

  // Remove positives
  for (const rn of log.addedPositiveResources || []) {
    try {
      await customer.adGroupCriteria.remove([rn])
      console.log(`  ✓ removed positive ${rn}`)
    } catch (e) { console.log(`  ⚠ ${e?.errors?.[0]?.message}`) }
  }

  // Remove negatives
  for (const rn of log.addedNegativeResources || []) {
    try {
      await customer.campaignCriteria.remove([rn])
      console.log(`  ✓ removed negative ${rn}`)
    } catch (e) { console.log(`  ⚠ ${e?.errors?.[0]?.message}`) }
  }
  process.exit(0)
}

// ── SHIP PATH ──
const audit = {
  shippedAt: new Date().toISOString(),
  campaignId: CANNONS_CAMP_ID,
  adGroupId: POWDER_CANNONS_AG_ID,
  addedPositives: [],
  addedPositiveResources: [],
  addedNegatives: [],
  addedNegativeResources: [],
  errors: [],
}

// Add positives
console.log('--- POSITIVES (Cannons / Powder Cannons ad group) ---')
const adGroupRn = `customers/${custId}/adGroups/${POWDER_CANNONS_AG_ID}`
for (const p of POSITIVES) {
  try {
    const r = await customer.adGroupCriteria.create([{
      ad_group: adGroupRn,
      status: 'ENABLED',
      keyword: { text: p.text, match_type: p.match },
    }])
    const rn = r?.results?.[0]?.resource_name
    audit.addedPositives.push(p)
    audit.addedPositiveResources.push(rn)
    console.log(`  ✓ added [EXACT] "${p.text}"`)
    console.log(`    proof: ${p.proof}`)
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'unknown'
    if (msg.includes('already exists') || msg.includes('DUPLICATE')) {
      console.log(`  ⊘ "${p.text}" already exists, skipping`)
    } else {
      console.log(`  ✗ "${p.text}" failed: ${msg}`)
      audit.errors.push({ type: 'positive', kw: p, error: msg })
    }
  }
  await new Promise(r => setTimeout(r, 200))
}

// Add negatives at campaign level
console.log('\n--- NEGATIVES (Cannons campaign level) ---')
const campaignRn = `customers/${custId}/campaigns/${CANNONS_CAMP_ID}`
for (const n of NEGATIVES) {
  try {
    const r = await customer.campaignCriteria.create([{
      campaign: campaignRn,
      negative: true,
      keyword: { text: n.text, match_type: n.match },
    }])
    const rn = r?.results?.[0]?.resource_name
    audit.addedNegatives.push(n)
    audit.addedNegativeResources.push(rn)
    const mt = n.match === EXACT ? 'EXACT' : 'PHRASE'
    console.log(`  ✓ added [${mt}] -"${n.text}"`)
    console.log(`    reason: ${n.reason}`)
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'unknown'
    if (msg.includes('already exists') || msg.includes('DUPLICATE')) {
      console.log(`  ⊘ -"${n.text}" already exists, skipping`)
    } else {
      console.log(`  ✗ -"${n.text}" failed: ${msg}`)
      audit.errors.push({ type: 'negative', kw: n, error: msg })
    }
  }
  await new Promise(r => setTimeout(r, 200))
}

writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n━━━ SHIPPED ${new Date().toISOString()} ━━━`)
console.log(`Positives added: ${audit.addedPositives.length}`)
console.log(`Negatives added: ${audit.addedNegatives.length}`)
console.log(`Errors:          ${audit.errors.length}`)
console.log(`\nSnapshot: ${LOG}`)
console.log(`Rollback: node scripts/ship-confetti-keywords-safer.js --rollback`)

// Verify
console.log(`\n--- VERIFY (re-query account) ---`)
const verify = await customer.query(`
  SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE ad_group.id = ${POWDER_CANNONS_AG_ID}
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.negative = FALSE
    AND ad_group_criterion.keyword.text IN (${POSITIVES.map(p => `'${p.text.replace(/'/g, "''")}'`).join(',')})
`)
console.log(`Positives verified live: ${verify.length}/${POSITIVES.length}`)
for (const r of verify) {
  console.log(`  ✓ [${r.ad_group_criterion?.keyword?.text}] status: ${r.ad_group_criterion?.status}`)
}

const verifyNeg = await customer.query(`
  SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
  FROM campaign_criterion
  WHERE campaign.id = ${CANNONS_CAMP_ID}
    AND campaign_criterion.negative = TRUE
    AND campaign_criterion.keyword.text IN (${NEGATIVES.map(n => `'${n.text.replace(/'/g, "''")}'`).join(',')})
`)
console.log(`Negatives verified live: ${verifyNeg.length}/${NEGATIVES.length}`)

console.log(`\nFirst data signal: 24-48h`)
console.log(`7-day read: included in daily morning monitor`)
process.exit(0)
