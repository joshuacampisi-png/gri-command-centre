/**
 * Pull organic Search Console data using the existing google-ads OAuth refresh token
 * (which was regenerated yesterday with webmasters.readonly scope).
 */
import 'dotenv/config'
import { google } from 'googleapis'

const SITE_URL = 'sc-domain:genderrevealideas.com.au'
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing OAuth env vars')
  process.exit(1)
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN })

const webmasters = google.webmasters({ version: 'v3', auth: oauth2Client })

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

console.log(`\n========== ORGANIC DOMINANCE (GSC, last 28d) ==========\n`)

// Try sc-domain first; fallback to https
async function tryQuery(siteUrl) {
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: daysAgo(28),
      endDate: daysAgo(1),
      dimensions: ['query'],
      rowLimit: 50,
    },
  })
  return res.data?.rows || []
}

let rows = []
let usedUrl = SITE_URL
try {
  rows = await tryQuery(SITE_URL)
} catch (e) {
  try {
    usedUrl = 'https://genderrevealideas.com.au/'
    rows = await tryQuery(usedUrl)
  } catch (e2) {
    console.error('Both site URLs failed.')
    console.error('  sc-domain:', e.message)
    console.error('  https:', e2.message)
    console.log('\nList of sites available to this OAuth token:')
    try {
      const sites = await webmasters.sites.list()
      for (const s of sites.data?.siteEntry || []) {
        console.log(`  - ${s.siteUrl} (${s.permissionLevel})`)
      }
    } catch (e3) {
      console.error('Could not list sites:', e3.message)
    }
    process.exit(1)
  }
}

console.log(`Site: ${usedUrl}\n`)
console.log(`--- TOP ORGANIC QUERIES (last 28 days) ---`)
console.log(`${'QUERY'.padEnd(45)}  ${'IMPR'.padStart(6)}  ${'CLICKS'.padStart(6)}  ${'CTR'.padStart(6)}  ${'POSITION'.padStart(8)}`)
console.log('-'.repeat(80))
for (const r of rows) {
  const q = (r.keys?.[0] || '').substring(0, 44)
  const imp = r.impressions || 0
  const clk = r.clicks || 0
  const ctr = ((r.ctr || 0) * 100).toFixed(1) + '%'
  const pos = (r.position || 0).toFixed(1)
  console.log(`${q.padEnd(45)}  ${String(imp).padStart(6)}  ${String(clk).padStart(6)}  ${ctr.padStart(6)}  ${pos.padStart(8)}`)
}

// Filter to gender-reveal terms only and rank by impressions
const gr = rows.filter(r => {
  const q = (r.keys?.[0] || '').toLowerCase()
  return q.includes('gender') || q.includes('reveal') || q.includes('cannon') || q.includes('blaster') || q.includes('smoke') || q.includes('powder') || q.includes('confetti')
})
const top10 = gr.filter(r => (r.position || 99) <= 10)
const pos1 = gr.filter(r => (r.position || 99) <= 1.5)
console.log(`\n--- DOMINATION SCORE ---`)
console.log(`Total gender-reveal queries we appear on: ${gr.length}`)
console.log(`Queries where we rank top 10: ${top10.length}`)
console.log(`Queries where we rank #1 (position <= 1.5): ${pos1.length}`)
console.log(`\nTop 10 by impressions where we rank #1:`)
const pos1Sorted = pos1.sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 10)
for (const r of pos1Sorted) {
  console.log(`  "${r.keys?.[0]}" — ${r.impressions} imp · pos ${(r.position || 0).toFixed(1)}`)
}

process.exit(0)
