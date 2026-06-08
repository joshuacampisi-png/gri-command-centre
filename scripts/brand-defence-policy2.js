import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const AG = 193897092609
const ads = await c.query(`SELECT ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE ad_group.id=${AG}`)
for (const r of ads) {
  console.log(`\n=== AD ${r.ad_group_ad?.ad?.id} ===`)
  console.log('URL:', (r.ad_group_ad?.ad?.final_urls||[]).join(','))
  const rsa = r.ad_group_ad?.ad?.responsive_search_ad
  console.log('Headlines:')
  for (const h of (rsa?.headlines||[])) console.log(`  • [${h.asset_performance_label||'-'}] [${h.policy_summary_info?.approval_status||'-'}] "${h.text}"`)
  console.log('Descriptions:')
  for (const d of (rsa?.descriptions||[])) console.log(`  • [${d.asset_performance_label||'-'}] [${d.policy_summary_info?.approval_status||'-'}] "${d.text}"`)
}
process.exit(0)
