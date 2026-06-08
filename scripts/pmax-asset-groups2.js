import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const PMAX_IDS = ['21113841118','21511998936','22841772135']

for (const id of PMAX_IDS) {
  const camp = await c.query(`SELECT campaign.name FROM campaign WHERE campaign.id=${id}`)
  console.log(`\n[${id}] ${camp[0]?.campaign?.name}`)
  const ags = await c.query(`SELECT asset_group.id, asset_group.name, asset_group.status FROM asset_group WHERE campaign.id=${id}`)
  for (const r of ags) {
    const ag = r.asset_group || r.assetGroup
    console.log(`  AG ${ag?.id} [status=${ag?.status}] ${ag?.name}`)
  }
}

console.log(`\n=== EXISTING SEARCH THEMES ===`)
const themes = await c.query(`SELECT asset_group.id, asset_group.name, campaign.name, asset_group_signal.search_theme.text FROM asset_group_signal`)
const byAg = new Map()
for (const r of themes) {
  const agId = r.asset_group?.id || r.assetGroup?.id
  const text = r.asset_group_signal?.search_theme?.text || r.assetGroupSignal?.searchTheme?.text
  const k = `${r.campaign?.name}||${r.asset_group?.name||r.assetGroup?.name}||${agId}`
  const arr = byAg.get(k) || []
  if (text) arr.push(text)
  byAg.set(k, arr)
}
for (const [k,texts] of byAg) {
  console.log(`\n  ${k}`)
  for (const t of texts) console.log(`    • "${t}"`)
}
process.exit(0)
