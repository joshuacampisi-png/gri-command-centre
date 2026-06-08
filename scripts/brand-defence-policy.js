import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const AG = 193897092609

// Pull full ad content + policy topics
const ads = await c.query(`SELECT ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls, ad_group_ad.policy_summary FROM ad_group_ad WHERE ad_group.id=${AG}`)
for (const r of ads) {
  console.log(`\n=== AD ${r.ad_group_ad?.ad?.id} ===`)
  console.log('URL:', (r.ad_group_ad?.ad?.final_urls||[]).join(','))
  console.log('Headlines:')
  for (const h of (r.ad_group_ad?.ad?.responsive_search_ad?.headlines||[]).slice(0,15)) console.log(`  • ${h.text}`)
  console.log('Descriptions:')
  for (const d of (r.ad_group_ad?.ad?.responsive_search_ad?.descriptions||[]).slice(0,5)) console.log(`  • ${d.text}`)
  console.log('Policy summary:')
  console.log(JSON.stringify(r.ad_group_ad?.policy_summary, null, 2))
}
process.exit(0)
