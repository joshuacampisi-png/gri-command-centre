/**
 * COMPREHENSIVE Google Ads Account Health Audit
 * Pulls everything visible via API + grades each area professionally
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync } from 'fs'

const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = n => n==null ? '—' : (Number(n)*100).toFixed(1)+'%'
const $ = n => `$${Number(n).toFixed(0)}`

console.log(`\n${'='.repeat(80)}`)
console.log(`GOOGLE ADS ACCOUNT AUDIT — ${new Date().toISOString().slice(0,16)}`)
console.log(`${'='.repeat(80)}\n`)

// ─────────────────────────────────────────────
// 1. CAMPAIGNS — all + status + budget + bid strategy
// ─────────────────────────────────────────────
console.log('━━━ 1. CAMPAIGN STRUCTURE ━━━\n')
const camps = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
         campaign.advertising_channel_sub_type, campaign.bidding_strategy_type,
         campaign.target_roas.target_roas, campaign.target_impression_share.location,
         campaign.target_impression_share.location_fraction_micros,
         campaign.target_impression_share.cpc_bid_ceiling_micros,
         campaign.maximize_conversion_value.target_roas,
         campaign_budget.amount_micros, campaign_budget.delivery_method
  FROM campaign
`)
const bsLabel = {1:'MANUAL_CPC',4:'ENHANCED_CPC',6:'TARGET_SPEND',7:'TARGET_CPA',8:'TARGET_ROAS',9:'MAX_CONVERSIONS',10:'MAX_CONV_VALUE',11:'TARGET_IMPRESSION_SHARE'}
const chLabel = {2:'SEARCH',3:'DISPLAY',4:'SHOPPING',6:'VIDEO',10:'PMAX',13:'DEMAND_GEN'}

const active = camps.filter(c => c.campaign?.status === 'ENABLED')
const paused = camps.filter(c => c.campaign?.status === 'PAUSED')
const removed = camps.filter(c => c.campaign?.status === 'REMOVED')

console.log(`Total campaigns:  ${camps.length}`)
console.log(`  ENABLED:        ${active.length}`)
console.log(`  PAUSED:         ${paused.length}`)
console.log(`  REMOVED:        ${removed.length}\n`)

console.log('ACTIVE CAMPAIGNS:')
console.log('Name'.padEnd(40) + ' | Channel  | Bid Strategy           | Daily Budget')
console.log('-'.repeat(110))
for (const r of active) {
  const ch = chLabel[r.campaign?.advertising_channel_type] || `enum=${r.campaign?.advertising_channel_type}`
  const bs = bsLabel[r.campaign?.bidding_strategy_type] || `enum=${r.campaign?.bidding_strategy_type}`
  const budget = Number(r.campaign_budget?.amount_micros||0)/1e6
  let bsDetail = ''
  if (r.campaign?.target_roas?.target_roas) bsDetail = ` (tROAS ${pct(r.campaign.target_roas.target_roas)})`
  else if (r.campaign?.maximize_conversion_value?.target_roas) bsDetail = ` (tROAS ${pct(r.campaign.maximize_conversion_value.target_roas)})`
  else if (r.campaign?.target_impression_share?.location_fraction_micros) bsDetail = ` (IS ${pct(Number(r.campaign.target_impression_share.location_fraction_micros)/1e6)})`
  console.log(`${(r.campaign?.name||'').slice(0,38).padEnd(40)} | ${ch.padEnd(8)} | ${(bs+bsDetail).padEnd(22)} | $${budget.toFixed(0).padStart(4)}/day`)
}

// ─────────────────────────────────────────────
// 2. CAMPAIGN 90-DAY PERFORMANCE
// ─────────────────────────────────────────────
console.log('\n\n━━━ 2. PERFORMANCE (last 90 days) ━━━\n')
const perf = await c.query(`
  SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share, metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share,
         metrics.search_top_impression_share, metrics.search_absolute_top_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '2026-02-28' AND '2026-05-28'
    AND campaign.status = 'ENABLED'
`)
const perfAgg = new Map()
for (const r of perf) {
  const cn = r.campaign?.name
  if (!perfAgg.has(cn)) perfAgg.set(cn, {imp:0,clk:0,spend:0,conv:0,val:0,is:[],lb:[],lr:[],top:[],abs:[],channel:chLabel[r.campaign?.advertising_channel_type]})
  const x = perfAgg.get(cn)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
  if (r.metrics?.search_impression_share!=null) x.is.push(Number(r.metrics.search_impression_share))
  if (r.metrics?.search_budget_lost_impression_share!=null) x.lb.push(Number(r.metrics.search_budget_lost_impression_share))
  if (r.metrics?.search_rank_lost_impression_share!=null) x.lr.push(Number(r.metrics.search_rank_lost_impression_share))
  if (r.metrics?.search_top_impression_share!=null) x.top.push(Number(r.metrics.search_top_impression_share))
  if (r.metrics?.search_absolute_top_impression_share!=null) x.abs.push(Number(r.metrics.search_absolute_top_impression_share))
}
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
console.log('Campaign'.padEnd(36) + ' | Ch    | Spend    | Rev     | ROAS  | SIS    | LostBud | LostRank | TopSIS')
console.log('-'.repeat(125))
const ranked = [...perfAgg.entries()].sort((a,b)=>b[1].spend-a[1].spend)
for (const [name, x] of ranked) {
  const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  console.log(`${name.slice(0,34).padEnd(36)} | ${(x.channel||'?').padEnd(5)} | $${x.spend.toFixed(0).padStart(6)} | $${x.val.toFixed(0).padStart(6)} | ${roas.padStart(5)} | ${pct(avg(x.is)).padStart(6)} | ${pct(avg(x.lb)).padStart(6)} | ${pct(avg(x.lr)).padStart(6)} | ${pct(avg(x.top)).padStart(6)}`)
}

// Account totals
let TOTAL = {imp:0,clk:0,spend:0,conv:0,val:0}
for (const [_,x] of perfAgg) { TOTAL.imp+=x.imp; TOTAL.clk+=x.clk; TOTAL.spend+=x.spend; TOTAL.conv+=x.conv; TOTAL.val+=x.val }
console.log('-'.repeat(125))
const accROAS = TOTAL.spend>0 ? (TOTAL.val/TOTAL.spend).toFixed(2)+'x' : '—'
console.log(`ACCOUNT TOTAL (90d)                  |       | $${TOTAL.spend.toFixed(0).padStart(6)} | $${TOTAL.val.toFixed(0).padStart(6)} | ${accROAS.padStart(5)}`)

// ─────────────────────────────────────────────
// 3. AD GROUP STRUCTURE
// ─────────────────────────────────────────────
console.log('\n\n━━━ 3. AD GROUP STRUCTURE ━━━\n')
const ags = await c.query(`
  SELECT campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.type
  FROM ad_group
  WHERE campaign.status = 'ENABLED'
`)
const agByCampaign = new Map()
for (const r of ags) {
  const cn = r.campaign?.name
  if (!agByCampaign.has(cn)) agByCampaign.set(cn, [])
  agByCampaign.get(cn).push({
    id: r.ad_group?.id,
    name: r.ad_group?.name,
    status: r.ad_group?.status,
    type: r.ad_group?.type,
  })
}
for (const [cn, agList] of agByCampaign) {
  const enabled = agList.filter(a => a.status === 'ENABLED').length
  console.log(`[${cn}]  ${enabled}/${agList.length} ad groups enabled`)
  for (const ag of agList.slice(0, 10)) {
    const flag = ag.status === 'ENABLED' ? '✓' : (ag.status === 'PAUSED' ? '⏸' : '✗')
    console.log(`   ${flag} ${ag.name} (type ${ag.type})`)
  }
  if (agList.length > 10) console.log(`   ... +${agList.length - 10} more`)
  console.log('')
}

// ─────────────────────────────────────────────
// 4. KEYWORD INVENTORY
// ─────────────────────────────────────────────
console.log('\n━━━ 4. KEYWORD INVENTORY (active Search campaigns) ━━━\n')
const kwData = await c.query(`
  SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, ad_group_criterion.quality_info.quality_score,
         metrics.impressions
  FROM keyword_view
  WHERE campaign.status = 'ENABLED'
    AND ad_group_criterion.negative = FALSE
    AND segments.date DURING LAST_30_DAYS
`)
const kwByCampaign = new Map()
const kwSeenKeys = new Set()
for (const r of kwData) {
  const cn = r.campaign?.name
  const key = `${cn}|${r.ad_group_criterion?.keyword?.text}|${r.ad_group_criterion?.keyword?.match_type}`
  if (kwSeenKeys.has(key)) continue
  kwSeenKeys.add(key)
  if (!kwByCampaign.has(cn)) kwByCampaign.set(cn, {total:0,enabled:0,paused:0,exact:0,phrase:0,broad:0,qs:[]})
  const x = kwByCampaign.get(cn)
  x.total++
  if (r.ad_group_criterion?.status === 'ENABLED') x.enabled++
  else if (r.ad_group_criterion?.status === 'PAUSED') x.paused++
  const mt = r.ad_group_criterion?.keyword?.match_type
  if (mt === 'EXACT') x.exact++
  else if (mt === 'PHRASE') x.phrase++
  else if (mt === 'BROAD') x.broad++
  if (r.ad_group_criterion?.quality_info?.quality_score) x.qs.push(r.ad_group_criterion.quality_info.quality_score)
}
console.log('Campaign'.padEnd(36) + ' | Total | Active | EXACT | PHRASE | BROAD | Avg QS')
console.log('-'.repeat(95))
for (const [cn, x] of kwByCampaign) {
  console.log(`${cn.slice(0,34).padEnd(36)} | ${String(x.total).padStart(5)} | ${String(x.enabled).padStart(6)} | ${String(x.exact).padStart(5)} | ${String(x.phrase).padStart(6)} | ${String(x.broad).padStart(5)} | ${x.qs.length?avg(x.qs).toFixed(1):'—'}`)
}

// ─────────────────────────────────────────────
// 5. NEGATIVE KEYWORDS
// ─────────────────────────────────────────────
console.log('\n\n━━━ 5. NEGATIVE KEYWORD INVENTORY ━━━\n')
const sharedSets = await c.query(`
  SELECT shared_set.name, shared_set.member_count, shared_set.status
  FROM shared_set
  WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
`)
console.log(`Total shared negative lists: ${sharedSets.length}`)
for (const s of sharedSets) {
  console.log(`  ${s.shared_set?.name?.padEnd(40)} ${s.shared_set?.member_count} negatives (${s.shared_set?.status})`)
}

const inlineNeg = await c.query(`
  SELECT campaign.name, campaign_criterion.keyword.text
  FROM campaign_criterion
  WHERE campaign.status = 'ENABLED'
    AND campaign_criterion.type = 'KEYWORD'
    AND campaign_criterion.negative = TRUE
`)
const inlineByCampaign = new Map()
for (const r of inlineNeg) {
  const cn = r.campaign?.name
  inlineByCampaign.set(cn, (inlineByCampaign.get(cn)||0)+1)
}
console.log(`\nInline negative keywords per enabled campaign:`)
for (const [cn, n] of inlineByCampaign) console.log(`  ${cn.padEnd(40)} ${n}`)

// ─────────────────────────────────────────────
// 6. ADS & EXTENSIONS
// ─────────────────────────────────────────────
console.log('\n\n━━━ 6. ADS & EXTENSIONS ━━━\n')

const ads = await c.query(`
  SELECT campaign.name, ad_group_ad.ad.type, ad_group_ad.status,
         ad_group_ad.policy_summary.approval_status
  FROM ad_group_ad
  WHERE campaign.status = 'ENABLED'
`)
const adsByCampaign = new Map()
for (const r of ads) {
  const cn = r.campaign?.name
  if (!adsByCampaign.has(cn)) adsByCampaign.set(cn, {total:0,enabled:0,paused:0,disapproved:0})
  const x = adsByCampaign.get(cn)
  x.total++
  if (r.ad_group_ad?.status === 'ENABLED') x.enabled++
  if (r.ad_group_ad?.status === 'PAUSED') x.paused++
  const ap = strCh(r.ad_group_ad?.policy_summary?.approval_status)
  if (ap === 'DISAPPROVED' || ap === 'SITE_SUSPENDED') x.disapproved++
}
console.log('Ads per campaign:')
for (const [cn, x] of adsByCampaign) {
  const flag = x.disapproved > 0 ? '⚠ ' : '  '
  console.log(`${flag}${cn.padEnd(40)} ${x.enabled} enabled, ${x.paused} paused${x.disapproved>0?', '+x.disapproved+' DISAPPROVED':''}`)
}

// Extensions/assets
try {
  const assets = await c.query(`
    SELECT asset.id, asset.type, asset.name
    FROM asset
  `)
  const assetTypes = {}
  for (const a of assets) {
    const t = strCh(a.asset?.type)
    assetTypes[t] = (assetTypes[t]||0)+1
  }
  console.log(`\nAccount-level assets (extensions):`)
  for (const [t, n] of Object.entries(assetTypes).sort((a,b)=>b[1]-a[1])) console.log(`  ${t.padEnd(28)} ${n}`)
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// ─────────────────────────────────────────────
// 7. PMAX ASSET GROUPS
// ─────────────────────────────────────────────
console.log('\n\n━━━ 7. PMAX ASSET GROUPS ━━━\n')
try {
  const ag = await c.query(`
    SELECT campaign.name, asset_group.id, asset_group.name, asset_group.status,
           asset_group.ad_strength
    FROM asset_group
    WHERE campaign.status = 'ENABLED'
  `)
  for (const r of ag) {
    const strength = strCh(r.asset_group?.ad_strength)
    console.log(`  [${r.campaign?.name?.padEnd(28)}] ${r.asset_group?.name?.padEnd(40)} ${r.asset_group?.status} | strength: ${strength}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// ─────────────────────────────────────────────
// 8. CONVERSION TRACKING
// ─────────────────────────────────────────────
console.log('\n\n━━━ 8. CONVERSION TRACKING ━━━\n')
try {
  const conv = await c.query(`
    SELECT conversion_action.name, conversion_action.status, conversion_action.type,
           conversion_action.category, conversion_action.include_in_conversions_metric,
           conversion_action.primary_for_goal,
           conversion_action.counting_type
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
  `)
  console.log(`Active conversion actions: ${conv.length}\n`)
  console.log('Name'.padEnd(40) + ' | Status   | Type | Category | Primary | Include')
  console.log('-'.repeat(105))
  for (const r of conv) {
    const ca = r.conversion_action
    console.log(`${(ca?.name||'').slice(0,38).padEnd(40)} | ${ca?.status?.padEnd(8)} | ${strCh(ca?.type).slice(0,4)} | ${strCh(ca?.category).slice(0,8).padEnd(8)} | ${ca?.primary_for_goal?'✓':'✗'} | ${ca?.include_in_conversions_metric?'✓':'✗'}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// ─────────────────────────────────────────────
// 9. RECENT CHANGE EVENTS (last 14 days)
// ─────────────────────────────────────────────
console.log('\n\n━━━ 9. RECENT CHANGES (last 14 days) ━━━\n')
try {
  const changes = await c.query(`
    SELECT change_event.change_date_time, change_event.user_email,
           change_event.change_resource_type, change_event.resource_change_operation,
           campaign.name
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 50
  `)
  console.log(`Total recent changes: ${changes.length}`)
  const byUser = new Map()
  const byType = new Map()
  for (const r of changes) {
    const u = r.change_event?.user_email
    const t = strCh(r.change_event?.change_resource_type)
    byUser.set(u, (byUser.get(u)||0)+1)
    byType.set(t, (byType.get(t)||0)+1)
  }
  console.log('\nBy user:')
  for (const [u,n] of byUser) console.log(`  ${u}  ${n} changes`)
  console.log('\nBy resource type:')
  for (const [t,n] of [...byType.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${t.padEnd(40)} ${n}`)
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

mkdirSync('data/snapshots/full-audit', { recursive: true })
writeFileSync('data/snapshots/full-audit/audit.json', JSON.stringify({
  campaigns: [...perfAgg.entries()].map(([k,v]) => ({ name: k, ...v, is: avg(v.is), lb: avg(v.lb), lr: avg(v.lr), top: avg(v.top), abs: avg(v.abs) })),
}, null, 2))
console.log(`\nFull data: data/snapshots/full-audit/audit.json`)
process.exit(0)
