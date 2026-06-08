/**
 * Audit product descriptions against May 2026 Google Shopping update rules:
 *  - Top 3 sponsored Shopping results now show 200-char descriptions
 *  - Optimal format: KEYWORD + BRAND + KEY ATTRIBUTE + DIFFERENTIATOR
 *  - Aim for first 200 chars to contain primary search term + trust signal
 *
 * Audit pulls top 30 revenue products from last 90d and flags issues
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN

// 1. Pull top 30 products by spend in last 90 days from Shopping
console.log('\n=== TOP 30 SHOPPING PRODUCTS — last 90d ===\n')
const rows = await c.query(`
  SELECT segments.product_title, segments.product_item_id,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2026-02-28' AND '2026-05-28'
`)
const agg = new Map()
for (const r of rows) {
  const t = r.segments?.product_title || '?'
  const id = r.segments?.product_item_id || ''
  if (!agg.has(t)) agg.set(t,{id,imp:0,clk:0,spend:0,conv:0,val:0})
  const x = agg.get(t)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
const ranked = [...agg.entries()].sort((a,b)=>b[1].spend-a[1].spend).slice(0,30)

// 2. For each, fetch the Shopify product and audit description
console.log('Fetching Shopify product descriptions...\n')

async function findProductByItemId(itemId) {
  // Shopping item_id usually = variant ID prefixed with "shopify_AU_PRODUCTID_VARIANTID"
  // Or just variant ID. Try variants endpoint first.
  if (!itemId) return null
  // Most reliable: search products by title
  return null // we'll fall back to title search
}

async function findProductByTitle(title) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/products.json?title=${encodeURIComponent(title)}&limit=5&fields=id,title,handle,body_html,seo,product_type,vendor,tags`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  }).then(r=>r.json())
  return r.products?.find(p => p.title === title) || r.products?.[0] || null
}

// Audit rules
const REQUIRED_KEYWORDS = ['gender reveal', 'genderrevealideas', 'australia', 'aussie', 'gri']
const TRUST_PHRASES = ['1,360', '1360', '4.85', 'rated', 'review', 'same day', 'next day', 'free shipping', 'gold coast', 'australian', 'eco', 'safe', 'mum', '70,000', '70000']
const FLUFF_PATTERNS = [/^the perfect/i, /^introducing/i, /^our /i, /^this is/i, /^welcome/i]

console.log('Rank | Spend | ROAS | Title | First 200 chars audit')
console.log('-'.repeat(130))

const auditResults = []
let idx = 0
for (const [title, x] of ranked) {
  idx++
  const product = await findProductByTitle(title)
  if (!product) {
    console.log(`#${idx} $${x.spend.toFixed(0)} | ⚠ Shopify product NOT FOUND for "${title.slice(0,60)}"`)
    auditResults.push({rank:idx, title, spend:x.spend, roas:x.spend>0?x.val/x.spend:0, issue:'PRODUCT NOT FOUND IN SHOPIFY'})
    continue
  }
  const body = (product.body_html||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()
  const first200 = body.slice(0,200)
  const lower200 = first200.toLowerCase()
  const issues = []
  if (!body) issues.push('NO_DESCRIPTION')
  if (body.length < 200) issues.push(`SHORT_DESC(${body.length}c)`)
  if (!REQUIRED_KEYWORDS.some(k => lower200.includes(k))) issues.push('NO_PRIMARY_KEYWORD_IN_200c')
  if (!TRUST_PHRASES.some(t => lower200.includes(t))) issues.push('NO_TRUST_SIGNAL_IN_200c')
  if (FLUFF_PATTERNS.some(p => p.test(first200))) issues.push('STARTS_WITH_FLUFF')
  if (first200.toUpperCase() === first200 && first200.length > 50) issues.push('ALL_CAPS')
  if (lower200.includes(' click here') || lower200.includes(' buy now')) issues.push('CTA_IN_DESC')
  const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  const verdict = issues.length === 0 ? '✓ OK' : `⚠ ${issues.join(',')}`
  console.log(`#${String(idx).padStart(2)} $${x.spend.toFixed(0).padStart(4)} | ${roas.padStart(5)} | ${title.slice(0,55).padEnd(55)} | ${verdict}`)
  console.log(`     200c preview: "${first200.slice(0,150)}${first200.length>150?'...':''}"`)
  auditResults.push({rank:idx, title, handle:product.handle, productId:product.id, spend:x.spend, roas:x.spend>0?x.val/x.spend:0, issues, first200, descLength:body.length})
}

// Summary
console.log('\n\n=== SUMMARY OF ISSUES ===\n')
const issueCount = {}
for (const r of auditResults) for (const i of (r.issues||[])) issueCount[i] = (issueCount[i]||0)+1
for (const [issue, count] of Object.entries(issueCount).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${count}× ${issue}`)
}

const needsRewrite = auditResults.filter(r => r.issues && r.issues.length > 0)
console.log(`\n${needsRewrite.length} of ${auditResults.length} top-spend products need description rewrites.`)

// Save full audit JSON
import { writeFileSync, mkdirSync } from 'fs'
mkdirSync('data/snapshots/desc-audit', { recursive: true })
writeFileSync('data/snapshots/desc-audit/audit.json', JSON.stringify(auditResults, null, 2))
console.log('Full audit saved: data/snapshots/desc-audit/audit.json')

process.exit(0)
