/**
 * Fixed 48h diagnostic — handles channel enum objects + adds change history + per-camp breakdown
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const POST = ['2026-05-25','2026-05-26']
const PRE  = ['2026-05-23','2026-05-24']
const d = (a,b) => b===0 ? (a>0?'+∞':'—') : (((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'
const pct = n => n==null ? '—' : (n*100).toFixed(1)+'%'
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
const strCh = c => typeof c === 'string' ? c : (c?.name || String(c||''))

async function pull(start,end) {
  const rows = await customer.query(`
    SELECT segments.date, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.search_impression_share, metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map()
  for (const r of rows) {
    const n = r.campaign?.name || '?'
    if (!byCamp.has(n)) byCamp.set(n,{spend:0,clicks:0,imp:0,conv:0,value:0,channel:strCh(r.campaign?.advertising_channel_type),isList:[],lbList:[],lrList:[]})
    const c = byCamp.get(n)
    c.spend += Number(r.metrics?.cost_micros||0)/1e6
    c.clicks += Number(r.metrics?.clicks||0)
    c.imp += Number(r.metrics?.impressions||0)
    c.conv += Number(r.metrics?.conversions||0)
    c.value += Number(r.metrics?.conversions_value||0)
    if (r.metrics?.search_impression_share!=null) c.isList.push(Number(r.metrics.search_impression_share))
    if (r.metrics?.search_budget_lost_impression_share!=null) c.lbList.push(Number(r.metrics.search_budget_lost_impression_share))
    if (r.metrics?.search_rank_lost_impression_share!=null) c.lrList.push(Number(r.metrics.search_rank_lost_impression_share))
  }
  return byCamp
}

const [post, pre] = await Promise.all([pull(POST[0],POST[1]), pull(PRE[0],PRE[1])])

console.log('\n=== PER-CAMPAIGN 48h vs PRIOR 48h ===\n')
console.log('Campaign                              | Type     | Imp 48h →48h prior      | Clk 48h →prior      | Spend 48h →prior')
console.log('-'.repeat(135))
const all = new Set([...post.keys(), ...pre.keys()])
const sorted = [...all].sort((a,b)=>(post.get(b)?.spend||0)-(post.get(a)?.spend||0))
for (const n of sorted) {
  const c1 = post.get(n) || {spend:0,imp:0,clicks:0,conv:0,value:0,channel:'?'}
  const c0 = pre.get(n) || {spend:0,imp:0,clicks:0,conv:0,value:0,channel:'?'}
  if (c1.spend===0 && c0.spend===0) continue
  console.log(`${n.slice(0,38).padEnd(38)} | ${strCh(c1.channel).slice(0,8).padEnd(8)} | ${String(c1.imp).padStart(5)}→${String(c0.imp).padStart(5)} ${d(c1.imp,c0.imp).padStart(8)} | ${String(c1.clicks).padStart(3)}→${String(c0.clicks).padStart(3)} ${d(c1.clicks,c0.clicks).padStart(8)} | $${c1.spend.toFixed(0).padStart(4)}→$${c0.spend.toFixed(0).padStart(4)} ${d(c1.spend,c0.spend).padStart(8)}`)
}

// Impression share specifically for PMAX + Search
console.log(`\n=== IMPRESSION SHARE (where data returned) ===`)
console.log('Campaign                              | Type     | IS now → prior          | LostRank → prior        | LostBudget → prior')
console.log('-'.repeat(135))
for (const n of sorted) {
  const c1 = post.get(n)
  const c0 = pre.get(n)
  if (!c1 || c1.spend===0) continue
  const is1 = avg(c1.isList), is0 = avg(c0?.isList||[])
  const lr1 = avg(c1.lrList), lr0 = avg(c0?.lrList||[])
  const lb1 = avg(c1.lbList), lb0 = avg(c0?.lbList||[])
  if (is1==null && lr1==null && lb1==null) continue
  const flag = is1!=null && is0!=null && (is0-is1) > 0.05 ? '⚠ IS DROPPED' : ''
  console.log(`${n.slice(0,38).padEnd(38)} | ${strCh(c1.channel).slice(0,8).padEnd(8)} | ${pct(is0).padStart(7)} → ${pct(is1).padStart(7)} | ${pct(lr0).padStart(7)} → ${pct(lr1).padStart(7)} | ${pct(lb0).padStart(7)} → ${pct(lb1).padStart(7)} ${flag}`)
}

// ==== CHANGE HISTORY ====
console.log(`\n=== CHANGE HISTORY (last 14 days, all campaigns) ===`)
try {
  const changes = await customer.query(`
    SELECT change_event.change_date_time, change_event.user_email, change_event.client_type,
           change_event.change_resource_type, change_event.resource_change_operation,
           campaign.name
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 50
  `)
  if (!changes.length) { console.log('  No change events.') }
  for (const c of changes) {
    const dt = c.change_event?.change_date_time?.slice(0,16) || '?'
    const op = strCh(c.change_event?.resource_change_operation) || '?'
    const res = strCh(c.change_event?.change_resource_type) || '?'
    const who = c.change_event?.user_email || '?'
    const camp = c.campaign?.name || '-'
    console.log(`  ${dt} | ${op.padEnd(7)} ${res.padEnd(32)} | ${who.slice(0,32).padEnd(32)} | ${camp.slice(0,30)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ==== SHOPPING (PMAX) specific impression data ====
console.log(`\n=== PMAX SHOPPING-LEVEL METRICS ===`)
const pmaxRows = await customer.query(`
  SELECT segments.date, campaign.name,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${PRE[0]}' AND '${POST[1]}'
`)
const byDay = new Map()
for (const r of pmaxRows) {
  const date = r.segments?.date
  if (!byDay.has(date)) byDay.set(date,{imp:0,clk:0,spend:0,conv:0,value:0})
  const x = byDay.get(date)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
}
console.log('Date       | Imp     | Clicks | Spend | Conv | Revenue')
console.log('-'.repeat(70))
for (const [date, x] of [...byDay.entries()].sort()) {
  console.log(`${date} | ${String(x.imp).padStart(6)} | ${String(x.clk).padStart(6)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(5)}`)
}
process.exit(0)
