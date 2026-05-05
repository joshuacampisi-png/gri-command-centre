/**
 * Deep dive: Smoke Bombs, Mini Blasters, Mega Blasters
 * - Pull current Shopify state (titles, SEO titles, productType)
 * - Pull 60-day Google Ads performance
 * - Show pre vs post Apr 14 trajectory
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
if (!TOKEN) { console.error('SHOPIFY_ADMIN_ACCESS_TOKEN env var required'); process.exit(1) }

async function gql(query) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return await res.json()
}

const customer = getGadsCustomer()

console.log('\n=== CATEGORY DEEP DIVE: Smoke Bombs / Mini Blasters / Mega Blasters ===\n')

// ─── 1. Current Shopify state ─────────────────────────────────────────────
async function fetchByQuery(q, label) {
  console.log(`\n--- SHOPIFY: ${label} ---`)
  const data = await gql(`{
    products(first: 50, query: "${q}") {
      edges {
        node {
          id
          title
          handle
          productType
          status
          seo { title description }
          tags
        }
      }
    }
  }`)
  const edges = data.data?.products?.edges || []
  for (const { node: p } of edges) {
    if (p.status !== 'ACTIVE') continue
    console.log(`\n  ${p.title}`)
    console.log(`    Handle:      ${p.handle}`)
    console.log(`    productType: "${p.productType}"`)
    console.log(`    SEO title:   "${p.seo?.title || '(default = product title)'}"`)
  }
  return edges
}

await fetchByQuery('smoke bomb', 'Smoke Bombs')
await fetchByQuery('mini blaster OR mini extinguisher', 'Mini Blasters / Extinguishers')
await fetchByQuery('mega blaster OR mega extinguisher', 'Mega Blasters / Extinguishers')

// ─── 2. Google Ads Shopping product-level performance ─────────────────────
console.log('\n\n=== GOOGLE ADS — 60-DAY PERFORMANCE BY PRODUCT TITLE ===\n')

const fmt = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }

const start60 = daysAgo(60)
const apr14 = '2026-04-14'
const yest = daysAgo(1)

async function pullProducts(label, titleFilter) {
  console.log(`\n--- ${label} ---`)
  console.log('PRE-SURGERY (Mar 1 – Apr 13)        vs        POST-SURGERY (Apr 14 – yesterday)')

  const preRows = await customer.query(`
    SELECT segments.product_title,
      metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${start60}' AND '2026-04-13'
  `)
  const postRows = await customer.query(`
    SELECT segments.product_title,
      metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${apr14}' AND '${yest}'
  `)
  const sumByTitle = (rows) => {
    const m = new Map()
    for (const r of rows) {
      const t = (r.segments?.product_title || '').trim()
      if (!t) continue
      if (!t.toLowerCase().match(titleFilter)) continue
      const cur = m.get(t) || { imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
      cur.imp += Number(r.metrics?.impressions || 0)
      cur.clk += Number(r.metrics?.clicks || 0)
      cur.conv += Number(r.metrics?.conversions || 0)
      cur.val += Number(r.metrics?.conversions_value || 0)
      cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
      m.set(t, cur)
    }
    return m
  }
  const pre = sumByTitle(preRows)
  const post = sumByTitle(postRows)
  const allTitles = new Set([...pre.keys(), ...post.keys()])
  for (const t of allTitles) {
    const a = pre.get(t) || { imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
    const b = post.get(t) || { imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
    if (a.spend < 5 && b.spend < 5) continue
    // normalise to per-day spend (44 days pre, ~13 days post)
    const preDays = 44, postDays = 13
    const aImpDay = a.imp / preDays, bImpDay = b.imp / postDays
    const aSpendDay = a.spend / preDays, bSpendDay = b.spend / postDays
    const aRoas = a.spend > 0 ? (a.val/a.spend).toFixed(2) : '-'
    const bRoas = b.spend > 0 ? (b.val/b.spend).toFixed(2) : '-'
    const impChange = aImpDay > 0 ? (((bImpDay - aImpDay)/aImpDay)*100).toFixed(0) : 'n/a'
    console.log(`\n  ${t.substring(0, 70)}`)
    console.log(`    PRE  (44d): ${a.imp.toString().padStart(5)} imp (${aImpDay.toFixed(0)}/d) | $${a.spend.toFixed(0).padStart(4)} ($${aSpendDay.toFixed(2)}/d) | ${a.conv.toFixed(1).padStart(4)} conv | ${aRoas}x`)
    console.log(`    POST (13d): ${b.imp.toString().padStart(5)} imp (${bImpDay.toFixed(0)}/d) | $${b.spend.toFixed(0).padStart(4)} ($${bSpendDay.toFixed(2)}/d) | ${b.conv.toFixed(1).padStart(4)} conv | ${bRoas}x`)
    console.log(`    Δ impressions/day: ${impChange}%`)
  }
}

await pullProducts('SMOKE BOMBS', /smoke bomb/i)
await pullProducts('MINI BLASTER / MINI EXTINGUISHER', /(mini blaster|mini extinguisher)/i)
await pullProducts('MEGA BLASTER / MEGA EXTINGUISHER', /(mega blaster|mega extinguisher)/i)

process.exit(0)
