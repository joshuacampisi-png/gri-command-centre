/**
 * Search volume recap — paid + organic, last 14 days.
 * Where we stand vs pre-Apr-14 baseline.
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const SITE = 'sc-domain:genderrevealideas.com.au'
const oauth = new google.auth.OAuth2(process.env.GOOGLE_ADS_CLIENT_ID, process.env.GOOGLE_ADS_CLIENT_SECRET)
oauth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
const wm = google.webmasters({ version: 'v3', auth: oauth })
const customer = getGadsCustomer()

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

console.log(`\n========== SEARCH VOLUME RECAP — ${daysAgo(0)} ==========\n`)

// ── ORGANIC: last 14 days daily impressions + clicks ──────────────────────
console.log('--- ORGANIC SEARCH (Search Console, last 14d) ---')
const gscDaily = await wm.searchanalytics.query({
  siteUrl: SITE,
  requestBody: {
    startDate: daysAgo(14),
    endDate: daysAgo(1),
    dimensions: ['date'],
    rowLimit: 30,
  },
})
console.log(`${'DATE'.padEnd(12)} ${'IMPS'.padStart(6)}  ${'CLICKS'.padStart(6)}  ${'CTR'.padStart(6)}  ${'POS'.padStart(5)}`)
for (const r of (gscDaily.data?.rows || []).sort((a, b) => a.keys[0].localeCompare(b.keys[0]))) {
  const dow = new Date(r.keys[0]).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Brisbane' })
  console.log(`${r.keys[0]} ${dow.padEnd(4)} ${String(r.impressions).padStart(6)}  ${String(r.clicks).padStart(6)}  ${(r.ctr * 100).toFixed(1).padStart(5)}%  ${r.position.toFixed(1).padStart(5)}`)
}

// ── ORGANIC: top 15 queries last 7d
console.log('\n--- ORGANIC TOP 15 QUERIES (last 7d) ---')
const gscTop = await wm.searchanalytics.query({
  siteUrl: SITE,
  requestBody: {
    startDate: daysAgo(7),
    endDate: daysAgo(1),
    dimensions: ['query'],
    rowLimit: 15,
  },
})
console.log(`${'QUERY'.padEnd(40)} ${'IMPS'.padStart(6)}  ${'CLICKS'.padStart(6)}  ${'POS'.padStart(5)}`)
for (const r of gscTop.data?.rows || []) {
  console.log(`${(r.keys[0] || '').substring(0, 39).padEnd(40)} ${String(r.impressions).padStart(6)}  ${String(r.clicks).padStart(6)}  ${r.position.toFixed(1).padStart(5)}`)
}

// ── PAID: search term volume last 14 days vs prior 14
console.log('\n--- PAID SEARCH TERM VOLUME (impressions) ---')
const start14 = daysAgo(14)
const end1 = daysAgo(1)
const start28 = daysAgo(28)
const end15 = daysAgo(15)

async function pullPaidImps(start, end) {
  const rows = await customer.query(`
    SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  let imp = 0, clk = 0, conv = 0
  const byTerm = new Map()
  for (const r of rows) {
    imp += Number(r.metrics?.impressions || 0)
    clk += Number(r.metrics?.clicks || 0)
    conv += Number(r.metrics?.conversions || 0)
    const t = (r.search_term_view?.search_term || '').toLowerCase().trim()
    if (!t) continue
    const cur = byTerm.get(t) || { imp: 0, clk: 0, conv: 0 }
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    byTerm.set(t, cur)
  }
  return { totalImp: imp, totalClk: clk, totalConv: conv, byTerm }
}

const cur = await pullPaidImps(start14, end1)
const prior = await pullPaidImps(start28, end15)

console.log(`${'WINDOW'.padEnd(20)}  ${'IMPS'.padStart(6)}  ${'CLICKS'.padStart(6)}  ${'CONV'.padStart(5)}`)
console.log(`Last 14d (recovering)  ${String(cur.totalImp).padStart(6)}  ${String(cur.totalClk).padStart(6)}  ${cur.totalConv.toFixed(1).padStart(5)}`)
console.log(`Prior 14d (Apr 1-14)   ${String(prior.totalImp).padStart(6)}  ${String(prior.totalClk).padStart(6)}  ${prior.totalConv.toFixed(1).padStart(5)}`)
const impDelta = ((cur.totalImp - prior.totalImp) / prior.totalImp * 100).toFixed(0)
const clkDelta = ((cur.totalClk - prior.totalClk) / prior.totalClk * 100).toFixed(0)
console.log(`Δ                       ${impDelta}%       ${clkDelta}%`)

// Top paid terms by impressions last 7d
console.log('\n--- TOP 15 PAID TERMS by impressions (last 7d) ---')
const last7 = await customer.query(`
  SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
  FROM search_term_view
  WHERE segments.date BETWEEN '${daysAgo(7)}' AND '${end1}'
  ORDER BY metrics.impressions DESC
  LIMIT 15
`)
console.log(`${'QUERY'.padEnd(40)} ${'IMPS'.padStart(5)}  ${'CLK'.padStart(4)}  ${'CONV'.padStart(4)}`)
for (const r of last7) {
  const t = (r.search_term_view?.search_term || '').substring(0, 39)
  console.log(`${t.padEnd(40)} ${String(r.metrics?.impressions || 0).padStart(5)}  ${String(r.metrics?.clicks || 0).padStart(4)}  ${Number(r.metrics?.conversions || 0).toFixed(1).padStart(4)}`)
}

// Daily paid impressions to see recovery
console.log('\n--- DAILY PAID IMPRESSIONS (last 14d) ---')
const dailyPaid = await customer.query(`
  SELECT segments.date, metrics.impressions, metrics.clicks, metrics.conversions
  FROM search_term_view
  WHERE segments.date BETWEEN '${daysAgo(14)}' AND '${end1}'
`)
const byDay = new Map()
for (const r of dailyPaid) {
  const d = r.segments?.date
  if (!d) continue
  const cur = byDay.get(d) || { imp: 0, clk: 0, conv: 0 }
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  byDay.set(d, cur)
}
console.log(`${'DATE'.padEnd(12)} ${'IMPS'.padStart(5)}  ${'CLK'.padStart(4)}  ${'CONV'.padStart(4)}`)
for (const [d, m] of [...byDay.entries()].sort()) {
  const dow = new Date(d).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Brisbane' })
  console.log(`${d} ${dow.padEnd(4)} ${String(m.imp).padStart(5)}  ${String(m.clk).padStart(4)}  ${m.conv.toFixed(1).padStart(4)}`)
}

process.exit(0)
