/**
 * gads-dominance-engine.js
 *
 * The GRI Dominance Engine — single source of truth for the Google Ads tab.
 *
 * Computes everything you need to see in one glance:
 *   - Today's account performance (live, with attribution-lag note)
 *   - 7-day vs 30-day ROAS trend
 *   - Per-campaign health (enabled only)
 *   - Impression Share + Lost-to-Rank + Lost-to-Budget
 *   - Recovery tracker for the 12 catastrophic Apr 14 surgery products
 *   - Active title tests
 *   - Watch triggers (timed actions)
 *   - Top movers / fallers (last 7d vs prior 7d)
 *   - Recent changes log
 *
 * Pulls live data via gads-client.js. 5-minute in-memory cache.
 */

import { getGadsCustomer } from './gads-client.js'

// ─── 5-min cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000
let _cache = { data: null, ts: 0 }

const fmt = (d) => d.toISOString().slice(0, 10)
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return fmt(d)
}

// The 12 products with proven catastrophic damage from Apr 14 surgery.
// Tracked daily for recovery progress.
const CATASTROPHIC_PRODUCTS = [
  'TNT Gender Reveal Self Hire',
  'Gender Reveal Smoke Bombs',
  'Gender Reveal Boy & Girl Party Glasses 20pcs',
  'Gender Reveal Extinguisher | MEGA Powder Blaster',
  'Sports Gender Reveal Soccer Ball',
  'Gender Reveal Dog Bandana',
  'Gender Reveal Confetti Cannon XL 50cm',
  'Gender Reveal Confetti & Powder Cannon XL 50cm',
  'The Blaster & Smoke Reveal Kit',
  '148 Piece Gender Reveal/ Baby Shower Luxury Balloon Kit',
  'Gender Reveal Party Voting Sheet',
  'DIY Hire Gender Reveal Balloon Garland',
]

// Watch triggers — timed events the engine surfaces in the UI
const WATCH_TRIGGERS = [
  {
    id: 'feed-revert',
    title: 'Feed Surgery Revert',
    setOn: '2026-04-27',
    checkAt: '2026-05-04', // 7 days
    description: '61 product SEO titles cleared back to product-title baseline. Watch impression recovery.',
    metric: 'impression_recovery',
  },
  {
    id: 'search-cannons-network',
    title: 'Search Partners OFF — Search Cannons',
    setOn: '2026-04-25',
    checkAt: '2026-05-09', // 14 days
    description: 'Search Partners + Display disabled. Allow Smart Bidding 14d to recalibrate.',
    metric: 'search_cannons_recovery',
  },
  {
    id: 'tnt-pause',
    title: 'TNT Hire Paused',
    setOn: '2026-04-27',
    checkAt: '2026-05-27', // 30 days
    description: 'Paused after 30d at 0.01x ROAS. Review in 30 days for permanent kill or relaunch.',
    metric: 'tnt_status',
  },
]

// ─── Live data fetchers ───────────────────────────────────────────────────

async function pullAccountByDay(customer, start, end) {
  const rows = await customer.query(`
    SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status IN ('ENABLED', 'PAUSED')
  `)
  const byDay = new Map()
  for (const r of rows) {
    const d = r.segments?.date
    if (!d) continue
    const cur = byDay.get(d) || { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0 }
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.clicks += Number(r.metrics?.clicks || 0)
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    byDay.set(d, cur)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({
      date,
      ...m,
      roas: m.spend > 0 ? m.val / m.spend : 0,
      dow: new Date(date).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Brisbane' }),
    }))
}

