/**
 * Full visibility throttle audit — what's compressing impressions/SIS beyond negatives
 *  1. Inline campaign-level negatives — flag suspicious ones with traffic context
 *  2. SIS lost to budget (last 90d, per campaign)
 *  3. SIS lost to rank (last 90d, per campaign)
 *  4. Quality Score distribution
 *  5. Disapproved ads / policy issues
 *  6. Geographic targeting exclusions
 *  7. Device bid modifiers (negative)
 *  8. Audience exclusions on Search campaigns
 *  9. PMAX URL exclusions / brand list state
 * 10. Paused/Removed campaigns hoarding shared lists
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = n => n==null ? '—' : (Number(n)*100).toFixed(1)+'%'

console.log(`\n=== VISIBILITY THROTTLE AUDIT — ${new Date().toISOString().slice(0,16)} ===\n`)

// ── 1. Inline campaign negatives w/ damage assessment ──
console.log('━━━ 1. CAMPAIGN-LEVEL INLINE NEGATIVES (suspicious flagged) ━━━\n')
const SUSPICIOUS = [
  /^shop$/i, /^buy$/i, /^order$/i, /^cheap$/i, /^best$/i, /^ideas$/i,
  /\baustralia\b/i, /\bnear me\b/i,
  /\b(reveal|gender reveal)\b/i,
  /smoke|cannon|extinguisher|blaster|powder|bundle|kit|pack/i,
  /\b(party|gift|baby shower)\b/i,
]
const inline = await c.query(`
  SELECT campaign.name, campaign.status, campaign_criterion.criterion_id,
         campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
  FROM campaign_criterion
  WHERE campaign.status = 'ENABLED'
    AND campaign_criterion.type = 'KEYWORD'
    AND campaign_criterion.negative = TRUE
`)
const byCamp = new Map()
for (const r of inline) {
  const cn = r.campaign?.name
  if (!byCamp.has(cn)) byCamp.set(cn, [])
  byCamp.get(cn).push({ text: r.campaign_criterion?.keyword?.text, mt: r.campaign_criterion?.keyword?.match_type })
}
for (const [cn, list] of byCamp) {
  const sus = list.filter(x => SUSPICIOUS.some(p => p.test(x.text||'')))
  console.log(`[${cn}]  (${list.length} total, ${sus.length} flagged)`)
  for (const x of sus) console.log(`   ⚠ [${MT[x.mt]||x.mt}] "${x.text}"`)
}

// ── 2 + 3. Impression share lost (90 days, per campaign) ──
console.log('\n\n━━━ 2+3. IMPRESSION SHARE LOST — Search only (last 90d) ━━━\n')
const sisRows = await c.query(`
  SELECT campaign.name, campaign.advertising_channel_type,
         metrics.search_impression_share,
         metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share,
         metrics.search_top_impression_share,
         metrics.search_absolute_top_impression_share,
         metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '2026-02-27' AND '2026-05-27'
    AND campaign.status = 'ENABLED'
`)
const sis = new Map()
for (const r of sisRows) {
  const cn = r.campaign?.name
  if (!sis.has(cn)) sis.set(cn, { is:[], lb:[], lr:[], top:[], abstop:[], spend:0 })
  const x = sis.get(cn)
  if (r.metrics?.search_impression_share!=null) x.is.push(Number(r.metrics.search_impression_share))
  if (r.metrics?.search_budget_lost_impression_share!=null) x.lb.push(Number(r.metrics.search_budget_lost_impression_share))
  if (r.metrics?.search_rank_lost_impression_share!=null) x.lr.push(Number(r.metrics.search_rank_lost_impression_share))
  if (r.metrics?.search_top_impression_share!=null) x.top.push(Number(r.metrics.search_top_impression_share))
  if (r.metrics?.search_absolute_top_impression_share!=null) x.abstop.push(Number(r.metrics.search_absolute_top_impression_share))
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
}
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
console.log('Campaign'.padEnd(40) + ' | Spend | SIS    | Lost-Budget | Lost-Rank | Top   | Abs Top')
console.log('-'.repeat(110))
for (const [cn, x] of sis) {
  if (x.is.length === 0 && x.spend < 10) continue
  console.log(
    cn.slice(0,40).padEnd(40) + ' | $' +
    String(x.spend.toFixed(0)).padStart(5) + ' | ' +
    pct(avg(x.is)).padStart(6) + ' | ' +
    pct(avg(x.lb)).padStart(11) + ' | ' +
    pct(avg(x.lr)).padStart(9) + ' | ' +
    pct(avg(x.top)).padStart(5) + ' | ' +
    pct(avg(x.abstop)).padStart(7)
  )
}
console.log(`\n  Reading: high "Lost-Budget" = bump budget; high "Lost-Rank" = bid/QS issue.`)

// ── 4. Quality Score distribution (active keywords) ──
console.log('\n\n━━━ 4. QUALITY SCORE DISTRIBUTION (enabled keywords with impressions) ━━━\n')
const qsRows = await c.query(`
  SELECT campaign.name, ad_group_criterion.keyword.text,
         ad_group_criterion.quality_info.quality_score,
         ad_group_criterion.quality_info.creative_quality_score,
         ad_group_criterion.quality_info.post_click_quality_score,
         ad_group_criterion.quality_info.search_predicted_ctr,
         metrics.impressions
  FROM keyword_view
  WHERE segments.date DURING LAST_30_DAYS
    AND ad_group_criterion.negative = FALSE
    AND ad_group_criterion.status = 'ENABLED'
    AND metrics.impressions > 50
`)
const qsBuckets = { 'QS 1-3 (poor)':[], 'QS 4-6 (avg)':[], 'QS 7-10 (good)':[], 'No QS':[] }
for (const r of qsRows) {
  const q = r.ad_group_criterion?.quality_info?.quality_score
  const kw = `[${r.campaign?.name?.slice(0,20)}] "${r.ad_group_criterion?.keyword?.text}" (${r.metrics?.impressions} imp)`
  if (q==null) qsBuckets['No QS'].push(kw)
  else if (q<=3) qsBuckets['QS 1-3 (poor)'].push({kw, q})
  else if (q<=6) qsBuckets['QS 4-6 (avg)'].push({kw, q})
  else qsBuckets['QS 7-10 (good)'].push({kw, q})
}
for (const [bucket, items] of Object.entries(qsBuckets)) {
  console.log(`${bucket}: ${items.length} keywords`)
  if (bucket.startsWith('QS 1-3') || bucket.startsWith('QS 4-6')) {
    for (const it of items.slice(0,10)) console.log(`   ${typeof it === 'string' ? it : `QS=${it.q} ${it.kw}`}`)
  }
}

// ── 5. Disapproved ads ──
console.log('\n\n━━━ 5. DISAPPROVED / LIMITED ADS ━━━\n')
try {
  const ads = await c.query(`
    SELECT campaign.name, ad_group.name, ad_group_ad.policy_summary.approval_status,
           ad_group_ad.policy_summary.review_status, ad_group_ad.ad.type
    FROM ad_group_ad
    WHERE ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED','SITE_SUSPENDED','APPROVED_LIMITED','AREA_OF_INTEREST_ONLY')
      AND campaign.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'
  `)
  if (!ads.length) console.log('  ✓ No disapproved or limited ads')
  for (const a of ads) {
    console.log(`  ⚠ [${a.campaign?.name}] ${a.ad_group?.name}: ${strCh(a.ad_group_ad?.policy_summary?.approval_status)} (review: ${strCh(a.ad_group_ad?.policy_summary?.review_status)})`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ── 6. Geographic targeting ──
console.log('\n\n━━━ 6. GEOGRAPHIC TARGETING (exclusions) ━━━\n')
try {
  const geo = await c.query(`
    SELECT campaign.name, campaign_criterion.location.geo_target_constant,
           campaign_criterion.negative, campaign_criterion.proximity.radius
    FROM campaign_criterion
    WHERE campaign_criterion.type IN ('LOCATION','PROXIMITY')
      AND campaign.status = 'ENABLED'
  `)
  const negGeo = geo.filter(g => g.campaign_criterion?.negative)
  console.log(`  Total location targets: ${geo.length}, negative exclusions: ${negGeo.length}`)
  for (const g of negGeo) {
    console.log(`  ⚠ [${g.campaign?.name}] EXCLUDED: ${g.campaign_criterion?.location?.geo_target_constant}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ── 7. Device bid modifiers ──
console.log('\n\n━━━ 7. DEVICE BID MODIFIERS (negative = throttling) ━━━\n')
try {
  const dev = await c.query(`
    SELECT campaign.name, campaign_criterion.device.type, campaign_criterion.bid_modifier
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'DEVICE'
      AND campaign.status = 'ENABLED'
  `)
  for (const d of dev) {
    const mod = Number(d.campaign_criterion?.bid_modifier||1)
    if (mod !== 1 && mod !== 0) {
      const sign = mod < 1 ? '⚠ THROTTLED' : '✓ boosted'
      console.log(`  ${sign} [${d.campaign?.name}] ${strCh(d.campaign_criterion?.device?.type)}: ${((mod-1)*100).toFixed(0)}%`)
    }
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ── 8. Audience exclusions on Search ──
console.log('\n\n━━━ 8. AUDIENCE EXCLUSIONS (Search campaigns) ━━━\n')
try {
  const aud = await c.query(`
    SELECT campaign.name, ad_group_criterion.user_list.user_list,
           ad_group_criterion.negative, ad_group.name
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'USER_LIST'
      AND ad_group_criterion.negative = TRUE
      AND campaign.status = 'ENABLED'
  `)
  if (!aud.length) console.log('  ✓ No audience exclusions')
  for (const a of aud) {
    console.log(`  ⚠ [${a.campaign?.name}/${a.ad_group?.name}] EXCLUDED audience: ${a.ad_group_criterion?.user_list?.user_list}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ── 9. PMAX URL exclusions / brand list ──
console.log('\n\n━━━ 9. PMAX URL EXCLUSIONS + BRAND SETTINGS ━━━\n')
try {
  const pmax = await c.query(`
    SELECT campaign.id, campaign.name,
           campaign.url_expansion_opt_out,
           campaign.performance_max_upgrade.status,
           campaign.brand_guidelines_enabled
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND campaign.status = 'ENABLED'
  `)
  for (const p of pmax) {
    console.log(`[${p.campaign?.name}]`)
    console.log(`   URL expansion opt-out: ${p.campaign?.url_expansion_opt_out ? '⚠ DISABLED (less reach)' : '✓ ENABLED (full reach)'}`)
    console.log(`   Brand guidelines:      ${p.campaign?.brand_guidelines_enabled ? 'ON' : 'OFF'}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ── 10. Paused/Removed campaigns w/ shared lists ──
console.log('\n\n━━━ 10. INERT SHARED LISTS (attached to paused/removed only) ━━━\n')
try {
  const allLinks = await c.query(`
    SELECT campaign.name, campaign.status, shared_set.name, shared_set.member_count
    FROM campaign_shared_set
  `)
  const setUsage = new Map()
  for (const r of allLinks) {
    const sn = r.shared_set?.name
    const cs = strCh(r.campaign?.status)
    if (!setUsage.has(sn)) setUsage.set(sn, { enabled:0, paused:0, removed:0, members: r.shared_set?.member_count })
    const x = setUsage.get(sn)
    if (cs === 'ENABLED') x.enabled++
    else if (cs === 'PAUSED') x.paused++
    else x.removed++
  }
  // Also include lists with zero links at all
  const allSets = await c.query(`SELECT shared_set.name, shared_set.member_count FROM shared_set`)
  for (const s of allSets) {
    const sn = s.shared_set?.name
    if (!setUsage.has(sn)) setUsage.set(sn, { enabled:0, paused:0, removed:0, members: s.shared_set?.member_count })
  }
  for (const [sn, x] of setUsage) {
    if (x.enabled === 0) {
      console.log(`  ⚠ INERT [${sn}] — ${x.members} negatives, attached to ${x.paused} paused / ${x.removed} removed, 0 enabled`)
    }
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

process.exit(0)
