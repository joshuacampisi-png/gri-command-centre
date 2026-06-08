/**
 * Pull Google Ads Auction Insights via `domain` resource
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

console.log('\n=== AUCTION INSIGHTS — last 30d (across all campaigns where data exposed) ===\n')

// Standard auction insights query — `domain` resource exposes competitor domains
try {
  const rows = await customer.query(`
    SELECT
      campaign.name,
      campaign.advertising_channel_type,
      domain.domain,
      metrics.impression_share,
      metrics.outranking_share,
      metrics.top_of_page_rate,
      metrics.absolute_top_of_page_rate,
      metrics.overlap_rate,
      metrics.position_above_rate
    FROM domain
    WHERE segments.date DURING LAST_30_DAYS
  `)
  console.log(`Got ${rows.length} domain rows`)
  // Aggregate competitor across campaigns
  const byDomain = new Map()
  for (const r of rows) {
    const d = r.domain?.domain || ''
    if (!d || /genderrevealideas/i.test(d)) continue
    if (!byDomain.has(d)) byDomain.set(d, { camps: new Set(), is:[], outrank:[], topPage:[], absTop:[], overlap:[], posAbove:[] })
    const x = byDomain.get(d)
    x.camps.add(r.campaign?.name)
    const push = (arr, v) => { if (v != null) arr.push(Number(v)) }
    push(x.is, r.metrics?.impression_share)
    push(x.outrank, r.metrics?.outranking_share)
    push(x.topPage, r.metrics?.top_of_page_rate)
    push(x.absTop, r.metrics?.absolute_top_of_page_rate)
    push(x.overlap, r.metrics?.overlap_rate)
    push(x.posAbove, r.metrics?.position_above_rate)
  }
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
  const pct = n => n==null ? '—' : (n*100).toFixed(1)+'%'

  // Sort by overlap rate (how often they show alongside us)
  const ranked = [...byDomain.entries()]
    .map(([d, x]) => ({ domain:d, camps:[...x.camps], overlap:avg(x.overlap), is:avg(x.is), topPage:avg(x.topPage), absTop:avg(x.absTop), posAbove:avg(x.posAbove), outrank:avg(x.outrank) }))
    .sort((a,b) => (b.overlap||0) - (a.overlap||0))

  console.log(`\n=== ALL COMPETITORS (sorted by Overlap Rate = how often they show alongside us) ===\n`)
  console.log('Domain                                       | Overlap | TheirIS | TopPage | AbsTop | Above Us | Campaigns')
  console.log('-'.repeat(130))
  for (const r of ranked.slice(0,25)) {
    console.log(`${r.domain.slice(0,44).padEnd(44)} | ${pct(r.overlap).padStart(7)} | ${pct(r.is).padStart(7)} | ${pct(r.topPage).padStart(7)} | ${pct(r.absTop).padStart(6)} | ${pct(r.posAbove).padStart(8)} | ${r.camps.length}`)
  }

  // Show per-campaign
  console.log(`\n=== BY CAMPAIGN — top competitors per campaign ===\n`)
  const byCampaign = new Map()
  for (const r of rows) {
    const c = r.campaign?.name || '?'
    const d = r.domain?.domain || ''
    if (!d || /genderrevealideas/i.test(d)) continue
    if (!byCampaign.has(c)) byCampaign.set(c, new Map())
    const m = byCampaign.get(c)
    if (!m.has(d)) m.set(d, { overlap:[], is:[], posAbove:[] })
    const x = m.get(d)
    if (r.metrics?.overlap_rate != null) x.overlap.push(Number(r.metrics.overlap_rate))
    if (r.metrics?.impression_share != null) x.is.push(Number(r.metrics.impression_share))
    if (r.metrics?.position_above_rate != null) x.posAbove.push(Number(r.metrics.position_above_rate))
  }
  for (const [camp, comps] of byCampaign.entries()) {
    console.log(`\n[${camp}]`)
    const sorted = [...comps.entries()]
      .map(([d,x])=>({ d, overlap:avg(x.overlap), is:avg(x.is), posAbove:avg(x.posAbove) }))
      .sort((a,b)=>(b.overlap||0)-(a.overlap||0))
      .slice(0,8)
    sorted.forEach(c => console.log(`  ${c.d.padEnd(44)} | overlap ${pct(c.overlap).padStart(6)} | theirIS ${pct(c.is).padStart(6)} | aboveUs ${pct(c.posAbove).padStart(6)}`))
  }
} catch(e) {
  console.log('Error:', JSON.stringify(e.errors?.[0] || e.message))
}
process.exit(0)
