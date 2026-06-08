/**
 * Enable YouTube network on all 3 PMAX campaigns.
 * Currently all 3 have YouTube=OFF, costing ~15-30% of PMAX inventory reach.
 *
 * Rollback: --rollback disables YouTube again
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/enable-youtube-pmax'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'ENABLE'} — YouTube on PMAX campaigns ===\n`)

// Get current PMAX campaign state
const rows = await customer.query(`
  SELECT campaign.id, campaign.name,
         campaign.network_settings.target_google_search,
         campaign.network_settings.target_search_network,
         campaign.network_settings.target_content_network,
         campaign.network_settings.target_youtube,
         campaign.network_settings.target_partner_search_network
  FROM campaign
  WHERE campaign.status='ENABLED' AND campaign.advertising_channel_type='PERFORMANCE_MAX'
`)

console.log(`Found ${rows.length} PMAX campaigns:`)
for (const r of rows) {
  console.log(`  • ${r.campaign.name}`)
  console.log(`    Current YouTube: ${r.campaign.network_settings?.target_youtube ? '✅ ON' : '🚨 OFF'}`)
}

if (ROLLBACK) {
  console.log(`\nRolling back — turning YouTube OFF...`)
  for (const r of rows) {
    try {
      await customer.campaigns.update([{
        resource_name: `customers/${custId}/campaigns/${r.campaign.id}`,
        network_settings: {
          target_google_search: r.campaign.network_settings?.target_google_search,
          target_search_network: r.campaign.network_settings?.target_search_network,
          target_content_network: r.campaign.network_settings?.target_content_network,
          target_youtube: false,
          target_partner_search_network: r.campaign.network_settings?.target_partner_search_network,
        },
      }])
      console.log(`  ✓ Rolled back: ${r.campaign.name}`)
    } catch (e) { console.log(`  ✗ ${r.campaign.name}: ${e?.errors?.[0]?.message}`) }
    await new Promise(r=>setTimeout(r, 400))
  }
  console.log('Rollback complete')
  process.exit(0)
}

// ENABLE YouTube on each
const log = { shippedAt: new Date().toISOString(), changes: [] }
for (const r of rows) {
  const cm = r.campaign
  console.log(`\n  Updating: ${cm.name}`)
  try {
    await customer.campaigns.update([{
      resource_name: `customers/${custId}/campaigns/${cm.id}`,
      network_settings: {
        target_google_search: cm.network_settings?.target_google_search,
        target_search_network: cm.network_settings?.target_search_network,
        target_content_network: cm.network_settings?.target_content_network,
        target_youtube: true,  // ← THE CHANGE
        target_partner_search_network: cm.network_settings?.target_partner_search_network,
      },
    }])
    console.log(`  ✓ YouTube ENABLED on ${cm.name}`)
    log.changes.push({
      campaignId: cm.id,
      campaignName: cm.name,
      previousYouTube: cm.network_settings?.target_youtube,
      newYouTube: true,
    })
  } catch (e) {
    console.log(`  ✗ Failed: ${e?.errors?.[0]?.message}`)
  }
  await new Promise(r=>setTimeout(r, 400))
}

writeFileSync(LOG, JSON.stringify(log, null, 2))
console.log(`\n✓ DONE — YouTube enabled on ${log.changes.length}/${rows.length} PMAX campaigns`)
console.log(`Log: ${LOG}`)
console.log(`Rollback: node scripts/enable-youtube-pmax.js --rollback`)
console.log(`\nExpected effect:`)
console.log(`  • PMAX now eligible to serve on YouTube (videos, Shorts, channel pages)`)
console.log(`  • +15-30% inventory reach within 24-48hrs`)
console.log(`  • Small learning adjustment 24-72hrs as algorithm explores YouTube`)
console.log(`  • Watch: PMAX impression volume Sunday/Monday`)
process.exit(0)