async function pullPerCampaign(customer, start, end) {
  const rows = await customer.query(`
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           campaign_budget.amount_micros,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.search_impression_share,
           metrics.search_top_impression_share,
           metrics.search_absolute_top_impression_share,
           metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  const byCamp = new Map()
  for (const r of rows) {
    const id = r.campaign?.id
    if (!id) continue
    const cur = byCamp.get(id) || {
      id,
      name: r.campaign?.name,
      status: r.campaign?.status,
      channel: r.campaign?.advertising_channel_type,
      budget: Number(r.campaign_budget?.amount_micros || 0) / 1e6,
      spend: 0, clicks: 0, imp: 0, conv: 0, val: 0,
      searchIs: 0, topIs: 0, absTopIs: 0, lostBudget: 0, lostRank: 0, _isSamples: 0,
    }
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.clicks += Number(r.metrics?.clicks || 0)
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    // IS metrics are daily averages — accumulate then divide
    if (r.metrics?.search_impression_share != null) {
      cur.searchIs += Number(r.metrics.search_impression_share || 0)
      cur.topIs += Number(r.metrics.search_top_impression_share || 0)
      cur.absTopIs += Number(r.metrics.search_absolute_top_impression_share || 0)
      cur.lostBudget += Number(r.metrics.search_budget_lost_impression_share || 0)
      cur.lostRank += Number(r.metrics.search_rank_lost_impression_share || 0)
      cur._isSamples += 1
    }
    byCamp.set(id, cur)
  }
  return [...byCamp.values()].map((c) => {
    const n = c._isSamples || 1
    return {
      ...c,
      roas: c.spend > 0 ? c.val / c.spend : 0,
      cpa: c.conv > 0 ? c.spend / c.conv : 0,
      searchIs: c._isSamples ? c.searchIs / n : null,
      topIs: c._isSamples ? c.topIs / n : null,
      absTopIs: c._isSamples ? c.absTopIs / n : null,
      lostBudget: c._isSamples ? c.lostBudget / n : null,
      lostRank: c._isSamples ? c.lostRank / n : null,
    }
  }).sort((a, b) => b.spend - a.spend)
}

async function pullProductPerformance(customer, start, end, titleFilter = null) {
  const rows = await customer.query(`
    SELECT segments.product_title,
      metrics.impressions, metrics.clicks, metrics.conversions,
      metrics.conversions_value, metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  const byTitle = new Map()
  for (const r of rows) {
    const t = (r.segments?.product_title || '').trim()
    if (!t) continue
    if (titleFilter && !titleFilter(t)) continue
    const cur = byTitle.get(t) || { title: t, imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    byTitle.set(t, cur)
  }
  return [...byTitle.values()]
}

// ─── Recovery tracker ─────────────────────────────────────────────────────
function buildRecoveryTracker(preProducts, postProducts) {
  // For each catastrophic base product, compare 7d-pre-Apr-14 to last 7d
  const out = []
  for (const baseTitle of CATASTROPHIC_PRODUCTS) {
    const baseLc = baseTitle.toLowerCase().slice(0, 35)
    const preMatches = preProducts.filter((p) => p.title.toLowerCase().includes(baseLc))
    const postMatches = postProducts.filter((p) => p.title.toLowerCase().includes(baseLc))

    const sum = (arr) => arr.reduce(
      (acc, x) => ({
        imp: acc.imp + x.imp,
        clk: acc.clk + x.clk,
        conv: acc.conv + x.conv,
        val: acc.val + x.val,
        spend: acc.spend + x.spend,
      }),
      { imp: 0, clk: 0, conv: 0, val: 0, spend: 0 },
    )
    const pre = sum(preMatches)
    const post = sum(postMatches)

    const recoveryPct = pre.imp > 0 ? Math.round((post.imp / pre.imp) * 100) : null
    const status =
      recoveryPct == null ? 'no-data'
      : recoveryPct >= 80 ? 'recovered'
      : recoveryPct >= 50 ? 'recovering'
      : 'not-recovered'

    out.push({
      title: baseTitle,
      pre: { ...pre, roas: pre.spend > 0 ? pre.val / pre.spend : 0 },
      post: { ...post, roas: post.spend > 0 ? post.val / post.spend : 0 },
      recoveryPct,
      status,
    })
  }
  return out
}

// ─── Top movers / fallers ─────────────────────────────────────────────────
function buildMoversFallers(productsCurr, productsPrior) {
  const priorMap = new Map(productsPrior.map((p) => [p.title, p]))
  const deltas = productsCurr
    .filter((p) => p.spend >= 5) // ignore tiny
    .map((curr) => {
      const prior = priorMap.get(curr.title) || { val: 0, spend: 0, imp: 0 }
      const valDelta = curr.val - prior.val
      const impDelta = curr.imp - prior.imp
      const valPct = prior.val > 0 ? Math.round(((curr.val - prior.val) / prior.val) * 100) : (curr.val > 0 ? 100 : 0)
      return { ...curr, valDelta, valPct, impDelta, priorVal: prior.val, priorImp: prior.imp }
    })
    .sort((a, b) => b.valDelta - a.valDelta)

  return {
    topMovers: deltas.slice(0, 5),
    topFallers: deltas.slice(-5).reverse(),
  }
}

// ─── Main builder ─────────────────────────────────────────────────────────

export async function buildEngineSnapshot({ skipCache = false } = {}) {
  const now = Date.now()
  if (!skipCache && _cache.data && (now - _cache.ts) < CACHE_TTL_MS) {
    return { ..._cache.data, fromCache: true, cachedAt: new Date(_cache.ts).toISOString() }
  }

  const customer = getGadsCustomer()

  const today = daysAgo(0)
  const yesterday = daysAgo(1)
  const start7 = daysAgo(7)
  const start14 = daysAgo(14)
  const start30 = daysAgo(30)
  const startPre = '2026-03-31'
  const endPre = '2026-04-13'
  const startCurr7 = daysAgo(7)
  const startPrior7 = daysAgo(14)
  const endPrior7 = daysAgo(8)

  const [
    daily30,
    perCampaign7,
    perCampaign30,
    preProducts,
    postProducts7,
    productsCurr7,
    productsPrior7,
  ] = await Promise.all([
    pullAccountByDay(customer, start30, today),
    pullPerCampaign(customer, start7, yesterday),
    pullPerCampaign(customer, start30, yesterday),
    pullProductPerformance(customer, startPre, endPre),
    pullProductPerformance(customer, start7, yesterday),
    pullProductPerformance(customer, startCurr7, yesterday),
    pullProductPerformance(customer, startPrior7, endPrior7),
  ])

  // Today's row (partial day — flag attribution lag)
  const todayRow = daily30.find((d) => d.date === today) || { date: today, spend: 0, clicks: 0, imp: 0, conv: 0, val: 0, roas: 0 }
  const yesterdayRow = daily30.find((d) => d.date === yesterday)

  // Last 7 days (excluding today partial)
  const last7 = daily30.filter((d) => d.date >= start7 && d.date < today)
  const last30 = daily30.filter((d) => d.date >= start30 && d.date < today)
  const sumDays = (arr) => arr.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      conv: acc.conv + d.conv,
      val: acc.val + d.val,
      imp: acc.imp + d.imp,
      clicks: acc.clicks + d.clicks,
    }),
    { spend: 0, conv: 0, val: 0, imp: 0, clicks: 0 },
  )
  const tot7 = sumDays(last7)
  const tot30 = sumDays(last30)
  const roas7 = tot7.spend > 0 ? tot7.val / tot7.spend : 0
  const roas30 = tot30.spend > 0 ? tot30.val / tot30.spend : 0

  // Account-level IS aggregate (mean of per-campaign IS, weighted by impressions)
  const enabled = perCampaign30.filter((c) => c.status === 2 && c.imp > 100)
  const totalImp = enabled.reduce((s, c) => s + c.imp, 0)
  const wAvg = (k) => totalImp > 0
    ? enabled.reduce((s, c) => s + (c[k] || 0) * c.imp, 0) / totalImp
    : 0
  const accountIs = {
    searchIs: wAvg('searchIs'),
    lostRank: wAvg('lostRank'),
    lostBudget: wAvg('lostBudget'),
  }

  // Recovery tracker (Apr 14 catastrophic products)
  const recovery = buildRecoveryTracker(preProducts, postProducts7)

  // Movers / fallers
  const { topMovers, topFallers } = buildMoversFallers(productsCurr7, productsPrior7)

  // Watch triggers — annotate with days remaining
  const triggers = WATCH_TRIGGERS.map((t) => {
    const setOn = new Date(t.setOn)
    const checkAt = new Date(t.checkAt)
    const nowD = new Date()
    const daysSince = Math.floor((nowD - setOn) / 86400000)
    const daysUntilCheck = Math.ceil((checkAt - nowD) / 86400000)
    const ready = daysUntilCheck <= 0
    return { ...t, daysSince, daysUntilCheck, ready }
  })

  // Recent changes log (manual entries — most recent first)
  const recentChanges = [
    { date: '2026-04-27', title: 'Feed surgery reverted', detail: '61 products SEO titles cleared → defaults to clean product titles', type: 'revert' },
    { date: '2026-04-27', title: 'TNT Hire paused', detail: '30d at 0.01x ROAS — kill confirmed', type: 'pause' },
    { date: '2026-04-25', title: 'Search Partners + Display OFF (Search Cannons)', detail: 'Industry-research backed — give 14d', type: 'config' },
    { date: '2026-04-20', title: 'Bundles surgical revert (38 products)', detail: 'Cleared product_type, simplified SEO titles', type: 'revert' },
    { date: '2026-04-14', title: '🚨 Bulk feed surgery (102 products)', detail: 'SEO titles + product_type rewrite — proven cause of ROAS damage', type: 'incident' },
  ]

  const data = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    today: {
      date: today,
      spend: todayRow.spend,
      conv: todayRow.conv,
      val: todayRow.val,
      roas: todayRow.roas,
      note: 'Partial day. Attribution lag may underreport conversions for ~24-72 hours.',
    },
    yesterday: yesterdayRow ? {
      date: yesterdayRow.date,
      spend: yesterdayRow.spend,
      conv: yesterdayRow.conv,
      val: yesterdayRow.val,
      roas: yesterdayRow.roas,
      dow: yesterdayRow.dow,
    } : null,
    windows: {
      last7: { ...tot7, roas: roas7, days: last7.length },
      last30: { ...tot30, roas: roas30, days: last30.length },
    },
    daily: daily30.map((d) => ({ date: d.date, dow: d.dow, spend: d.spend, val: d.val, conv: d.conv, roas: d.roas })),
    accountIs,
    campaigns: perCampaign30.map((c) => ({
      id: c.id, name: c.name, status: c.status === 2 ? 'ENABLED' : 'PAUSED',
      channel: c.channel, budget: c.budget,
      spend: c.spend, clicks: c.clicks, imp: c.imp, conv: c.conv, val: c.val,
      roas: c.roas, cpa: c.cpa,
      searchIs: c.searchIs, topIs: c.topIs, absTopIs: c.absTopIs,
      lostBudget: c.lostBudget, lostRank: c.lostRank,
    })),
    recovery,
    movers: { topMovers, topFallers },
    triggers,
    recentChanges,
    totalDailyBudget: perCampaign30.filter((c) => c.status === 2).reduce((s, c) => s + c.budget, 0),
  }

  _cache = { data, ts: now }
  return data
}

