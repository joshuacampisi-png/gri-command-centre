import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const AG_ID = 6500169557

// 1. Asset group basic info
const ag = await c.query(`SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls, campaign.name FROM asset_group WHERE asset_group.id=${AG_ID}`)
console.log('AG:', JSON.stringify(ag[0],null,2))

// 2. Assets attached
const assets = await c.query(`
  SELECT asset_group_asset.field_type, asset_group_asset.status, asset.id, asset.name, asset.type, asset.text_asset.text
  FROM asset_group_asset WHERE asset_group.id = ${AG_ID}
`)
console.log(`\nAssets attached: ${assets.length}`)
const byType = {}
for (const r of assets) {
  const ft = r.asset_group_asset?.field_type
  byType[ft] = (byType[ft]||0)+1
}
console.log('  By field type:', byType)

// 3. Historical performance — last 365d
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-365*86400000).toISOString().slice(0,10)
const perf = await c.query(`SELECT segments.month, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM asset_group WHERE asset_group.id=${AG_ID} AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.month ASC`)
console.log(`\nMonth      | Imp    | Clk   | Spend  | Conv | Value  | ROAS`)
let tSp=0,tVal=0,tConv=0,tImp=0
for (const r of perf) {
  const imp=Number(r.metrics?.impressions||0)
  if (imp===0) continue
  const clk=Number(r.metrics?.clicks||0)
  const sp=Number(r.metrics?.cost_micros||0)/1e6
  const conv=Number(r.metrics?.conversions||0)
  const val=Number(r.metrics?.conversions_value||0)
  tSp+=sp;tVal+=val;tConv+=conv;tImp+=imp
  const roas=sp?(val/sp).toFixed(2):'-'
  console.log(`${r.segments?.month?.slice(0,10)} | ${String(imp).padStart(6)} | ${String(clk).padStart(5)} | $${sp.toFixed(0).padStart(5)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(5)} | ${roas}x`)
}
console.log(`\nLifetime: ${tImp}imp $${tSp.toFixed(0)} spent → $${tVal.toFixed(0)} value (${tSp?(tVal/tSp).toFixed(2):'-'}x ROAS), ${tConv.toFixed(0)} conv`)
process.exit(0)
