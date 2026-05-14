/**
 * dip-analysis.js — one-off
 * Pull Shopify revenue for three windows so we can split macro vs internal:
 *   1) Apr 22 – May 5, 2026 (current dip window)
 *   2) Apr 8  – Apr 21, 2026 (prior 14d, comparable)
 *   3) Apr 22 – May 5, 2025 (year-on-year, same calendar window)
 * Plus: channel breakdown for window 1 (Meta vs Google vs Direct vs Organic vs Email).
 *
 * Uses Shopify Admin REST 2024-01 (same as shopify-sales.js helper).
 * AEST (UTC+10, no DST observed in QLD; rest of AU is on AEST in May too).
 */

import 'dotenv/config'

const STORE = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
if (!TOKEN) { console.error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN'); process.exit(1) }

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000

function aestToUtcISO(yyyy, mm, dd, hh, mi, ss) {
  // Treat input as AEST and convert to UTC for Shopify
  const aestEpoch = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss)
  return new Date(aestEpoch - AEST_OFFSET_MS).toISOString()
}

const WINDOWS = [
  { key: 'current_2026',  label: 'Apr 22 – May 5, 2026 (current 14d)',
    startISO: aestToUtcISO(2026, 4, 22, 0, 0, 0),  endISO: aestToUtcISO(2026, 5, 5, 23, 59, 59) },
  { key: 'prior_2026',    label: 'Apr 8  – Apr 21, 2026 (prior 14d)',
    startISO: aestToUtcISO(2026, 4, 8,  0, 0, 0),  endISO: aestToUtcISO(2026, 4, 21, 23, 59, 59) },
  { key: 'yoy_2025',      label: 'Apr 22 – May 5, 2025 (YoY same window)',
    startISO: aestToUtcISO(2025, 4, 22, 0, 0, 0),  endISO: aestToUtcISO(2025, 5, 5, 23, 59, 59) },
]

async function fetchOrders(startISO, endISO) {
  let all = []
  let url = `https://${STORE}/admin/api/2024-01/orders.json?status=any&created_at_min=${startISO}&created_at_max=${endISO}&limit=250`
  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    all = all.concat(data.orders || [])
    const link = res.headers.get('Link') || ''
    const m = link.match(/<([^>]+)>;\s*rel="next"/)
    url = m ? m[1] : null
  }
  return all
}

function classifyChannel(o) {
  const ref = (o.referring_site || '').toLowerCase()
  const land = (o.landing_site || '').toLowerCase()
  const src = (o.source_name || '').toLowerCase()
  if (ref.includes('facebook') || ref.includes('instagram') || ref.includes('fb.') || ref.includes('fbclid')
      || land.includes('fbclid') || land.includes('utm_source=facebook') || land.includes('utm_source=ig') || land.includes('utm_source=meta')) return 'Meta'
  if (ref.includes('googleads') || land.includes('gclid')
      || (land.includes('utm_source=google') && (land.includes('utm_medium=cpc') || land.includes('utm_medium=ppc')))) return 'GoogleAds'
  if (ref.includes('google') || (land.includes('utm_source=google') && !land.includes('cpc'))) return 'Organic'
  if (ref.includes('klaviyo') || land.includes('utm_source=klaviyo') || land.includes('utm_medium=email') || ref.includes('email')) return 'Email'
  if (ref.includes('bing') || land.includes('msclkid')) return 'Bing'
  if (ref.includes('tiktok') || land.includes('utm_source=tiktok')) return 'TikTok'
  if (!ref && !land) return 'Direct'
  if (src === 'pos' || src === 'shopify_draft_order') return 'POS/Manual'
  return 'Other'
}

function summarise(orders) {
  // Active = not cancelled, not voided/refunded fully
  const valid = orders.filter(o => o.cancelled_at === null && o.financial_status !== 'voided' && o.financial_status !== 'refunded')
  const totalRevenue = valid.reduce((s, o) => s + parseFloat(o.total_price || 0), 0)
  const subtotal = valid.reduce((s, o) => s + parseFloat(o.subtotal_price || 0), 0)
  const totalDiscounts = valid.reduce((s, o) => s + parseFloat(o.total_discounts || 0), 0)
  const totalRefunds = orders.reduce((s, o) => s + (o.refunds || []).reduce((rs, r) => rs + (r.transactions || []).reduce((ts, t) => ts + parseFloat(t.amount || 0), 0), 0), 0)
  const orderCount = valid.length
  const aov = orderCount ? totalRevenue / orderCount : 0
  const channels = {}
  for (const o of valid) {
    const c = classifyChannel(o)
    channels[c] = channels[c] || { orders: 0, revenue: 0 }
    channels[c].orders++
    channels[c].revenue += parseFloat(o.total_price || 0)
  }
  return { orderCount, totalRevenue, subtotal, totalDiscounts, totalRefunds, aov, channels, rawCount: orders.length }
}

