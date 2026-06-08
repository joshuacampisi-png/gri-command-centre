/**
 * Pull Shopify sessions by traffic source, last 30 days
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function sq(query) {
  const r = await fetch(URL, {method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query:`{ shopifyqlQuery(query: """${query}""") { parseErrors tableData { columns { name dataType } rows } } }`})})
  const j = await r.json()
  const t = j.data?.shopifyqlQuery
  if (j.errors) console.log('GRAPHQL ERR', JSON.stringify(j.errors))
  if (t?.parseErrors?.length) console.log('SQ PARSE ERR', JSON.stringify(t.parseErrors))
  return t?.tableData
}

console.log(`\n=== SHOPIFY SESSIONS — Last 30 Days ===\n`)

// 1. Daily sessions
const daily = await sq(`FROM sessions SHOW total_sessions GROUP BY day SINCE -30d UNTIL today ORDER BY day ASC`)
if (daily) {
  console.log(`--- DAILY SESSIONS ---`)
  let total=0, days=0
  for (const row of daily.rowData) {
    const s = Number(row[1]||0); total+=s; days++
    const bar = '█'.repeat(Math.min(Math.round(s/40), 30))
    console.log(`  ${row[0]} | ${String(s).padStart(5)} ${bar}`)
  }
  console.log(`  TOTAL: ${total} over ${days}d = avg ${(total/days).toFixed(0)}/day`)
}

// 2. Sessions by source
const bySrc = await sq(`FROM sessions SHOW total_sessions GROUP BY referrer_source SINCE -30d UNTIL today ORDER BY total_sessions DESC`)
if (bySrc) {
  console.log(`\n--- SESSIONS BY SOURCE ---`)
  let tot=0
  for (const row of bySrc.rowData) tot += Number(row[1]||0)
  for (const row of bySrc.rowData) {
    const s = Number(row[1]||0)
    const pct = tot>0?((s/tot)*100).toFixed(1):0
    const bar = '█'.repeat(Math.min(Math.round(s/200), 30))
    console.log(`  ${(row[0]||'unknown').padEnd(30)} ${String(s).padStart(6)} (${pct}%) ${bar}`)
  }
  console.log(`  TOTAL: ${tot}`)
}

// 3. By referrer name
const byRef = await sq(`FROM sessions SHOW total_sessions GROUP BY referrer_name SINCE -30d UNTIL today ORDER BY total_sessions DESC`)
if (byRef) {
  console.log(`\n--- TOP REFERRERS (top 20) ---`)
  let i=0
  for (const row of byRef.rowData) {
    if (i++>=20) break
    const s = Number(row[1]||0)
    const bar = '█'.repeat(Math.min(Math.round(s/100), 30))
    console.log(`  ${(row[0]||'(direct)').padEnd(40)} ${String(s).padStart(6)} ${bar}`)
  }
}

// 4. Sessions + CVR + sales by source
const conv = await sq(`FROM sessions SHOW total_sessions, conversion_rate, sales GROUP BY referrer_source SINCE -30d UNTIL today ORDER BY total_sessions DESC`)
if (conv) {
  console.log(`\n--- CONVERSION + SALES BY SOURCE ---`)
  console.log(`  Source                         | Sessions | CVR    | Sales`)
  for (const row of conv.rowData) {
    const src = (row[0]||'unknown').padEnd(30)
    const sess = String(row[1]||0).padStart(6)
    const cvr = ((Number(row[2]||0)*100).toFixed(2)+'%').padStart(7)
    const sales = '$'+Number(row[3]||0).toFixed(0).padStart(7)
    console.log(`  ${src} | ${sess} | ${cvr} | ${sales}`)
  }
}

// 5. Top landing pages
const landing = await sq(`FROM sessions SHOW total_sessions GROUP BY landing_page_path SINCE -30d UNTIL today ORDER BY total_sessions DESC`)
if (landing) {
  console.log(`\n--- TOP LANDING PAGES (top 15) ---`)
  let i=0
  for (const row of landing.rowData) {
    if (i++>=15) break
    const s = Number(row[1]||0)
    console.log(`  ${(row[0]||'(unknown)').slice(0,55).padEnd(55)} ${String(s).padStart(6)}`)
  }
}

process.exit(0)
