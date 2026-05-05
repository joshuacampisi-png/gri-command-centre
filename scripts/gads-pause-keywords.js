/**
 * Pause the 3 bleeding keywords in Search Cannons.
 * Match types: 2=EXACT, 3=PHRASE, 4=BROAD
 */
import 'dotenv/config'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

async function main() {
  const customer = getGadsCustomer()
  const custId = getGadsCustomerId()

  // Find campaign ID
  const camps = await customer.query(`
    SELECT campaign.id, campaign.name
    FROM campaign WHERE campaign.status = 'ENABLED'
  `)
  const searchCamp = camps.find(r => r.campaign?.name?.includes('Search') && r.campaign?.name?.includes('Cannon'))
  if (!searchCamp) { console.error('Search Cannons not found'); process.exit(1) }
  const campId = searchCamp.campaign.id
  console.log(`Search Cannons campaign: ${campId}`)

  // Get all enabled keywords
  const rows = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.id,
      ad_group.name
    FROM keyword_view
    WHERE campaign.id = ${campId}
      AND ad_group_criterion.status = 'ENABLED'
  `)

  // Dedup
  const seen = new Set()
  const keywords = []
  for (const r of rows) {
    const critId = String(r.ad_group_criterion?.criterion_id || '')
    const agId = String(r.ad_group?.id || '')
    const key = `${agId}_${critId}`
    if (seen.has(key)) continue
    seen.add(key)
    keywords.push({
      critId,
      agId,
      agName: r.ad_group?.name || '',
      text: r.ad_group_criterion?.keyword?.text || '',
      matchNum: r.ad_group_criterion?.keyword?.match_type,
    })
  }

  console.log(`\nFound ${keywords.length} enabled keywords. Match types found:`)
  const matchTypes = new Set(keywords.map(k => k.matchNum))
  for (const m of matchTypes) console.log(`  ${m}: ${typeof m}`)

  // Target keywords to pause
  const targets = [
    { text: 'gender reveal powder', match: 4 },    // BROAD
    { text: 'gender reveal cannon', match: 3 },     // PHRASE -- try number
    { text: 'gender powder cannon', match: 3 },     // PHRASE
  ]

  // Also try string matches
  const targetsStr = [
    { text: 'gender reveal powder', match: 'BROAD' },
    { text: 'gender reveal cannon', match: 'PHRASE' },
    { text: 'gender powder cannon', match: 'PHRASE' },
  ]

  const toPause = []
  for (const kw of keywords) {
    for (const t of targets) {
      if (kw.text === t.text && kw.matchNum === t.match) toPause.push(kw)
    }
    for (const t of targetsStr) {
      if (kw.text === t.text && kw.matchNum === t.match) toPause.push(kw)
    }
  }

  // Dedup pause list
  const pauseMap = new Map()
  for (const kw of toPause) pauseMap.set(`${kw.agId}_${kw.critId}`, kw)
  const finalPause = [...pauseMap.values()]

  if (finalPause.length === 0) {
    console.log('\nNo matches found. Dumping first 15 keywords for debug:')
    for (const kw of keywords.slice(0, 15)) {
      console.log(`  "${kw.text}" matchType=${kw.matchNum} (${typeof kw.matchNum}) ag=${kw.agName}`)
    }
    return
  }

  console.log(`\nPausing ${finalPause.length} keywords:`)
  for (const kw of finalPause) {
    const rn = `customers/${custId}/adGroupCriteria/${kw.agId}~${kw.critId}`
    try {
      await customer.adGroupCriteria.update([{ resource_name: rn, status: 'PAUSED' }])
      console.log(`  ✓ PAUSED "${kw.text}" [match=${kw.matchNum}]`)
    } catch (err) {
      console.error(`  ✗ FAILED "${kw.text}": ${err?.errors?.[0]?.message || err.message}`)
    }
  }
  console.log('\nDone.')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
