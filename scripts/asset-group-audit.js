/**
 * Current creative inventory + performance per asset group
 *  - Lists all asset groups in PMAX campaigns
 *  - Performance per asset group (last 30d)
 *  - Asset-level performance ratings (BEST / GOOD / LOW / PENDING) for headlines/descriptions
 *  - RSA performance for Search campaigns
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

// 1. List PMAX asset groups + their 30d performance
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('  1. PMAX ASSET GROUPS — last 30d performance')
console.log('═══════════════════════════════════════════════════════════════════\n')

const agRows = await customer.query(`
  SELECT campaign.name, asset_group.id, asset_group.name, asset_group.status,
         asset_group.final_urls, asset_group.path1, asset_group.path2,
         metrics.cost_micros, metrics.impressions, metrics.clicks,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM asset_group
  WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    AND segments.date DURING LAST_30_DAYS
`)

// Aggregate (the query returns per-day rows)
const agAgg = new Map()
for (const r of agRows) {
  const id = r.asset_group?.id
  if (!agAgg.has(id)) agAgg.set(id, {
    camp: r.campaign?.name, name: r.asset_group?.name, status: r.asset_group?.status,
    urls: r.asset_group?.final_urls, path1: r.asset_group?.path1, path2: r.asset_group?.path2,
    spend:0, imp:0, clk:0, conv:0, value:0, allConv:0, allValue:0
  })
  const x = agAgg.get(id)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
  x.allConv += Number(r.metrics?.all_conversions||0)
  x.allValue += Number(r.metrics?.all_conversions_value||0)
}

const sorted = [...agAgg.entries()].sort((a,b)=>b[1].spend - a[1].spend)
console.log('Campaign                    | Status | Asset Group Name                         | Spend | Imp    | Clk | Conv | LC Rev | LC ROAS | aMER')
console.log('-'.repeat(150))
for (const [id, x] of sorted) {
  const roas = x.spend>0 ? (x.value/x.spend).toFixed(2)+'x' : '—'
  const aMer = x.spend>0 ? (x.allValue/x.spend).toFixed(2)+'x' : '—'
  console.log(`${(x.camp||'').slice(0,27).padEnd(27)} | ${String(x.status).padEnd(6)} | ${(x.name||'').slice(0,40).padEnd(40)} | $${x.spend.toFixed(0).padStart(4)} | ${String(x.imp).padStart(6)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(5)} | ${roas.padStart(7)} | ${aMer.padStart(6)}`)
}

// 2. Asset-level inventory for each PMAX asset group
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  2. ASSET INVENTORY per asset group (current creatives in account)')
console.log('═══════════════════════════════════════════════════════════════════\n')

for (const [agId, ag] of sorted) {
  console.log(`\n[${ag.camp}] → ${ag.name}`)
  console.log(`  URL: ${(ag.urls||[]).join(', ')} | path1: ${ag.path1||'—'} | path2: ${ag.path2||'—'}`)
  try {
    const assets = await customer.query(`
      SELECT asset_group_asset.asset, asset_group_asset.field_type,
             asset_group_asset.performance_label, asset_group_asset.status,
             asset.text_asset.text, asset.type,
             asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels,
             asset.youtube_video_asset.youtube_video_id
      FROM asset_group_asset
      WHERE asset_group.id = ${agId}
        AND asset_group_asset.status != 'REMOVED'
    `)
    const byField = new Map()
    for (const r of assets) {
      const ft = r.asset_group_asset?.field_type
      if (!byField.has(ft)) byField.set(ft, [])
      byField.get(ft).push(r)
    }
    for (const [ft, list] of [...byField.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
      console.log(`  ${ft} (${list.length}):`)
      for (const r of list.slice(0,12)) {
        const perf = r.asset_group_asset?.performance_label || 'UNRATED'
        const a = r.asset
        let label = ''
        if (a?.text_asset?.text) label = `"${a.text_asset.text}"`
        else if (a?.image_asset?.full_size) label = `image ${a.image_asset.full_size.width_pixels}×${a.image_asset.full_size.height_pixels}`
        else if (a?.youtube_video_asset?.youtube_video_id) label = `YT video ${a.youtube_video_asset.youtube_video_id}`
        else label = `${a?.type}`
        console.log(`    [${perf.padEnd(7)}] ${label.slice(0,90)}`)
      }
      if (list.length > 12) console.log(`    ... +${list.length-12} more`)
    }
  } catch(e) {
    console.log(`  Asset query failed: ${e.errors?.[0]?.message || e.message}`)
  }
}

// 3. Search RSAs — last 30d performance per ad
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  3. SEARCH RSAs — current ads with performance')
console.log('═══════════════════════════════════════════════════════════════════\n')

const rsa = await customer.query(`
  SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status,
         metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
  FROM ad_group_ad
  WHERE campaign.advertising_channel_type = 'SEARCH'
    AND ad_group_ad.status = 'ENABLED'
    AND segments.date DURING LAST_30_DAYS
`)
const rsaAgg = new Map()
for (const r of rsa) {
  const k = `${r.campaign?.name}|${r.ad_group?.name}|${r.ad_group_ad?.ad?.id}`
  if (!rsaAgg.has(k)) rsaAgg.set(k, { camp: r.campaign?.name, ag: r.ad_group?.name, id: r.ad_group_ad?.ad?.id, imp:0, clk:0, spend:0, conv:0 })
  const x = rsaAgg.get(k)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
}
console.log('Campaign                     | Ad Group           | Ad ID         | Imp  | Clk | Spend | Conv')
console.log('-'.repeat(110))
for (const [_,x] of [...rsaAgg.entries()].sort((a,b)=>b[1].spend-a[1].spend)) {
  if (x.spend < 0.5 && x.imp < 5) continue
  console.log(`${(x.camp||'').slice(0,28).padEnd(28)} | ${(x.ag||'').slice(0,18).padEnd(18)} | ${String(x.id).padEnd(13)} | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(1)}`)
}

console.log('\n✓ Done')
process.exit(0)
