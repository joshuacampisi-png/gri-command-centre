/**
 * Full PageSpeed audit on key pages
 * Uses Google's PageSpeed Insights API (no key needed at low volume)
 * Focuses on:
 *  - Mobile + Desktop Core Web Vitals
 *  - LCP, INP, CLS, FCP, TTFB
 *  - Compares to May 14 SEO ship victims (collection pages)
 *  - Compares to top-spending PDPs
 */

const PAGES = [
  // Homepage
  { url: 'https://genderrevealideas.com.au/', label: 'Homepage' },
  // Post-May-14 ship collection pages (suspect)
  { url: 'https://genderrevealideas.com.au/collections/gender-reveal-ideas-melbourne', label: 'Melbourne city (POST-MAY-14)' },
  { url: 'https://genderrevealideas.com.au/collections/gender-reveal-ideas-sydney', label: 'Sydney city (POST-MAY-14)' },
  { url: 'https://genderrevealideas.com.au/collections/gender-reveal-ideas-brisbane', label: 'Brisbane city (POST-MAY-14)' },
  // Top spending PDPs
  { url: 'https://genderrevealideas.com.au/products/gender-reveal-smoke-bomb-australia', label: 'Smoke Bomb PDP (top spender)' },
  { url: 'https://genderrevealideas.com.au/products/gender-reveal-extinguisher-australia', label: 'Extinguisher PDP (top spender)' },
  { url: 'https://genderrevealideas.com.au/products/gender-reveal-cannons', label: 'Cannons PDP' },
  // Generic collection
  { url: 'https://genderrevealideas.com.au/collections/all', label: 'All Products collection' },
]

async function psi(url, strategy = 'mobile') {
  // Free public endpoint, throttled but works
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=seo`
  try {
    const r = await fetch(apiUrl)
    const j = await r.json()
    if (j.error) return { error: j.error.message }
    const lh = j.lighthouseResult
    const audits = lh?.audits || {}
    const cat = lh?.categories || {}
    const crux = j.loadingExperience?.metrics || {}
    return {
      perf:     Math.round((cat.performance?.score||0)*100),
      seo:      Math.round((cat.seo?.score||0)*100),
      a11y:     Math.round((cat.accessibility?.score||0)*100),
      LCP_ms:   audits['largest-contentful-paint']?.numericValue,
      LCP_disp: audits['largest-contentful-paint']?.displayValue,
      FCP_ms:   audits['first-contentful-paint']?.numericValue,
      CLS:      audits['cumulative-layout-shift']?.displayValue,
      TBT_ms:   audits['total-blocking-time']?.numericValue,
      SI_ms:    audits['speed-index']?.numericValue,
      TTFB_ms:  audits['server-response-time']?.numericValue,
      INP_crux: crux?.INTERACTION_TO_NEXT_PAINT?.percentile,
      LCP_crux: crux?.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
      CLS_crux: crux?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
    }
  } catch(e) { return { error: e.message } }
}

console.log(`\n=== PAGESPEED AUDIT — ${new Date().toISOString().slice(0,16)} ===\n`)
console.log('Mobile scores first (where conversion rate hurts most), then desktop\n')

const out = []
for (const P of PAGES) {
  console.log(`\n━━━ ${P.label} ━━━`)
  console.log(`  ${P.url}`)
  for (const strategy of ['mobile','desktop']) {
    const r = await psi(P.url, strategy)
    if (r.error) {
      console.log(`  ${strategy.padEnd(7)}  ERROR: ${r.error?.slice(0,100)}`)
      continue
    }
    const grade = score => score >= 90 ? '🟢' : (score >= 50 ? '🟡' : '🔴')
    console.log(`  ${strategy.padEnd(7)}  Perf:${grade(r.perf)}${r.perf}  SEO:${grade(r.seo)}${r.seo}  A11y:${grade(r.a11y)}${r.a11y}`)
    console.log(`           LCP:${r.LCP_disp||'?'}  FCP:${r.FCP_ms?Math.round(r.FCP_ms)+'ms':'?'}  CLS:${r.CLS||'?'}  TBT:${r.TBT_ms?Math.round(r.TBT_ms)+'ms':'?'}  TTFB:${r.TTFB_ms?Math.round(r.TTFB_ms)+'ms':'?'}`)
    if (r.LCP_crux) console.log(`           CrUX (real users 28d): LCP p75 ${r.LCP_crux}ms, INP p75 ${r.INP_crux||'?'}ms, CLS p75 ${r.CLS_crux||'?'}`)
    out.push({ ...P, strategy, ...r })
  }
  await new Promise(r => setTimeout(r, 1500))
}

console.log('\n\n=== SUMMARY — mobile only (where CVR hurts) ===\n')
console.log('Page                                       | Perf | LCP     | TBT    | CLS  | LCP CrUX')
console.log('-'.repeat(115))
for (const r of out.filter(x => x.strategy === 'mobile' && !x.error)) {
  console.log(`${r.label.padEnd(42)} | ${String(r.perf).padStart(4)} | ${(r.LCP_disp||'?').padEnd(7)} | ${(r.TBT_ms?Math.round(r.TBT_ms)+'ms':'?').padEnd(6)} | ${(r.CLS||'?').padEnd(4)} | ${r.LCP_crux||'?'}ms`)
}

console.log('\n=== RED FLAGS ===')
const redFlags = out.filter(x => x.strategy === 'mobile' && !x.error && (x.perf < 50 || (x.LCP_ms && x.LCP_ms > 4000) || (x.TBT_ms && x.TBT_ms > 600)))
if (!redFlags.length) console.log('  None — performance acceptable')
for (const r of redFlags) {
  console.log(`  🔴 ${r.label}`)
  if (r.perf < 50) console.log(`     Performance score ${r.perf}/100 (poor)`)
  if (r.LCP_ms > 4000) console.log(`     LCP ${Math.round(r.LCP_ms)}ms — fails Core Web Vital (>4s)`)
  if (r.TBT_ms > 600) console.log(`     TBT ${Math.round(r.TBT_ms)}ms — heavy JS blocking`)
}

import { writeFileSync, mkdirSync } from 'fs'
mkdirSync('data/snapshots/pagespeed', { recursive: true })
writeFileSync('data/snapshots/pagespeed/audit.json', JSON.stringify(out, null, 2))
console.log('\nFull audit saved: data/snapshots/pagespeed/audit.json')
process.exit(0)
