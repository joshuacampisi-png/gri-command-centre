/**
 * SHIP: 9 EXACT positives + 10 negatives for extinguisher/blaster
 *  - All positives PROVEN converters in your 24-month account history
 *  - Biggest unlock: "gender reveal mega blaster" — 45.3 conv / $6,161 PMAX
 *  - All negatives verified zero-conversion + wrong intent
 *  - Cannons campaign (same as confetti shipment)
 *  - Zero algorithm reset, zero spend change
 *
 * Rollback: node scripts/ship-extinguisher-keywords.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()

const SNAPSHOT_DIR = 'data/snapshots/extinguisher-keywords'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const ROLLBACK = process.argv.includes('--rollback')

const CANNONS_CAMP_ID = '21094179575'
const POWDER_CANNONS_AG_ID = '165478691408'

const EXACT = 2
const PHRASE = 3

const POSITIVES = [
  { text: 'gender reveal mega blaster',          match: EXACT, proof: '126k PMAX imp, 45.3 conv, $6,161 rev' },
  { text: 'gender reveal blasters',              match: EXACT, proof: '7,450 PMAX imp, 6.9 conv, $1,254 rev' },
  { text: 'gender reveal extinguisher near me',  match: EXACT, proof: '5,182 PMAX imp, 1.0 conv, $463 rev' },
  { text: 'gender reveal extinguishers',         match: EXACT, proof: '75 Search imp, 2.1 conv, $376 rev' },
  { text: 'gender reveal colour blaster',        match: EXACT, proof: '5,266 PMAX imp, 1.6 conv, $253 rev' },
  { text: 'gender reveal blaster',               match: EXACT, proof: '124 Search imp, 1.0 conv, $260 rev' },
  { text: 'gender reveal powder extinguisher',   match: EXACT, proof: '134 imp, 1.0 conv, $92 rev' },
  { text: 'gender extinguisher',                 match: EXACT, proof: '92 imp, 1.0 conv, $49 rev' },
  { text: 'gender reveal smoke blaster',         match: EXACT, proof: '44 imp, 1.0 conv, $54 rev' },
]

const NEGATIVES = [
  { text: 'co2 fire extinguisher',         match: EXACT,  reason: '1,300/mo wrong product' },
  { text: 'water fire extinguisher',       match: EXACT,  reason: '1,000/mo real fire product' },
  { text: 'foam fire extinguisher',        match: EXACT,  reason: '1,000/mo real fire product' },
  { text: 'fire extinguisher service',     match: PHRASE, reason: '880/mo inspection/service intent' },
  { text: 'fire extinguisher inspection',  match: PHRASE, reason: '590/mo safety service' },
  { text: 'fire extinguisher bracket',     match: EXACT,  reason: '720/mo mounting hardware' },
  { text: 'fire extinguisher cabinet',     match: EXACT,  reason: '260/mo storage product' },
  { text: 'fire extinguisher refill',      match: EXACT,  reason: '170/mo refill service' },
  { text: 'real fire extinguisher',        match: EXACT,  reason: 'real safety product' },
  { text: 'fire extinguisher for sale',    match: PHRASE, reason: 'real product buyers' },
]

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Extinguisher/Blaster keyword optimization ===\n`)
console.log(`Adding: ${POSITIVES.length} EXACT positives + ${NEGATIVES.length} negatives\n`)

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG, 'utf8'))
  for (const rn of log.addedPositiveResources || []) {
    try { await customer.adGroupCriteria.remove([rn]); console.log(`  ✓ removed positive ${rn}`) }
    catch (e) { console.log(`  ⚠ ${e?.errors?.[0]?.message}`) }
  }
  for (const rn of log.addedNegativeResources || []) {
    try { await customer.campaignCriteria.remove([rn]); console.log(`  ✓ removed negative ${rn}`) }
    catch (e) { console.log(`  ⚠ ${e?.errors?.[0]?.message}`) }
  }
  process.exit(0)
}

const audit = {
  shippedAt: new Date().toISOString(),
  campaignId: CANNONS_CAMP_ID, adGroupId: POWDER_CANNONS_AG_ID,
  addedPositives: [], addedPositiveResources: [],
  addedNegatives: [], addedNegativeResources: [],
  errors: [],
}

// POSITIVES
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
    console.log(`  ✓ [EXACT] "${p.text}"`)
    console.log(`    ${p.proof}`)
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'unknown'
    if (msg.includes('already exists') || msg.includes('DUPLICATE')) {
      console.log(`  ⊘ "${p.text}" already exists`)
    } else {
      console.log(`  ✗ "${p.text}" — ${msg}`)
      audit.errors.push({ type: 'positive', kw: p, error: msg })
    }
  }
  await new Promise(r => setTimeout(r, 200))
}

// NEGATIVES
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
    console.log(`  ✓ [${mt}] -"${n.text}" — ${n.reason}`)
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'unknown'
    if (msg.includes('already exists') || msg.includes('DUPLICATE')) {
      console.log(`  ⊘ -"${n.text}" already exists`)
    } else {
      console.log(`  ✗ -"${n.text}" — ${msg}`)
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
console.log(`Rollback: node scripts/ship-extinguisher-keywords.js --rollback`)

// Verify
const verify = await customer.query(`
  SELECT ad_group_criterion.keyword.text, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE ad_group.id = ${POWDER_CANNONS_AG_ID}
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.negative = FALSE
    AND ad_group_criterion.keyword.match_type = 'EXACT'
    AND ad_group_criterion.keyword.text IN (${POSITIVES.map(p => `'${p.text.replace(/'/g, "''")}'`).join(',')})
`)
console.log(`\nVerified live positives: ${verify.length}/${POSITIVES.length}`)
for (const r of verify) {
  console.log(`  ✓ [${r.ad_group_criterion?.keyword?.text}] status: ${r.ad_group_criterion?.status}`)
}

const verifyNeg = await customer.query(`
  SELECT campaign_criterion.keyword.text
  FROM campaign_criterion
  WHERE campaign.id = ${CANNONS_CAMP_ID}
    AND campaign_criterion.negative = TRUE
    AND campaign_criterion.keyword.text IN (${NEGATIVES.map(n => `'${n.text.replace(/'/g, "''")}'`).join(',')})
`)
console.log(`Verified live negatives: ${verifyNeg.length}/${NEGATIVES.length}`)

process.exit(0)
