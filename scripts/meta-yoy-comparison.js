/**
 * Meta Ads YoY — Jan-May 2025 vs Jan-May 2026
 * Then combine with Google YTD to validate the +15% blended claim
 */
import 'dotenv/config'
import { metaToken } from '../server/lib/meta-api.js'

const TOKEN = metaToken()
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528'
const BASE = 'https://graph.facebook.com/v20.0'

async function getMetaInsights(since, until) {
  const fields = 'spend,impressions,clicks,actions,action_values,purchase_roas'
  const url = new URL(`${BASE}/${AD_ACCOUNT}/insights`)
  url.searchParams.set('access_token', TOKEN)
  url.searchParams.set('fields', fields)
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('level', 'account')
  url.searchParams.set('time_increment', 'monthly')
  url.searchParams.set('limit', '500')

  const all = []
  let next = url.toString()
  while (next) {
    const r = await fetch(next).then(r => r.json())
    if (r.error) { console.error('Meta error:', r.error); return null }
    if (r.data) all.push(...r.data)
    next = r.paging?.next || null
    if (next) await new Promise(rs => setTimeout(rs, 800))
  }
  return all
}

function sumPurchases(actions) {
  if (!Array.isArray(actions)) return 0
  const purchase = actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase')
  return Number(purchase?.value || 0)
}
function sumPurchaseValue(action_values) {
  if (!Array.isArray(action_values)) return 0
  const purchase = action_values.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase')
  return Number(purchase?.value || 0)
}

console.log('\n=== META ADS YoY — Jan-May 2025 vs Jan-May 2026 ===\n')
console.log('Pulling Meta insights...\n')

const data25 = await getMetaInsights('2025-01-01', '2025-05-31')
const data26 = await getMetaInsights('2026-01-01', '2026-05-31')

if (!data25 || !data26) {
  console.error('Failed to pull Meta data')
  process.exit(1)
}

console.log('Monthly Meta breakdown:\n')
console.log('Month   | Spend     | Purchases | Rev        | ROAS  | CPC      | CTR')
console.log('-'.repeat(85))

const agg = rows => {
  const out = { spend:0, impressions:0, clicks:0, purchases:0, revenue:0 }
  for (const r of rows) {
    out.spend += Number(r.spend || 0)
    out.impressions += Number(r.impressions || 0)
    out.clicks += Number(r.clicks || 0)
    out.purchases += sumPurchases(r.actions)
    out.revenue += sumPurchaseValue(r.action_values)
  }
  return out
}

// Show monthly
for (const r of [...data25, ...data26].sort((a,b) => (a.date_start||'').localeCompare(b.date_start||''))) {
  const month = (r.date_start || '').slice(0,7)
  const spend = Number(r.spend || 0)
  const purchases = sumPurchases(r.actions)
  const revenue = sumPurchaseValue(r.action_values)
  const roas = spend > 0 ? (revenue / spend).toFixed(2) + 'x' : '—'
  const clicks = Number(r.clicks || 0)
  const imp = Number(r.impressions || 0)
  const cpc = clicks > 0 ? '$' + (spend/clicks).toFixed(2) : '—'
  const ctr = imp > 0 ? (clicks/imp*100).toFixed(2) + '%' : '—'
  console.log(`${month} | $${spend.toFixed(0).padStart(7)} | ${purchases.toFixed(0).padStart(9)} | $${revenue.toFixed(0).padStart(9)} | ${roas.padStart(5)} | ${cpc.padStart(8)} | ${ctr.padStart(6)}`)
}

const t25 = agg(data25)
const t26 = agg(data26)

const pct = (a, b) => b===0 ? '—' : (((a-b)/b*100) >= 0 ? '+' : '') + ((a-b)/b*100).toFixed(1) + '%'

