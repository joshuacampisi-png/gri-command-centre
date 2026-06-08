/**
 * Scan SERP Paid Shopping carousel for head-term gender reveal queries.
 * Identifies where Confettified has 3-of-3 Sponsored Shopping slots.
 */
import 'dotenv/config'

const D4S_USER = process.env.DATAFORSEO_USER || process.env.DFS_USER
const D4S_PASS = process.env.DATAFORSEO_PASS || process.env.DFS_PASS
const auth = 'Basic ' + Buffer.from(`${D4S_USER}:${D4S_PASS}`).toString('base64')

const QUERIES = [
  'gender reveal cannons',
  'gender reveal smoke bombs',
  'gender reveal cannon',
  'gender reveal powder cannon',
  'gender reveal smoke bomb',
  'gender reveal extinguisher',
  'gender reveal kit',
  'gender reveal bundle',
  'gender reveal party supplies',
  'gender reveal australia',
  'gender reveal ideas',
  'gender reveal bomb',
  'gender reveal blaster',
  'gender reveal powder',
  'powder gender reveal',
  'confetti cannon gender reveal',
  'gender reveal balloons',
  'gender reveal sports',
  'gender reveal box',
  'gender reveal sparkler',
]

console.log(`\n=== CONFETTIFIED SHOPPING DOMINATION SCAN ===\n`)
console.log(`Scanning ${QUERIES.length} head-term queries for paid Sponsored Shopping carousel\n`)

const results = []

for (let i = 0; i < QUERIES.length; i++) {
  const q = QUERIES[i]
  process.stdout.write(`[${i+1}/${QUERIES.length}] ${q.padEnd(40)} `)

  // DataForSEO live SERP — Google AU
  const body = [{
    keyword: q,
    location_code: 2036, // Australia
    language_code: 'en',
    device: 'desktop',
    se_domain: 'google.com.au',
    depth: 30,
    include_paid_results: true,
  }]

  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await r.json()
    const items = json?.tasks?.[0]?.result?.[0]?.items || []

    // Find paid Shopping carousel items
    const sponsoredShoppingSlots = []
    for (const item of items) {
      // Shopping ad type
      if (item.type === 'shopping' || item.type === 'paid' || item.type === 'product_consideration' || item.type === 'product_information') {
        sponsoredShoppingSlots.push({
          type: item.type,
          domain: item.domain || item.shop_domain,
          title: item.title,
          price: item.price?.current || item.price,
        })
      }
      // Some types use sub-items
      if (item.items && Array.isArray(item.items)) {
        for (const sub of item.items) {
          if (sub.type === 'product' || sub.type === 'shopping_ad' || sub.shop_name) {
            sponsoredShoppingSlots.push({
              type: sub.type || item.type,
              domain: sub.shop_domain || sub.domain || sub.shop_name,
              title: sub.title,
              price: sub.price?.current || sub.price,
            })
          }
        }
      }
    }

    // Tally domains in top 3 sponsored
    const top3 = sponsoredShoppingSlots.slice(0, 3)
    const confettifiedCount = top3.filter(s => /confettified/i.test(s.domain||'')).length
    const griCount = top3.filter(s => /genderreveal/i.test(s.domain||'')).length
    const otherDomains = top3.filter(s => !/confettified|genderreveal/i.test(s.domain||'')).map(s=>s.domain)

    console.log(`Sponsored: ${top3.length} | Confettified: ${confettifiedCount}/3 | GRI: ${griCount}/3 | other: ${otherDomains.length}`)

    results.push({
      query: q,
      totalSponsored: sponsoredShoppingSlots.length,
      top3Sponsored: top3.length,
      confettifiedCount,
      griCount,
      otherDomains,
      slots: top3,
    })

    // small delay to avoid rate-limit
    await new Promise(r=>setTimeout(r, 600))
  } catch (e) {
    console.log(`ERR: ${e.message}`)
    results.push({ query: q, error: e.message })
  }
}

console.log(`\n=== ANALYSIS ===\n`)

const confettiDom = results.filter(r => r.confettifiedCount === 3)
const confettiPartial = results.filter(r => r.confettifiedCount > 0 && r.confettifiedCount < 3)
const griPresent = results.filter(r => r.griCount > 0)
const opportunities = results.filter(r => r.confettifiedCount >= 2 && r.griCount === 0)

console.log(`Confettified DOMINATES (3-of-3): ${confettiDom.length} queries`)
for (const r of confettiDom) console.log(`  • "${r.query}"`)

console.log(`\nConfettified PARTIAL (1-2 of 3): ${confettiPartial.length} queries`)
for (const r of confettiPartial) console.log(`  • "${r.query}" — Confettified ${r.confettifiedCount}/3, GRI ${r.griCount}/3, others: ${r.otherDomains.join(', ')||'none'}`)

console.log(`\nGRI HAS PRESENCE (1+ of 3): ${griPresent.length} queries`)
for (const r of griPresent) console.log(`  • "${r.query}" — GRI ${r.griCount}/3, Confettified ${r.confettifiedCount}/3`)

console.log(`\n🎯 HIJACK TARGETS (Confettified ≥2, GRI absent): ${opportunities.length} queries`)
for (const r of opportunities) {
  console.log(`  • "${r.query}" — Confettified ${r.confettifiedCount}/3 (no GRI)`)
}

import { writeFileSync, mkdirSync } from 'fs'
mkdirSync('data/snapshots/confettified-shopping', { recursive: true })
writeFileSync('data/snapshots/confettified-shopping/scan.json', JSON.stringify(results, null, 2))
console.log(`\nFull results: data/snapshots/confettified-shopping/scan.json`)
process.exit(0)
