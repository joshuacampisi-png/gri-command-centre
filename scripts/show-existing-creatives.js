/**
 * Show all existing creatives in active PMax asset groups
 * (Skip the failed performance_label field, get the assets themselves)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

// Get active asset groups first (with 30d perf)
const agRows = await customer.query(`
  SELECT campaign.name, asset_group.id, asset_group.name, asset_group.final_urls,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM asset_group
  WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    AND asset_group.status = 'ENABLED'
    AND segments.date DURING LAST_30_DAYS
`)
const ags = new Map()
for (const r of agRows) {
  const id = r.asset_group.id
  if (!ags.has(id)) ags.set(id, {
    camp: r.campaign.name, name: r.asset_group.name, urls: r.asset_group.final_urls,
    spend: 0, conv: 0, value: 0
  })
  const a = ags.get(id)
  a.spend += Number(r.metrics?.cost_micros||0)/1e6
  a.conv  += Number(r.metrics?.conversions||0)
  a.value += Number(r.metrics?.conversions_value||0)
}

const activeAgs = [...ags.entries()].filter(([_,a])=>a.spend>0).sort((a,b)=>b[1].spend-a[1].spend)

console.log(`\n=== ACTIVE PMAX ASSET GROUPS — ${activeAgs.length} currently serving ===\n`)

for (const [agId, ag] of activeAgs) {
  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`)
  console.log(`║ [${ag.camp}]`)
  console.log(`║ → ${ag.name}`)
  console.log(`║ Landing: ${(ag.urls||[]).join(', ')}`)
  console.log(`║ 30d perf: $${ag.spend.toFixed(0)} spend → ${ag.conv.toFixed(1)} conv → $${ag.value.toFixed(0)} rev → ${(ag.value/ag.spend).toFixed(2)}x ROAS`)
  console.log(`╚══════════════════════════════════════════════════════════════════╝`)

  try {
    // Text assets (headlines, descriptions, long headlines)
    const textAssets = await customer.query(`
      SELECT asset_group_asset.field_type, asset.text_asset.text
      FROM asset_group_asset
      WHERE asset_group.id = ${agId}
        AND asset_group_asset.status != 'REMOVED'
        AND asset.type = 'TEXT'
    `)
    const byField = new Map()
    for (const r of textAssets) {
      const ft = r.asset_group_asset?.field_type || 'UNKNOWN'
      if (!byField.has(ft)) byField.set(ft, [])
      byField.get(ft).push(r.asset?.text_asset?.text || '')
    }
    for (const [ft, list] of [...byField.entries()].sort()) {
      console.log(`\n  📝 ${ft} (${list.length}):`)
      list.forEach(t => console.log(`     • ${t}`))
    }

    // Image asset count
    const imgAssets = await customer.query(`
      SELECT asset_group_asset.field_type,
             asset.image_asset.full_size.width_pixels,
             asset.image_asset.full_size.height_pixels,
             asset.image_asset.full_size.url
      FROM asset_group_asset
      WHERE asset_group.id = ${agId}
        AND asset_group_asset.status != 'REMOVED'
        AND asset.type = 'IMAGE'
    `)
    const imgByField = new Map()
    for (const r of imgAssets) {
      const ft = r.asset_group_asset?.field_type || 'UNKNOWN'
      if (!imgByField.has(ft)) imgByField.set(ft, [])
      imgByField.get(ft).push({
        w: r.asset?.image_asset?.full_size?.width_pixels,
        h: r.asset?.image_asset?.full_size?.height_pixels,
        url: r.asset?.image_asset?.full_size?.url
      })
    }
    for (const [ft, list] of [...imgByField.entries()].sort()) {
      console.log(`\n  🖼️  ${ft} (${list.length}):`)
      list.slice(0,5).forEach(i => console.log(`     • ${i.w}×${i.h}  ${(i.url||'').slice(0,80)}`))
      if (list.length > 5) console.log(`     ... +${list.length-5} more`)
    }

    // Video asset count
    const videoAssets = await customer.query(`
      SELECT asset_group_asset.field_type, asset.youtube_video_asset.youtube_video_id, asset.youtube_video_asset.youtube_video_title
      FROM asset_group_asset
      WHERE asset_group.id = ${agId}
        AND asset_group_asset.status != 'REMOVED'
        AND asset.type = 'YOUTUBE_VIDEO'
    `)
    if (videoAssets.length) {
      console.log(`\n  🎬 VIDEOS (${videoAssets.length}):`)
      videoAssets.forEach(r => console.log(`     • https://youtube.com/watch?v=${r.asset?.youtube_video_asset?.youtube_video_id} — "${r.asset?.youtube_video_asset?.youtube_video_title||''}"`))
    } else {
      console.log(`\n  🎬 VIDEOS: NONE ❌ (Google auto-generates — these rate LOW)`)
    }

    // Logos
    const logoAssets = await customer.query(`
      SELECT asset_group_asset.field_type,
             asset.image_asset.full_size.width_pixels,
             asset.image_asset.full_size.height_pixels
      FROM asset_group_asset
      WHERE asset_group.id = ${agId}
        AND asset_group_asset.status != 'REMOVED'
        AND asset_group_asset.field_type IN ('LOGO','LANDSCAPE_LOGO')
    `)
    if (logoAssets.length) {
      console.log(`\n  🏷️  LOGOS (${logoAssets.length}):`)
      logoAssets.forEach(r => console.log(`     • ${r.asset_group_asset?.field_type} ${r.asset?.image_asset?.full_size?.width_pixels}×${r.asset?.image_asset?.full_size?.height_pixels}`))
    }
  } catch(e) {
    console.log(`  Error: ${e.errors?.[0]?.message || e.message}`)
  }
}
process.exit(0)
