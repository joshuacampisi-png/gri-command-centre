/**
 * 48-hour post-surgery report
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

console.log('=== 48-HOUR POST-SURGERY REPORT ===\n')

// Campaign performance per day
for (const date of ['2026-04-12', '2026-04-13', '2026-04-14']) {
  const label = date === '2026-04-12' ? '(PRE-SURGERY)' : date === '2026-04-13' ? '(SURGERY DAY)' : '(YESTERDAY)'
  console.log(`--- ${date} ${label} ---`)
  const rows = await customer.query(`
    SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date = '${date}'
  `)

  let daySpend = 0, dayConv = 0, dayValue = 0, dayClicks = 0
  for (const r of rows) {
    const spend = Number(r.metrics?.cost_micros || 0) / 1e6
    const conv = Number(r.metrics?.conversions || 0)
    const value = Number(r.metrics?.conversions_value || 0)
    const clicks = Number(r.metrics?.clicks || 0)
    daySpend += spend; dayConv += conv; dayValue += value; dayClicks += clicks

    if (spend > 0 || clicks > 0) {
      const roas = spend > 0 ? (value / spend).toFixed(2) : '-'
      console.log(`  ${r.campaign?.name} | $${spend.toFixed(2)} | ${clicks} clicks | ${conv.toFixed(1)} conv | $${value.toFixed(2)} | ${roas}x`)
    }
  }
  const dayRoas = daySpend > 0 ? (dayValue / daySpend).toFixed(2) : '-'
  console.log(`  TOTAL | $${daySpend.toFixed(2)} | ${dayClicks} clicks | ${dayConv.toFixed(1)} conv | $${dayValue.toFixed(2)} | ${dayRoas}x ROAS\n`)
}

// Conversions by campaign Apr 13-14 combined
console.log('--- CONVERSIONS BY CAMPAIGN (48hr combined) ---')
const convRows = await customer.query(`
  SELECT campaign.name, metrics.conversions, metrics.conversions_value, metrics.cost_micros
  FROM campaign
  WHERE campaign.status = 'ENABLED'
    AND segments.date BETWEEN '2026-04-13' AND '2026-04-14'
`)
const byCamp = new Map()
for (const r of convRows) {
  const name = r.campaign?.name || ''
  if (!byCamp.has(name)) byCamp.set(name, { conv: 0, value: 0, spend: 0 })
  const c = byCamp.get(name)
  c.conv += Number(r.metrics?.conversions || 0)
  c.value += Number(r.metrics?.conversions_value || 0)
  c.spend += Number(r.metrics?.cost_micros || 0) / 1e6
}
for (const [name, c] of [...byCamp.entries()].sort((a, b) => b[1].value - a[1].value)) {
  const roas = c.spend > 0 ? (c.value / c.spend).toFixed(2) : '-'
  console.log(`  ${name} | $${c.spend.toFixed(2)} spend | ${c.conv.toFixed(1)} conv | $${c.value.toFixed(2)} rev | ${roas}x ROAS`)
}

// Search Cannons keywords post-surgery
console.log('\n--- SEARCH CANNONS KEYWORDS (48hr post-surgery) ---')
const kws = await customer.query(`
  SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status,
         metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.impressions
  FROM keyword_view
  WHERE campaign.name LIKE '%Search%Cannon%'
    AND segments.date BETWEEN '2026-04-13' AND '2026-04-14'
    AND metrics.impressions > 0
`)
const kwMap = new Map()
for (const r of kws) {
  const text = r.ad_group_criterion?.keyword?.text || ''
  const mt = r.ad_group_criterion?.keyword?.match_type
  const status = r.ad_group_criterion?.status
  const key = text + '_' + mt
  if (!kwMap.has(key)) kwMap.set(key, { text, mt, status, spend: 0, clicks: 0, conv: 0, value: 0, impr: 0 })
  const k = kwMap.get(key)
  k.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  k.clicks += Number(r.metrics?.clicks || 0)
  k.conv += Number(r.metrics?.conversions || 0)
  k.value += Number(r.metrics?.conversions_value || 0)
  k.impr += Number(r.metrics?.impressions || 0)
}
for (const [, k] of [...kwMap.entries()].sort((a, b) => b[1].spend - a[1].spend)) {
  console.log(`  "${k.text}" [match=${k.mt}] (${k.status === 2 ? 'ENABLED' : 'PAUSED'}) | $${k.spend.toFixed(2)} | ${k.clicks} clicks | ${k.conv.toFixed(1)} conv | $${k.value.toFixed(2)} rev | ${k.impr} impr`)
}

// TNT Hire progress
console.log('\n--- TNT HIRE LEARNING PHASE ---')
for (const date of ['2026-04-13', '2026-04-14']) {
  const tnt = await customer.query(`
    SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
    FROM campaign WHERE campaign.id = 22941692140 AND segments.date = '${date}'
  `)
  const t = tnt[0]?.metrics || {}
  console.log(`  ${date}: ${t.impressions || 0} impr | ${t.clicks || 0} clicks | $${(Number(t.cost_micros||0)/1e6).toFixed(2)} spend | ${Number(t.conversions||0).toFixed(1)} conv | $${Number(t.conversions_value||0).toFixed(2)} rev`)
}

// Impression share
console.log('\n--- IMPRESSION SHARE (post-surgery avg) ---')
for (const [campId, campName] of [['21094179575', 'Search Cannons'], ['22841772135', 'PMAX Bundles']]) {
  const rows = await customer.query(`
    SELECT metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
    FROM campaign WHERE campaign.id = ${campId} AND segments.date BETWEEN '2026-04-13' AND '2026-04-14'
  `)
  let is = 0, bl = 0, rl = 0, count = 0
  for (const r of rows) {
    const v = Number(r.metrics?.search_impression_share || 0)
    if (v > 0) { is += v; bl += Number(r.metrics?.search_budget_lost_impression_share || 0); rl += Number(r.metrics?.search_rank_lost_impression_share || 0); count++ }
  }
  if (count > 0) {
    console.log(`  ${campName}: IS ${((is/count)*100).toFixed(1)}% | Lost to budget: ${((bl/count)*100).toFixed(1)}% | Lost to rank: ${((rl/count)*100).toFixed(1)}%`)
  }
}

// Shopify cross-reference
console.log('\n--- SHOPIFY ORDERS (Apr 13-14 AEST) ---')
const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
if (!TOKEN) { console.error('SHOPIFY_ADMIN_ACCESS_TOKEN env var required'); process.exit(1) }
const shopRes = await fetch(SHOPIFY_URL, {
  method: 'POST',
  headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ orders(first: 250, query: "created_at:>=2026-04-12T14:00:00Z", sortKey: CREATED_AT) { edges { node { name createdAt totalPriceSet { shopMoney { amount } } } } } }` })
})
const shopData = await shopRes.json()
const orders = shopData.data?.orders?.edges || []

const byDay = new Map()
for (const {node: o} of orders) {
  const utc = new Date(o.createdAt)
  const aest = new Date(utc.getTime() + 10 * 60 * 60 * 1000)
  const day = aest.toISOString().slice(0, 10)
  if (!byDay.has(day)) byDay.set(day, { count: 0, rev: 0 })
  const d = byDay.get(day)
  d.count++
  d.rev += parseFloat(o.totalPriceSet?.shopMoney?.amount || 0)
}
for (const [day, d] of [...byDay.entries()].sort()) {
  console.log(`  ${day} AEST: ${d.count} orders, $${d.rev.toFixed(2)}`)
}
