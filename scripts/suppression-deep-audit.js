/**
 * Deep audit for remaining suppression vectors across the Google Ads account
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== SUPPRESSION DEEP AUDIT — Looking for hidden brakes ===\n`)

// 1. Campaign settings — networks, devices, location, language
console.log('--- 1. CAMPAIGN SETTINGS (Network + Targeting) ---')
const camps = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status,
         campaign.network_settings.target_google_search,
         campaign.network_settings.target_search_network,
         campaign.network_settings.target_content_network,
         campaign.network_settings.target_partner_search_network,
         campaign.network_settings.target_youtube,
         campaign.advertising_channel_type,
         campaign.advertising_channel_sub_type,
         campaign.bidding_strategy_type,
         campaign.maximize_conversion_value.target_roas,
         campaign.geo_target_type_setting.positive_geo_target_type,
         campaign.geo_target_type_setting.negative_geo_target_type
  FROM campaign
  WHERE campaign.status='ENABLED'
`)
for (const r of camps) {
  const cm = r.campaign
  const ns = cm?.network_settings || {}
  console.log(`\n  ${cm.name}`)
  console.log(`    Channel: ${cm.advertising_channel_type} | Bidding: ${cm.bidding_strategy_type}`)
  console.log(`    Google Search: ${ns.target_google_search ? '✅ ON' : '🚨 OFF'}`)
  console.log(`    Search Partners: ${ns.target_search_network ? '✅ ON' : '🚨 OFF'}`)
  console.log(`    Display: ${ns.target_content_network ? '✅ ON' : '🚨 OFF'}`)
  console.log(`    YouTube: ${ns.target_youtube ? '✅ ON' : '🚨 OFF'}`)
  console.log(`    Partner Search Network: ${ns.target_partner_search_network ? '✅ ON' : '🚨 OFF'}`)
  if (cm.maximize_conversion_value?.target_roas) {
    console.log(`    Target ROAS: ${cm.maximize_conversion_value.target_roas}x`)
  }
}

// 2. Location targets / exclusions
console.log(`\n--- 2. LOCATION TARGETING (per campaign) ---`)
const locs = await c.query(`
  SELECT campaign.id, campaign.name,
         campaign_criterion.location.geo_target_constant,
         campaign_criterion.negative
  FROM campaign_criterion
  WHERE campaign_criterion.type='LOCATION' AND campaign.status='ENABLED'
`)
const byCamp = new Map()
for (const r of locs) {
  const k = r.campaign?.name
  if (!byCamp.has(k)) byCamp.set(k, {positive:[], negative:[]})
  const x = byCamp.get(k)
  const target = r.campaign_criterion?.location?.geo_target_constant
  if (r.campaign_criterion?.negative) x.negative.push(target)
  else x.positive.push(target)
}
for (const [name, x] of byCamp) {
  console.log(`\n  ${name}`)
  console.log(`    Positive: ${x.positive.length} locations targeted`)
  console.log(`    🚨 EXCLUDED: ${x.negative.length} locations ${x.negative.length>0 ? '— investigate!' : ''}`)
  if (x.negative.length) for (const n of x.negative) console.log(`      - ${n}`)
}

// 3. Demographic exclusions (age/gender)
console.log(`\n--- 3. DEMOGRAPHIC EXCLUSIONS ---`)
try {
  const demo = await c.query(`
    SELECT campaign.name, ad_group_criterion.type, ad_group_criterion.gender.type, ad_group_criterion.age_range.type, ad_group_criterion.negative
    FROM ad_group_criterion
    WHERE campaign.status='ENABLED' AND (ad_group_criterion.type='GENDER' OR ad_group_criterion.type='AGE_RANGE') AND ad_group_criterion.negative=TRUE
  `)
  if (!demo.length) console.log('  ✅ No demographic exclusions')
  for (const r of demo) {
    console.log(`  🚨 ${r.campaign.name} | Excluded: ${r.ad_group_criterion?.gender?.type || r.ad_group_criterion?.age_range?.type}`)
  }
} catch(e) { console.log('  (skip - ' + (e?.errors?.[0]?.message?.slice(0,80) || 'no data') + ')') }

// 4. Device bid modifiers
console.log(`\n--- 4. DEVICE BID MODIFIERS (-100% = excluded) ---`)
try {
  const dev = await c.query(`
    SELECT campaign.name, campaign_criterion.device.type, campaign_criterion.bid_modifier
    FROM campaign_criterion
    WHERE campaign.status='ENABLED' AND campaign_criterion.type='DEVICE'
  `)
  if (!dev.length) console.log('  ✅ No device modifiers (default = all on)')
  for (const r of dev) {
    const mod = r.campaign_criterion?.bid_modifier
    const pct = mod ? ((mod-1)*100).toFixed(0)+'%' : '0%'
    const flag = mod && mod < 0.1 ? '🚨' : ''
    console.log(`  ${r.campaign.name} | ${r.campaign_criterion.device.type}: ${pct} ${flag}`)
  }
} catch(e) { console.log('  ERR') }

// 5. Ad schedule (dayparting)
console.log(`\n--- 5. AD SCHEDULE (dayparting) ---`)
try {
  const sched = await c.query(`
    SELECT campaign.name, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour
    FROM campaign_criterion
    WHERE campaign.status='ENABLED' AND campaign_criterion.type='AD_SCHEDULE'
  `)
  if (!sched.length) console.log('  ✅ No schedule restrictions (24/7 serving)')
  for (const r of sched) {
    console.log(`  🚨 ${r.campaign.name} | ${r.campaign_criterion.ad_schedule.day_of_week} ${r.campaign_criterion.ad_schedule.start_hour}:00-${r.campaign_criterion.ad_schedule.end_hour}:00`)
  }
} catch(e) { console.log('  ERR') }

// 6. Negative audiences
console.log(`\n--- 6. NEGATIVE AUDIENCES ---`)
try {
  const audN = await c.query(`
    SELECT campaign.name, campaign_criterion.user_list.user_list, campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign.status='ENABLED' AND campaign_criterion.type='USER_LIST' AND campaign_criterion.negative=TRUE
  `)
  if (!audN.length) console.log('  ✅ No negative audiences')
  for (const r of audN) console.log(`  🚨 ${r.campaign.name} | Excluded list: ${r.campaign_criterion?.user_list?.user_list}`)
} catch(e) { console.log('  ERR') }

// 7. Asset groups status
console.log(`\n--- 7. PMAX ASSET GROUPS ---`)
try {
  const ag = await c.query(`
    SELECT campaign.name, asset_group.id, asset_group.name, asset_group.status
    FROM asset_group
    WHERE campaign.status='ENABLED'
  `)
  for (const r of ag) {
    const flag = r.asset_group.status !== 2 ? '🚨' : '✅'
    console.log(`  ${flag} ${r.campaign.name} → ${r.asset_group.name} (status: ${r.asset_group.status === 2 ? 'ENABLED' : 'PAUSED'})`)
  }
} catch(e) { console.log('  ERR') }

// 8. Brand exclusions in PMAX (modern feature)
console.log(`\n--- 8. PMAX BRAND EXCLUSIONS (Brand Lists) ---`)
try {
  const brandSets = await c.query(`SELECT campaign.name, campaign.brand_guidelines_enabled FROM campaign WHERE campaign.status='ENABLED' AND campaign.advertising_channel_type='PERFORMANCE_MAX'`)
  for (const r of brandSets) {
    console.log(`  ${r.campaign.name} | Brand Guidelines: ${r.campaign.brand_guidelines_enabled ? 'ENABLED' : 'OFF'}`)
  }
} catch(e) { console.log('  (brand exclusion query unsupported in API version)') }

// 9. Ad extensions / assets
console.log(`\n--- 9. AD EXTENSIONS (Sitelinks, Callouts, Snippets, Images) ---`)
try {
  const exts = await c.query(`
    SELECT campaign.name, asset.type
    FROM campaign_asset
    WHERE campaign.status='ENABLED'
  `)
  const extByCamp = new Map()
  for (const r of exts) {
    const k = r.campaign.name
    if (!extByCamp.has(k)) extByCamp.set(k, {})
    extByCamp.get(k)[r.asset.type] = (extByCamp.get(k)[r.asset.type]||0)+1
  }
  for (const [name, types] of extByCamp) {
    console.log(`  ${name}`)
    for (const [type, count] of Object.entries(types)) console.log(`    ${type}: ${count}`)
  }
} catch(e) { console.log('  ERR: ' + e?.errors?.[0]?.message?.slice(0,100)) }

// 10. Conversion goals
console.log(`\n--- 10. CONVERSION GOALS ---`)
try {
  const convs = await c.query(`
    SELECT customer.id, customer.conversion_tracking_setting.accepted_customer_data_terms,
           customer.conversion_tracking_setting.conversion_tracking_status
    FROM customer
  `)
  for (const r of convs) console.log(`  Tracking status: ${r.customer.conversion_tracking_setting?.conversion_tracking_status}`)

  const goals = await c.query(`SELECT conversion_action.name, conversion_action.status, conversion_action.primary_for_goal, conversion_action.category FROM conversion_action`)
  console.log(`\n  Active conversion actions:`)
  for (const r of goals) {
    const ca = r.conversion_action
    if (ca.status === 2) {
      console.log(`    ✅ ${ca.name} (${ca.category}) ${ca.primary_for_goal ? '— PRIMARY' : ''}`)
    }
  }
} catch(e) { console.log('  ERR') }

process.exit(0)