function fmtMoney(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
function pct(curr, prev) { if (!prev) return 'n/a'; return ((curr - prev) / prev * 100).toFixed(1) + '%' }

async function main() {
  console.log(`Store: ${STORE}\n`)
  const results = {}
  for (const w of WINDOWS) {
    process.stderr.write(`Fetching ${w.label} ... `)
    const t0 = Date.now()
    const orders = await fetchOrders(w.startISO, w.endISO)
    const summary = summarise(orders)
    results[w.key] = { ...w, ...summary }
    process.stderr.write(`${orders.length} orders (${Date.now() - t0}ms)\n`)
  }

  const cur = results.current_2026
  const prior = results.prior_2026
  const yoy = results.yoy_2025

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('REVENUE COMPARISON')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`Window                                        Orders    Revenue       AOV`)
  console.log(`${cur.label.padEnd(46)} ${String(cur.orderCount).padStart(6)}    ${fmtMoney(cur.totalRevenue).padStart(11)}   ${fmtMoney(cur.aov).padStart(8)}`)
  console.log(`${prior.label.padEnd(46)} ${String(prior.orderCount).padStart(6)}    ${fmtMoney(prior.totalRevenue).padStart(11)}   ${fmtMoney(prior.aov).padStart(8)}`)
  console.log(`${yoy.label.padEnd(46)} ${String(yoy.orderCount).padStart(6)}    ${fmtMoney(yoy.totalRevenue).padStart(11)}   ${fmtMoney(yoy.aov).padStart(8)}`)
  console.log('')
  console.log(`Current vs Prior 14d:    revenue ${pct(cur.totalRevenue, prior.totalRevenue)}, orders ${pct(cur.orderCount, prior.orderCount)}, AOV ${pct(cur.aov, prior.aov)}`)
  console.log(`Current vs YoY (2025):   revenue ${pct(cur.totalRevenue, yoy.totalRevenue)}, orders ${pct(cur.orderCount, yoy.orderCount)}, AOV ${pct(cur.aov, yoy.aov)}`)
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('CHANNEL BREAKDOWN — current 14d (Apr 22 – May 5, 2026)')
  console.log('═══════════════════════════════════════════════════════════════════')
  const channelRows = Object.entries(cur.channels).sort((a, b) => b[1].revenue - a[1].revenue)
  for (const [c, d] of channelRows) {
    const sharePct = (d.revenue / cur.totalRevenue * 100).toFixed(1)
    console.log(`  ${c.padEnd(14)} ${String(d.orders).padStart(4)} orders   ${fmtMoney(d.revenue).padStart(11)}   ${sharePct.padStart(5)}% of revenue`)
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('CHANNEL BREAKDOWN — prior 14d (Apr 8 – Apr 21, 2026) for comparison')
  console.log('═══════════════════════════════════════════════════════════════════')
  const priorChannelRows = Object.entries(prior.channels).sort((a, b) => b[1].revenue - a[1].revenue)
  for (const [c, d] of priorChannelRows) {
    const sharePct = (d.revenue / prior.totalRevenue * 100).toFixed(1)
    console.log(`  ${c.padEnd(14)} ${String(d.orders).padStart(4)} orders   ${fmtMoney(d.revenue).padStart(11)}   ${sharePct.padStart(5)}% of revenue`)
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('CHANNEL DELTAS — current vs prior 14d')
  console.log('═══════════════════════════════════════════════════════════════════')
  const allCh = new Set([...Object.keys(cur.channels), ...Object.keys(prior.channels)])
  for (const c of allCh) {
    const curR = cur.channels[c]?.revenue || 0
    const priorR = prior.channels[c]?.revenue || 0
    const curO = cur.channels[c]?.orders || 0
    const priorO = prior.channels[c]?.orders || 0
    console.log(`  ${c.padEnd(14)} revenue ${fmtMoney(curR).padStart(11)} → ${fmtMoney(priorR).padStart(11)}  (${pct(curR, priorR).padStart(7)})    orders ${String(curO).padStart(3)} → ${String(priorO).padStart(3)}  (${pct(curO, priorO).padStart(7)})`)
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1) })
