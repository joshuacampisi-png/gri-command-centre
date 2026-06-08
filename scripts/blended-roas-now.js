/**
 * Blended ROAS / CPA / Spend across Meta + Google
 *  - 30-day window (decision-grade)
 *  - 7-day window (recent)
 *  - 3-day window (this Mon/Tue/Wed)
 */
import 'dotenv/config'
import { metaToken } from '../server/lib/meta-api.js'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const TOKEN = metaToken()
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528'
const BASE = 'https://graph.facebook.com/v20.0'
const c = getGadsCustomer()

function dateNDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const TODAY = new Date().toISOString().slice(0, 10)
const D30 = dateNDaysAgo(30)
const D7  = dateNDaysAgo(7)
const D3  = dateNDaysAgo(2) // Mon Tue Wed when run on Wed

async function metaRange(since, until) {
  const url = new URL(`${BASE}/${AD_ACCOUNT}/insights`)
  url.searchParams.set('access_token', TOKEN)
  url.searchParams.set('fields', 'spend,actions,action_values')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('level', 'account')
  const r = await fetch(url).then(r => r.json())
  if (r.error) { console.error('Meta', r.error); return null }
  const row = (r.data || [])[0] || {}
  const spend = Number(row.spend || 0)
  const purchase = (row.actions || []).find(a => a.action_type === 'purchase')
  const purchaseVal = (row.action_values || []).find(a => a.action_type === 'purchase')
  return {
    spend,
    conversions: Number(purchase?.value || 0),
    revenue: Number(purchaseVal?.value || 0),
  }
}

async function googleRange(since, until) {
  const rows = await c.query(`
    SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `)
  const t = { spend: 0, conversions: 0, revenue: 0 }
  for (const r of rows) {
    t.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    t.conversions += Number(r.metrics?.conversions || 0)
    t.revenue += Number(r.metrics?.conversions_value || 0)
  }
  return t
}

async function pull(since, until, label, days) {
  const [m, g] = await Promise.all([metaRange(since, until), googleRange(since, until)])
  if (!m || !g) return
  const blended = {
    spend: m.spend + g.spend,
    conversions: m.conversions + g.conversions,
    revenue: m.revenue + g.revenue,
  }
  console.log(`\n━━━ ${label} (${since} → ${until}, ${days}d) ━━━`)
  console.log('Platform | Spend       | Spend/day | Revenue     | Conv   | ROAS   | CPA')
  console.log('-'.repeat(85))
  const fmt = (p, t) => {
    const sp = '$' + t.spend.toFixed(0).padStart(6)
    const spd = '$' + (t.spend / days).toFixed(0).padStart(4)
    const rev = '$' + t.revenue.toFixed(0).padStart(7)
    const conv = t.conversions.toFixed(0).padStart(5)
    const roas = t.spend > 0 ? (t.revenue / t.spend).toFixed(2) + 'x' : '—'
    const cpa = t.conversions > 0 ? '$' + (t.spend / t.conversions).toFixed(2) : '—'
    return `${p.padEnd(9)} | ${sp.padEnd(11)} | ${spd.padEnd(9)} | ${rev.padEnd(11)} | ${conv.padEnd(6)} | ${roas.padEnd(6)} | ${cpa}`
  }
  console.log(fmt('Meta', m))
  console.log(fmt('Google', g))
  console.log('-'.repeat(85))
  console.log(fmt('BLENDED', blended))
}

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║   BLENDED META + GOOGLE — Spend / ROAS / CPA snapshot     ║')
console.log(`║   Pulled live: ${new Date().toISOString().slice(0,16)}                          ║`)
console.log('╚══════════════════════════════════════════════════════════╝')

await pull(D30, TODAY, 'LAST 30 DAYS', 31)
await pull(D7, TODAY, 'LAST 7 DAYS', 8)
await pull(D3, TODAY, 'LAST 3 DAYS (Mon/Tue/Wed)', 3)

process.exit(0)
