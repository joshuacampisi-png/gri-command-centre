/**
 * 24-HOUR FULL RECOVERY REPORT
 * Pulls every metric tied to today's changes (May 17-18).
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const today = fmt(new Date())
const yesterday = fmt(new Date(Date.now()-86400000))
const twoDaysAgo = fmt(new Date(Date.now()-2*86400000))
const sevenDaysAgo = fmt(new Date(Date.now()-7*86400000))

console.log(`\n╔════════════════════════════════════════════════════════════════════════╗`)
console.log(`║  24-HOUR FULL ACCOUNT HEALTH + RECOVERY REPORT                         ║`)
console.log(`║  Generated: ${new Date().toISOString().slice(0,16)}Z                                 ║`)
console.log(`║  Today: ${today} (Mon) | Yesterday: ${yesterday} (Sun)                ║`)
console.log(`╚════════════════════════════════════════════════════════════════════════╝`)

// =============================================================
// 1. ACCOUNT TOTAL — TODAY vs YESTERDAY (same partial-day window)
// =============================================================
console.log(`\n══════ 1. ACCOUNT TOTAL ══════\n`)
const accountQ = async (date) => {
  const rows = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${date}'`)
  let imp=0,clk=0,sp=0,conv=0,val=0
  for (const r of rows) {
    imp+=Number(r.metrics?.impressions||0)
    clk+=Number(r.metrics?.clicks||0)
    sp+=Number(r.metrics?.cost_micros||0)/1e6
    conv+=Number(r.metrics?.conversions||0)
    val+=Number(r.metrics?.conversions_value||0)
  }
  return { imp,clk,sp,conv,val, ctr: imp?clk/imp*100:0, cvr: clk?conv/clk*100:0, roas: sp?val/sp:0, cpc: clk?sp/clk:0, aov: conv?val/conv:0 }
}
const acctToday = await accountQ(today)
const acctY = await accountQ(yesterday)
const acct7 = await accountQ(sevenDaysAgo)
const fmt$ = n => `$${n.toFixed(0).padStart(5)}`
const fmtN = n => String(n).padStart(6)

console.log('Window     | Imp    | Clk  | Spend  | Conv | Value  | CTR  | CVR  | ROAS  | CPC   | AOV')
console.log('-----------+--------+------+--------+------+--------+------+------+-------+-------+------')
const row = (l,x) => console.log(`${l.padEnd(10)} | ${fmtN(x.imp)} | ${String(x.clk).padStart(4)} | ${fmt$(x.sp)} | ${x.conv.toFixed(0).padStart(4)} | ${fmt$(x.val)} | ${x.ctr.toFixed(2).padStart(4)}% | ${x.cvr.toFixed(2).padStart(4)}% | ${x.roas.toFixed(2).padStart(4)}x | $${x.cpc.toFixed(2).padStart(4)} | $${x.aov.toFixed(0).padStart(3)}`)
row('TODAY', acctToday)
row('YESTERDAY', acctY)
row('7d ago', acct7)

const clkDelta = acctY.clk ? (acctToday.clk-acctY.clk)/acctY.clk*100 : 0
const spDelta = acctY.sp ? (acctToday.sp-acctY.sp)/acctY.sp*100 : 0
const roasDelta = acctY.roas ? (acctToday.roas-acctY.roas)/acctY.roas*100 : 0
console.log(`\n  Today vs Yesterday: Clicks ${clkDelta>=0?'+':''}${clkDelta.toFixed(0)}% | Spend ${spDelta>=0?'+':''}${spDelta.toFixed(0)}% | ROAS ${roasDelta>=0?'+':''}${roasDelta.toFixed(0)}%`)

// =============================================================
// 2. PER-CAMPAIGN BREAKDOWN — TODAY
// =============================================================
console.log(`\n══════ 2. PER-CAMPAIGN BREAKDOWN — TODAY ══════\n`)
const campQ = async (date) => {
  const rows = await c.query(`SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share FROM campaign WHERE segments.date='${date}' AND campaign.status='ENABLED'`)
  const m = new Map()
  for (const r of rows) {
    const id = r.campaign?.id
    const cur = m.get(id) || { id, name: r.campaign?.name, ch: r.campaign?.advertising_channel_type, imp:0, clk:0, sp:0, conv:0, val:0, is_n:0, is_sum:0 }
    cur.imp+=Number(r.metrics?.impressions||0)
    cur.clk+=Number(r.metrics?.clicks||0)
    cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
    cur.conv+=Number(r.metrics?.conversions||0)
    cur.val+=Number(r.metrics?.conversions_value||0)
    if (r.metrics?.search_impression_share!=null) { cur.is_sum+=Number(r.metrics.search_impression_share); cur.is_n++ }
    m.set(id, cur)
  }
  return [...m.values()]
}
const campT = await campQ(today)
const campY = await campQ(yesterday)
console.log('Campaign                                | Imp   | Clk | Spend | Conv | Value  | CTR  | CVR  | ROAS  | IS%')
console.log('-----------------------------------------+-------+-----+-------+------+--------+------+------+-------+-----')
for (const x of campT.sort((a,b)=>b.sp-a.sp)) {
  const ctr = x.imp?(x.clk/x.imp*100).toFixed(1):'-'
  const cvr = x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  const is = x.is_n?(x.is_sum/x.is_n*100).toFixed(0):'-'
  console.log(`${(x.name||'').slice(0,40).padEnd(40)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${String(ctr).padStart(4)}% | ${String(cvr).padStart(4)}% | ${String(roas).padStart(4)}x | ${String(is).padStart(3)}%`)
}

// =============================================================
// 3. BRAND DEFENCE — SERVING CHECK (since activation Saturday)
// =============================================================
console.log(`\n══════ 3. BRAND DEFENCE — POST-FIX CHECK ══════\n`)
const start = fmt(new Date(Date.now()-3*86400000))
const bd = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=23425232813 AND segments.date BETWEEN '${start}' AND '${today}' ORDER BY segments.date`)
console.log('Date       | Imp | Clk | Spend | Conv | Value')
let bdHasData = false
for (const r of bd) {
  const imp = Number(r.metrics?.impressions||0)
  bdHasData = bdHasData || imp>0
  console.log(`${r.segments?.date} | ${String(imp).padStart(3)} | ${Number(r.metrics?.clicks||0).toString().padStart(3)} | $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2).padStart(4)} | ${Number(r.metrics?.conversions||0).toFixed(0).padStart(4)} | $${Number(r.metrics?.conversions_value||0).toFixed(0).padStart(4)}`)
}
console.log(`Status: ${bdHasData ? '✅ SERVING' : '⏸ NOT YET SERVING — was fixed 3h ago, allow 1-3h ramp'}`)

// =============================================================
// 4. HOURLY TODAY — see if today's recovery is happening
// =============================================================
console.log(`\n══════ 4. HOURLY TODAY ══════\n`)
const hour = await c.query(`SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${today}' ORDER BY segments.hour`)
const byHour = new Map()
for (const r of hour) {
  const h = r.segments?.hour
  if (h==null) continue
  const cur = byHour.get(h) || { imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  byHour.set(h, cur)
}
console.log('Hour  | Imp  | Clk | Spend | Conv | Value | ROAS')
let tSp=0,tVal=0,tConv=0
for (const [h,x] of [...byHour.entries()].sort((a,b)=>a[0]-b[0])) {
  tSp+=x.sp; tVal+=x.val; tConv+=x.conv
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${String(h).padStart(2)}:00 | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas}x`)
}

// =============================================================
// 5. TOP LANDING PAGES TODAY (paid traffic)
// =============================================================
console.log(`\n══════ 5. TOP LANDING PAGES TODAY (paid) ══════\n`)
const lp = await c.query(`SELECT landing_page_view.unexpanded_final_url, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM landing_page_view WHERE segments.date='${today}' AND metrics.clicks>0 ORDER BY metrics.cost_micros DESC LIMIT 12`)
for (const r of lp) {
  const clk=Number(r.metrics?.clicks||0), sp=Number(r.metrics?.cost_micros||0)/1e6, conv=Number(r.metrics?.conversions||0), val=Number(r.metrics?.conversions_value||0)
  const cvr = clk?(conv/clk*100).toFixed(1):'-'
  const roas = sp?(val/sp).toFixed(2):'-'
  const path = (r.landing_page_view?.unexpanded_final_url||'').replace('https://genderrevealideas.com.au','').slice(0,75)
  console.log(`  ${String(clk).padStart(3)}clk ${String(cvr).padStart(5)}% ${String(roas).padStart(5)}x $${sp.toFixed(0).padStart(3)} | ${path}`)
}

// =============================================================
// 6. SUMMARY VERDICT
// =============================================================
console.log(`\n══════ 6. RECOVERY VERDICT ══════\n`)
const verdict = []
if (acctToday.roas > acctY.roas) verdict.push('✅ ROAS today > yesterday — recovery signal')
else verdict.push(`⚠ ROAS today (${acctToday.roas.toFixed(2)}x) < yesterday (${acctY.roas.toFixed(2)}x) — but Mon vs Sun noise, watch Tue/Wed`)
if (acctToday.cvr > acctY.cvr) verdict.push('✅ CVR today > yesterday')
else verdict.push(`⚠ CVR today (${acctToday.cvr.toFixed(2)}%) < yesterday (${acctY.cvr.toFixed(2)}%)`)
if (bdHasData) verdict.push('✅ Brand Defence serving')
else verdict.push('⏸ Brand Defence still ramping (fixed 3h ago)')
for (const v of verdict) console.log(`  ${v}`)

process.exit(0)
