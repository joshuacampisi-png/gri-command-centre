/**
 * Deep paid audit — find the smoking gun.
 * 1. Account Change History (every change in last 30 days)
 * 2. Bid strategy + targets per campaign
 * 3. Daily impression share trend
 * 4. Asset group performance
 * 5. Quality score / status per keyword
 * 6. YoY seasonality check
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

console.log(`\n========== DEEP PAID AUDIT — ${daysAgo(0)} ==========\n`)

// 1. Change history — every change in last 30 days
console.log('--- CHANGE HISTORY (last 30 days, ALL changes) ---')
try {
  const changes = await customer.query(`
    SELECT
      change_event.change_date_time,
      change_event.change_resource_type,
      change_event.client_type,
      change_event.user_email,
      change_event.changed_fields,
      change_event.old_resource,
      change_event.new_resource,
      change_event.resource_change_operation,
      campaign.name
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_30_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 100
  `)
  console.log(`Found ${changes.length} changes\n`)
  for (const c of changes) {
    const e = c.change_event
    const dt = (e?.change_date_time || '').replace('T', ' ').slice(0, 19)
    const op = e?.resource_change_operation
    const rt = e?.change_resource_type
    const ct = e?.client_type
    const user = (e?.user_email || '').slice(0, 40)
    const fields = e?.changed_fields ? Object.keys(e.changed_fields).slice(0, 3).join(',') : ''
    const camp = c.campaign?.name?.substring(0, 30) || ''
    console.log(`  ${dt}  ${op?.padEnd(8) || ''}  ${rt?.padEnd(20) || ''}  ${ct?.padEnd(15) || ''}  ${user.padEnd(35)}  ${camp}`)
  }
} catch (e) {
  console.log('  ❌ change_event query failed:', e.message?.slice(0, 200))
}

// 2. Bid strategy + targets per campaign
console.log('\n--- BID STRATEGY PER CAMPAIGN ---')
const camps = await customer.query(`
  SELECT campaign.name, campaign.status, campaign.bidding_strategy_type,
    campaign.maximize_conversion_value.target_roas,
    campaign.target_roas.target_roas,
    campaign.target_cpa.target_cpa_micros,
    campaign.target_impression_share.location,
    campaign.target_impression_share.location_fraction_micros,
    campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status IN ('ENABLED', 'PAUSED')
  ORDER BY campaign.name
`)
for (const c of camps) {
  const camp = c.campaign
  if (!camp) continue
  const status = camp.status === 2 ? 'ENABLED' : camp.status === 3 ? 'PAUSED ' : `STATUS_${camp.status}`
  const budget = (Number(c.campaign_budget?.amount_micros || 0) / 1e6).toFixed(0)
  const bs = camp.bidding_strategy_type
  const bsName = ({ 1: 'COMMISSION', 2: 'ENHANCED_CPC', 3: 'INVALID', 4: 'MANUAL_CPC', 5: 'MANUAL_CPM', 6: 'MANUAL_CPV', 7: 'MAX_CONVERSIONS', 8: 'MAX_CONVERSION_VALUE', 9: 'TARGET_CPA', 10: 'TARGET_CPM', 12: 'TARGET_ROAS', 13: 'TARGET_SPEND', 15: 'PERCENT_CPC', 16: 'TARGET_IMPRESSION_SHARE', 17: 'COMMISSION', 19: 'PAGE_ONE_PROMOTED', 20: 'TARGET_OUTRANK_SHARE' }[bs]) || `TYPE_${bs}`
  const tROAS = camp.maximize_conversion_value?.target_roas || camp.target_roas?.target_roas
  const tCPA = camp.target_cpa?.target_cpa_micros ? Number(camp.target_cpa.target_cpa_micros) / 1e6 : null
  console.log(`\n  [${status}] ${camp.name}`)
  console.log(`    Budget: $${budget}/d`)
  console.log(`    Bid Strategy: ${bsName}`)
  if (tROAS) console.log(`    Target ROAS: ${(tROAS * 100).toFixed(0)}%`)
  if (tCPA) console.log(`    Target CPA: $${tCPA.toFixed(2)}`)
}

// 3. Daily IS trend last 14 days (account-level)
console.log('\n\n--- DAILY IMPRESSION SHARE TREND (last 14d, all enabled) ---')
const isDaily = await customer.query(`
  SELECT segments.date, campaign.name,
    metrics.search_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share,
    metrics.impressions
  FROM campaign
  WHERE segments.date BETWEEN '${daysAgo(14)}' AND '${daysAgo(1)}'
    AND campaign.status = 'ENABLED'
`)
const byCampDay = new Map()
for (const r of isDaily) {
  const k = `${r.campaign?.name}|${r.segments?.date}`
  byCampDay.set(k, {
    name: r.campaign?.name,
    date: r.segments?.date,
    is: r.metrics?.search_impression_share,
    lostRank: r.metrics?.search_rank_lost_impression_share,
    lostBudget: r.metrics?.search_budget_lost_impression_share,
    imp: r.metrics?.impressions,
  })
}
const camp4 = ['GRI PMAX | All Products', 'GRI PMAX | Bundles', 'GRI PMAX | Cannon & Powder Reveals', 'GRI | Search | Cannons']
for (const cName of camp4) {
  console.log(`\n  ${cName}`)
  console.log(`  ${'DATE'.padEnd(12)} ${'IS'.padStart(5)}  ${'LostRank'.padStart(8)}  ${'LostBudget'.padStart(10)}  ${'Imps'.padStart(5)}`)
  const dates = []
  for (let i = 14; i >= 1; i--) dates.push(daysAgo(i))
  for (const d of dates) {
    const x = byCampDay.get(`${cName}|${d}`)
    if (!x) continue
    const dow = new Date(d).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Brisbane' })
    const pct = (v) => v != null ? (v * 100).toFixed(0) + '%' : '—'
    console.log(`  ${d} ${dow.padEnd(4)} ${pct(x.is).padStart(5)}  ${pct(x.lostRank).padStart(8)}  ${pct(x.lostBudget).padStart(10)}  ${String(x.imp || 0).padStart(5)}`)
  }
}

// 4. YoY seasonality check (same window last year)
console.log('\n\n--- YoY SEASONALITY CHECK (same 14d period last year) ---')
const thisYearStart = daysAgo(14)
const thisYearEnd = daysAgo(1)
const lastYearStart = '2025-04-15'
const lastYearEnd = '2025-04-28'

async function pullPeriod(start, end) {
  const rows = await customer.query(`
    SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  let s = 0, c = 0, i = 0, cv = 0, val = 0
  for (const r of rows) {
    s += Number(r.metrics?.cost_micros || 0) / 1e6
    c += Number(r.metrics?.clicks || 0)
    i += Number(r.metrics?.impressions || 0)
    cv += Number(r.metrics?.conversions || 0)
    val += Number(r.metrics?.conversions_value || 0)
  }
  return { s, c, i, cv, val }
}

try {
  const ty = await pullPeriod(thisYearStart, thisYearEnd)
  const ly = await pullPeriod(lastYearStart, lastYearEnd)
  console.log(`This year (${thisYearStart} → ${thisYearEnd}):`)
  console.log(`  Spend $${ty.s.toFixed(0)} · ${ty.i} imps · ${ty.c} clicks · ${ty.cv.toFixed(0)} conv · $${ty.val.toFixed(0)} value`)
  console.log(`Last year (${lastYearStart} → ${lastYearEnd}):`)
  console.log(`  Spend $${ly.s.toFixed(0)} · ${ly.i} imps · ${ly.c} clicks · ${ly.cv.toFixed(0)} conv · $${ly.val.toFixed(0)} value`)
  if (ly.cv > 0) console.log(`Δ Conversions: ${((ty.cv - ly.cv)/ly.cv*100).toFixed(0)}%`)
  if (ly.val > 0) console.log(`Δ Value: ${((ty.val - ly.val)/ly.val*100).toFixed(0)}%`)
} catch (e) {
  console.log('  ❌ YoY query failed:', e.message?.slice(0, 200))
}

process.exit(0)
