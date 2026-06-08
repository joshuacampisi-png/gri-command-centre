/**
 * SEO Title Bulk Push Impact Check (6 days post-ship)
 *  - Verify the 49 updated titles are live on Shopify
 *  - Live SERP scrape for sample products to check ranking changes
 *  - Compare to baseline (rough — we don't have a pre-ship snapshot of every URL)
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN

// Pull the ship log
const log = JSON.parse(readFileSync('data/snapshots/seo-titles-curated/log.json','utf8'))
console.log(`\n=== SEO TITLE IMPACT CHECK ===\n`)
console.log(`Shipped: ${log.shippedAt}`)
console.log(`Total products updated: ${log.updates.length}\n`)

// 1. Verify a sample of titles still live (5 random)
console.log('━━━ 1. Verify live — sample of 5 titles ━━━\n')
const sample = log.updates.slice().sort(()=>Math.random()-0.5).slice(0,5)
for (const u of sample) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type':'application/json' },
    body: JSON.stringify({ query: `{ productByHandle(handle:"${u.handle}") { seo { title } titleTag: metafield(namespace:"global",key:"title_tag"){value} } }` }),
  }).then(r=>r.json())
  const p = r.data?.productByHandle
  const live = p?.seo?.title || p?.titleTag?.value || ''
  const expected = u.after?.seoTitle || ''
  const match = live === expected ? '✓' : '⚠'
  console.log(`  ${match} /${u.handle}`)
  console.log(`    live: "${live.slice(0,70)}"`)
  if (live !== expected) console.log(`    expected: "${expected.slice(0,70)}"`)
}

// 2. SERP rank check for the highest-impact ones
console.log(`\n━━━ 2. Live SERP rankings — high-volume keyword products ━━━\n`)
async function scrapeRank(kw, targetHandle = null) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:50}]),
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items?.filter(it => it.type === 'organic') || []
  const ours = items.find(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
  const targeted = targetHandle ? items.find(it => (it.url||'').includes(targetHandle)) : null
  return {
    overallRank: ours?.rank_absolute || null,
    overallURL: ours ? (ours.url||'').replace('https://genderrevealideas.com.au','').slice(0,50) : null,
    targetedRank: targeted?.rank_absolute || null,
  }
}

const KEY_CHECKS = [
  { kw: 'gender reveal smoke bombs', expectedHandle: 'gender-reveal-smoke-bombs' },
  { kw: 'gender reveal extinguisher', expectedHandle: 'gender-reveal-extinguisher-australia' },
  { kw: 'gender reveal golf ball', expectedHandle: 'gender-reveal-golf-balls' },
  { kw: 'gender reveal burnout powder', expectedHandle: 'gender-reveal-burnout-powder' },
  { kw: 'gender reveal sash', expectedHandle: 'gender-reveal-sash' },
  { kw: 'gender reveal foil curtain', expectedHandle: 'gender-reveal-foil-curtain' },
  { kw: 'gender reveal cake topper', expectedHandle: 'gender-reveal-burn-away-topper' },
  { kw: 'oh baby cake topper', expectedHandle: 'oh-baby-cake-topper' },
]

console.log('Keyword'.padEnd(38) + ' | YourRank | URL')
console.log('-'.repeat(95))
for (const k of KEY_CHECKS) {
  const result = await scrapeRank(k.kw, k.expectedHandle)
  console.log(`${k.kw.padEnd(38)} | ${result.overallRank ? '#'+result.overallRank : 'NOT IN TOP 50'} | ${result.overallURL || '—'}`)
  await new Promise(r=>setTimeout(r,400))
}

process.exit(0)
