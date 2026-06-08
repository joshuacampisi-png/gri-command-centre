/**
 * PMAX IDEAS-THEME WATCHDOG
 * =========================
 *
 * Runs daily after "gender reveal ideas" Search Themes are added.
 * Compares spend + ROAS + impressions across PMAX asset groups to a
 * pre-change baseline. ALERTS if any guardrail breaches.
 *
 * Baseline = 14 days BEFORE the Search Theme ship date (read from snapshot).
 * Current  = 7-day rolling window (or since ship date, whichever is shorter).
 *
 * ALERT thresholds:
 *   - Any enabled asset group spend up >40% vs baseline daily avg
 *   - Account-wide PMAX ROAS down >25% w/w
 *   - Total PMAX daily spend exceeds $400 (vs ~$190 historical avg)
 *
 * Output: console + writes daily report to data/snapshots/pmax-ideas-themes/watchdog-YYYY-MM-DD.json
 *
 * To schedule daily (Mac): crontab -e then add
 *   0 8 * * * cd /Users/wogbot/.openclaw/workspace/command-centre-app && node scripts/pmax-ideas-watchdog.js >> data/snapshots/pmax-ideas-themes/watchdog.log 2>&1
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const SNAPSHOT_DIR = 'data/snapshots/pmax-ideas-themes'
const fmt = d => d.toISOString().slice(0,10)

const PMAX_IDS = ['21113841118','21511998936','22841772135']
// Test pair only — matches pmax-add-ideas-themes.js TARGET_AGS
const TARGET_AGS = ['6500812492','6598765304']
// Control group (monitored for cannibalisation check, not expected to grow):
const CONTROL_AGS = ['6509114421','6642424873','6700880020']

// Guardrails
const AG_SPEND_LIFT_ALERT = 0.40      // 40% vs baseline daily avg
const ACCOUNT_ROAS_DROP_ALERT = 0.25  // 25% w/w drop
const TOTAL_DAILY_SPEND_CEILING = 400 // $ — historical avg ~$190

// Read ship date from ship-log.json (the day Search Themes were added)
const shipLogPath = `${SNAPSHOT_DIR}/ship-log.json`
if (!existsSync(shipLogPath)) {
  console.log(`Ship log not found at ${shipLogPath}. Run pmax-add-ideas-themes.js --ship first.`)
  process.exit(0)
}
const shipLog = JSON.parse(readFileSync(shipLogPath, 'utf8'))
const shipDate = new Date(shipLog.completedAt)
const today = new Date()
const daysSinceShip = Math.floor((today - shipDate) / 86400000)
console.log(`\n========== WATCHDOG — ${today.toISOString().slice(0,16)} ==========`)
console.log(`Search Themes shipped: ${shipDate.toISOString().slice(0,10)} (${daysSinceShip} days ago)`)

// Baseline window: 14 days BEFORE ship
const blStart = fmt(new Date(shipDate.getTime() - 14*86400000))
const blEnd   = fmt(new Date(shipDate.getTime() - 1*86400000))
// Current window: from ship date through yesterday (max 7 days)
const curStart = fmt(shipDate)
const curEnd   = fmt(new Date(Date.now() - 86400000))

console.log(`Baseline window: ${blStart} → ${blEnd} (14d pre-ship)`)
console.log(`Current  window: ${curStart} → ${curEnd} (${daysSinceShip}d post-ship)`)

const alerts = []

// =====================================================
// 1. Per-asset-group spend comparison
// =====================================================
console.log(`\n--- 1. ASSET GROUP SPEND vs BASELINE ---`)
const agSpend = async (agId, start, end) => {
  const rows = await customer.query(`
    SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.impressions, metrics.clicks
    FROM asset_group WHERE asset_group.id = ${agId} AND segments.date BETWEEN '${start}' AND '${end}'
  `)
  let sp=0, conv=0, val=0, imp=0, clk=0
  for (const r of rows) {
    sp+=Number(r.metrics?.cost_micros||0)/1e6
    conv+=Number(r.metrics?.conversions||0)
    val+=Number(r.metrics?.conversions_value||0)
    imp+=Number(r.metrics?.impressions||0)
    clk+=Number(r.metrics?.clicks||0)
  }
  return { sp, conv, val, imp, clk }
}

console.log('AG                     | Baseline $/d | Current $/d  | Δ%      | Baseline ROAS | Current ROAS | Status')
console.log('-----------------------+--------------+--------------+---------+---------------+--------------+--------')
const agReports = []
for (const agId of TARGET_AGS) {
  const bl = await agSpend(agId, blStart, blEnd)
  const cur = await agSpend(agId, curStart, curEnd)
  const blDays = 14, curDays = Math.max(daysSinceShip, 1)
  const blDailyAvg = bl.sp / blDays
  const curDailyAvg = cur.sp / curDays
  const liftPct = blDailyAvg > 0 ? (curDailyAvg - blDailyAvg) / blDailyAvg : 0
  const blRoas = bl.sp ? bl.val/bl.sp : 0
  const curRoas = cur.sp ? cur.val/cur.sp : 0
  const breach = liftPct > AG_SPEND_LIFT_ALERT
  const status = breach ? '🚨 ALERT' : (liftPct < -0.10 ? '↓ down' : '✓ normal')
  if (breach) alerts.push({ type:'AG_SPEND_LIFT', agId, liftPct, blDailyAvg, curDailyAvg })
  console.log(`${agId.padEnd(22)} | $${blDailyAvg.toFixed(2).padStart(10)} | $${curDailyAvg.toFixed(2).padStart(10)} | ${(liftPct*100).toFixed(0).padStart(5)}% | ${blRoas.toFixed(2).padStart(11)}x | ${curRoas.toFixed(2).padStart(10)}x | ${status}`)
  agReports.push({ agId, blDailyAvg, curDailyAvg, liftPct, blRoas, curRoas, breach })
}

// =====================================================
// 2. Account-wide PMAX ROAS comparison
// =====================================================
console.log(`\n--- 2. ACCOUNT-WIDE PMAX ROAS ---`)
const acctRoas = async (start, end) => {
  let sp=0, val=0, conv=0, imp=0
  for (const id of PMAX_IDS) {
    const rows = await customer.query(`
      SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.impressions
      FROM campaign WHERE campaign.id = ${id} AND segments.date BETWEEN '${start}' AND '${end}'
    `)
    for (const r of rows) {
      sp+=Number(r.metrics?.cost_micros||0)/1e6
      val+=Number(r.metrics?.conversions_value||0)
      conv+=Number(r.metrics?.conversions||0)
      imp+=Number(r.metrics?.impressions||0)
    }
  }
  return { sp, val, conv, imp, roas: sp ? val/sp : 0 }
}
const blAcct = await acctRoas(blStart, blEnd)
const curAcct = await acctRoas(curStart, curEnd)
const roasDrop = blAcct.roas > 0 ? (blAcct.roas - curAcct.roas) / blAcct.roas : 0
console.log(`Baseline (14d pre):  $${blAcct.sp.toFixed(0).padStart(5)} spend → $${blAcct.val.toFixed(0).padStart(5)} value = ${blAcct.roas.toFixed(2)}x ROAS`)
console.log(`Current  (${daysSinceShip}d post): $${curAcct.sp.toFixed(0).padStart(5)} spend → $${curAcct.val.toFixed(0).padStart(5)} value = ${curAcct.roas.toFixed(2)}x ROAS`)
console.log(`ROAS Δ: ${(-roasDrop*100).toFixed(0)}% ${roasDrop > ACCOUNT_ROAS_DROP_ALERT ? '🚨 ALERT — exceeds 25% drop threshold' : '✓ within tolerance'}`)
if (roasDrop > ACCOUNT_ROAS_DROP_ALERT) alerts.push({ type:'ACCOUNT_ROAS_DROP', roasDrop, blRoas:blAcct.roas, curRoas:curAcct.roas })

// =====================================================
// 3. Total daily spend ceiling
// =====================================================
console.log(`\n--- 3. DAILY SPEND CEILING ---`)
const curDailyAvg = curAcct.sp / Math.max(daysSinceShip,1)
const breach3 = curDailyAvg > TOTAL_DAILY_SPEND_CEILING
console.log(`Current PMAX daily avg: $${curDailyAvg.toFixed(0)} (ceiling $${TOTAL_DAILY_SPEND_CEILING}) ${breach3 ? '🚨 ALERT' : '✓ ok'}`)
if (breach3) alerts.push({ type:'DAILY_SPEND_CEILING', curDailyAvg, ceiling:TOTAL_DAILY_SPEND_CEILING })

// =====================================================
// REPORT
// =====================================================
console.log(`\n========== ALERTS: ${alerts.length} ==========`)
for (const a of alerts) console.log(`  🚨 ${a.type}: ${JSON.stringify(a)}`)
if (!alerts.length) console.log(`  ✓ All guardrails within tolerance.`)

const report = {
  ranAt: new Date().toISOString(),
  shipDate: shipLog.completedAt,
  daysSinceShip,
  windows: { baseline:[blStart,blEnd], current:[curStart,curEnd] },
  perAssetGroup: agReports,
  account: { baseline: blAcct, current: curAcct, roasDrop, dailyAvg: curDailyAvg },
  alerts,
}
const reportPath = `${SNAPSHOT_DIR}/watchdog-${fmt(today)}.json`
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`\nReport saved: ${reportPath}`)

if (alerts.length) {
  console.log(`\n!! ACTION RECOMMENDED:`)
  console.log(`   1. Review the alert above`)
  console.log(`   2. If runaway spend or ROAS collapse confirmed:`)
  console.log(`      node scripts/pmax-add-ideas-themes.js --rollback`)
}
process.exit(alerts.length ? 1 : 0)