// ─── Markdown formatter (for Telegram) ────────────────────────────────────

export function formatEngineForTelegram(snapshot, framework = null) {
  const s = snapshot
  const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString('en-AU')
  const fmtRoas = (r) => (r || 0).toFixed(2) + 'x'
  const fmtPct = (p) => (p == null ? '—' : Math.round(p * 100) + '%')

  const y = s.yesterday
  const w7 = s.windows.last7
  const w30 = s.windows.last30

  let m = `🚦 *GRI Dominance Engine — ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Australia/Brisbane' })}*\n\n`

  // ── Layer 1 first (per Corey Wilton framework) ──
  if (framework?.layer1?.cm) {
    const cm = framework.layer1.cm
    const icon = cm.status === 'red' ? '🔴' : cm.status === 'amber' ? '🟡' : '🟢'
    m += `*🏁 Layer 1 — Profitability (30d)*\n`
    m += `${icon} CM$: ${cm.value < 0 ? '−' : ''}${fmt$(Math.abs(cm.value))} (${cm.value < 0 ? '−' : ''}${fmt$(Math.abs(cm.perDay))}/day)\n`
    m += `Cost of Delivery: ${fmt$(framework.layer1.costOfDelivery.total)}\n\n`
  }

  if (framework?.layer3) {
    m += `*👤 Layer 3 — Acquisition (30d)*\n`
    const ncac = framework.layer3.ncac
    const fov = framework.layer3.fovCac
    const aMer = framework.layer3.aMer
    const nc = framework.layer3.newCustomerCount
    m += `nCAC: ${fmt$(ncac.value)} (baseline ${fmt$(ncac.historicalAvg)})\n`
    m += `FOV/CAC: ${fov.value.toFixed(2)}x ${fov.value < 1 ? '🚨 PAUSE GATE' : ''}\n`
    m += `aMER: ${aMer.value.toFixed(2)}x · New customers: ${nc.total}\n\n`
  }

  // Yesterday performance
  if (y) {
    m += `*Yesterday (${y.dow})*\n`
    m += `Spend ${fmt$(y.spend)} → Value ${fmt$(y.val)}\n`
    m += `ROAS *${fmtRoas(y.roas)}* · ${y.conv.toFixed(0)} conv\n\n`
  }

  // 7d vs 30d
  m += `*Trend*\n`
  m += `7d:  ${fmt$(w7.spend)} → ${fmt$(w7.val)} · *${fmtRoas(w7.roas)}* · ${w7.conv.toFixed(0)} conv\n`
  m += `30d: ${fmt$(w30.spend)} → ${fmt$(w30.val)} · *${fmtRoas(w30.roas)}* · ${w30.conv.toFixed(0)} conv\n\n`

  // Per-campaign
  const enabled = s.campaigns.filter((c) => c.status === 'ENABLED' && c.spend > 1)
  m += `*Active campaigns (30d)*\n`
  for (const c of enabled.slice(0, 6)) {
    const verdict = c.roas >= 3 ? '✅' : c.roas >= 2.13 ? '🟡' : '🔴'
    const shortName = c.name.replace(/^GRI[\s|]*/, '').replace(/PMAX[\s|]*/, '').slice(0, 32)
    m += `${verdict} ${shortName}: ${fmtRoas(c.roas)} (${fmt$(c.spend)})\n`
  }
  m += `\n`

  // Account IS
  m += `*Impression Share (30d, weighted)*\n`
  m += `Got: ${fmtPct(s.accountIs.searchIs)}\n`
  m += `Lost rank: ${fmtPct(s.accountIs.lostRank)}\n`
  m += `Lost budget: ${fmtPct(s.accountIs.lostBudget)}\n\n`

  // Recovery tracker
  const recovering = s.recovery.filter((r) => r.recoveryPct != null)
  if (recovering.length) {
    m += `*Apr 14 Recovery (12 catastrophic products)*\n`
    const recovered = recovering.filter((r) => r.status === 'recovered').length
    const inFlight = recovering.filter((r) => r.status === 'recovering').length
    const stuck = recovering.filter((r) => r.status === 'not-recovered').length
    m += `Recovered: ${recovered}/12 · Recovering: ${inFlight} · Stuck: ${stuck}\n\n`
  }

  // Movers
  if (s.movers.topMovers.length) {
    m += `*Top movers (7d vs prior 7d)*\n`
    for (const p of s.movers.topMovers.slice(0, 3)) {
      const arrow = p.valDelta >= 0 ? '↑' : '↓'
      m += `${arrow} ${p.title.slice(0, 40)}: ${fmt$(p.valDelta)}\n`
    }
    m += `\n`
  }
  if (s.movers.topFallers.length) {
    m += `*Top fallers*\n`
    for (const p of s.movers.topFallers.slice(0, 3)) {
      m += `↓ ${p.title.slice(0, 40)}: ${fmt$(p.valDelta)}\n`
    }
    m += `\n`
  }

  // Active triggers
  const activeTriggers = s.triggers.filter((t) => !t.ready)
  if (activeTriggers.length) {
    m += `*Watch triggers*\n`
    for (const t of activeTriggers) {
      m += `⏳ ${t.title}: day ${t.daysSince}, ${t.daysUntilCheck}d to check\n`
    }
    m += `\n`
  }
  const readyTriggers = s.triggers.filter((t) => t.ready)
  if (readyTriggers.length) {
    m += `🚨 *Triggers ready for review:*\n`
    for (const t of readyTriggers) {
      m += `• ${t.title} (set ${t.daysSince}d ago)\n`
    }
    m += `\n`
  }

  m += `_Spend ${fmt$(s.totalDailyBudget)}/day · Cache ${s.fromCache ? 'hit' : 'fresh'}_`

  return m
}
