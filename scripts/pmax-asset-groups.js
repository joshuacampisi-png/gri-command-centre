/**
 * Pull asset groups + existing Search Themes for all enabled PMAX campaigns
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const PMAX_IDS = ['21113841118','21511998936','22841772135']

console.log(`\n=== PMAX ASSET GROUPS ===\n`)
for (const id of PMAX_IDS) {
  const camp = await c.query(`SELECT campaign.name FROM campaign WHERE campaign.id=${id}`)
  console.log(`\n[${id}] ${camp[0]?.campaign?.name}`)
  const ags = await c.query(`SELECT asset_group.id, asset_group.name, asset_group.status FROM asset_group WHERE campaign.id=${id}`)
  for (const r of ags) {
    console.log(`  AG ${r.assetGroup?.id} [${r.assetGroup?.status}] ${r.assetGroup?.name}`)
  }
}

// Existing Search Themes (campaign_search_term_insight or asset_group_signal)
console.log(`\n\n=== EXISTING SEARCH THEMES (asset_group_signal) ===\n`)
try {
  const themes = await c.query(`
    SELECT asset_group.id, asset_group.name, asset_group_signal.search_theme.text
    FROM asset_group_signal
  `)
  for (const r of themes) {
    console.log(`  AG ${r.assetGroup?.id} "${r.assetGroup?.name}" → theme: "${r.assetGroupSignal?.searchTheme?.text}"`)
  }
  if (!themes.length) console.log('  (no Search Themes configured)')
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message || e?.message}`) }
process.exit(0)