console.log('\n\n━━━ META YTD HEAD-TO-HEAD ━━━\n')
console.log('Metric        | Jan-May 2025    | Jan-May 2026    | Δ')
console.log('-'.repeat(75))
console.log(`Spend         | $${t25.spend.toFixed(0).padEnd(14)} | $${t26.spend.toFixed(0).padEnd(14)} | ${pct(t26.spend, t25.spend)}`)
console.log(`Impressions   | ${t25.impressions.toLocaleString().padEnd(15)} | ${t26.impressions.toLocaleString().padEnd(15)} | ${pct(t26.impressions, t25.impressions)}`)
console.log(`Clicks        | ${t25.clicks.toLocaleString().padEnd(15)} | ${t26.clicks.toLocaleString().padEnd(15)} | ${pct(t26.clicks, t25.clicks)}`)
console.log(`Purchases     | ${t25.purchases.toFixed(0).padEnd(15)} | ${t26.purchases.toFixed(0).padEnd(15)} | ${pct(t26.purchases, t25.purchases)}`)
console.log(`Revenue       | $${t25.revenue.toFixed(0).padEnd(14)} | $${t26.revenue.toFixed(0).padEnd(14)} | ${pct(t26.revenue, t25.revenue)}`)
console.log(`ROAS          | ${t25.spend > 0 ? (t25.revenue/t25.spend).toFixed(2)+'x' : '—'}            | ${t26.spend > 0 ? (t26.revenue/t26.spend).toFixed(2)+'x' : '—'}            |`)
console.log(`AOV           | $${t25.purchases > 0 ? (t25.revenue/t25.purchases).toFixed(0) : 0}             | $${t26.purchases > 0 ? (t26.revenue/t26.purchases).toFixed(0) : 0}             | ${pct(t26.revenue/t26.purchases, t25.revenue/t25.purchases)}`)

// Combined with Google
const GOOGLE_25_REV = 123702
const GOOGLE_26_REV = 121801
const GOOGLE_25_SPEND = 57724
const GOOGLE_26_SPEND = 39347

console.log('\n\n━━━ BLENDED META + GOOGLE — Jan-May ━━━\n')
console.log('Channel       | 2025 Spend  | 2025 Rev    | 2026 Spend  | 2026 Rev    | Rev Δ')
console.log('-'.repeat(95))
console.log(`Google Ads    | $${GOOGLE_25_SPEND.toFixed(0).padStart(7)}    | $${GOOGLE_25_REV.toFixed(0).padStart(7)}    | $${GOOGLE_26_SPEND.toFixed(0).padStart(7)}    | $${GOOGLE_26_REV.toFixed(0).padStart(7)}    | ${pct(GOOGLE_26_REV, GOOGLE_25_REV)}`)
console.log(`Meta Ads      | $${t25.spend.toFixed(0).padStart(7)}    | $${t25.revenue.toFixed(0).padStart(7)}    | $${t26.spend.toFixed(0).padStart(7)}    | $${t26.revenue.toFixed(0).padStart(7)}    | ${pct(t26.revenue, t25.revenue)}`)
const tot25 = GOOGLE_25_REV + t25.revenue
const tot26 = GOOGLE_26_REV + t26.revenue
const totSpend25 = GOOGLE_25_SPEND + t25.spend
const totSpend26 = GOOGLE_26_SPEND + t26.spend
console.log('-'.repeat(95))
console.log(`BLENDED       | $${totSpend25.toFixed(0).padStart(7)}    | $${tot25.toFixed(0).padStart(7)}    | $${totSpend26.toFixed(0).padStart(7)}    | $${tot26.toFixed(0).padStart(7)}    | ${pct(tot26, tot25)}`)
console.log(`Blended ROAS  | ${(tot25/totSpend25).toFixed(2)}x        |             | ${(tot26/totSpend26).toFixed(2)}x        |             | `)

console.log('\n\n━━━ JOSH\'S +15% CLAIM ━━━\n')
const claimed = 15
const actual = ((tot26 - tot25) / tot25 * 100)
console.log(`Claimed YoY:    +${claimed}%`)
console.log(`Actual YoY:     ${actual >= 0 ? '+' : ''}${actual.toFixed(1)}%`)
console.log(`Match:          ${Math.abs(actual - claimed) < 5 ? '✅ confirmed' : '⚠ off by ' + (actual - claimed).toFixed(1) + 'pp'}`)
process.exit(0)
