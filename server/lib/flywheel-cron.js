/**
 * flywheel-cron.js
 * Scheduled jobs for the Ads Intelligence Flywheel.
 * Meta sync, kill/scale evaluation, AOV intelligence, creative briefs, outcome measurement.
 */
import cron from 'node-cron'
import {
  isMetaConfigured, fetchCampaigns, fetchAdsetsForCampaign, fetchAdsForCampaign,
  fetchAdInsightsByDay, fetchAdsetInsights, fetchAccountInsights
} from './meta-api.js'
import {
  saveCampaigns, saveAdSets, saveAds, upsertAdSnapshot, upsertAdSetSnapshot,
  logFlywheelEvent, getCampaigns as getStoredCampaigns, deduplicateAlerts,
  getAdActivations, getAdSetSnapshots, updateAdActivationImpact
} from './flywheel-store.js'
import {
  evaluateKillRules, evaluateScaleRules, calculateAovIntelligence, FLYWHEEL
} from './flywheel-engine.js'
import {
  generateCreativeBrief, runDecisionEngine, measureActionOutcomes
} from './flywheel-intelligence.js'
import { runDailyBackup, logFlywheelEvent as logEvent } from './flywheel-store.js'

// ── Crash-safe wrapper ──────────────────────────────────────────────────────
// Every cron job is wrapped so a single failure never kills the process.

function safeRun(name, fn) {
  return async () => {
    const start = Date.now()
    try {
      console.log(`[Flywheel Cron] Starting: ${name}`)
      await fn()
      const ms = Date.now() - start
      console.log(`[Flywheel Cron] Completed: ${name} (${ms}ms)`)
    } catch (err) {
      const ms = Date.now() - start
      console.error(`[Flywheel Cron] FAILED: ${name} after ${ms}ms —`, err.message)
      try {
        logFlywheelEvent('cron_error', { job: name, error: err.message, duration: ms })
      } catch { /* logging itself failed, nothing we can do */ }
    }
  }
}

// ── Meta Sync Job ───────────────────────────────────────────────────────────
// Pulls all campaigns, ad sets, ads, and daily insights from Meta API.
// Stores snapshots for kill/scale rule evaluation.

export async function metaSyncJob() {
  if (!isMetaConfigured()) {
    console.log('[Flywheel Cron] Meta not configured, skipping sync')
    return
  }

  console.log('[Flywheel Cron] Starting Meta sync...')
  logFlywheelEvent('meta_sync_start', 'Pulling latest data from Meta Ads API')

  // Throttle helper — wait between API calls to avoid Meta rate limits
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  try {
    // 1. Fetch campaigns
    const campaigns = await fetchCampaigns()
    const campaignRecords = campaigns.map(c => ({
      metaCampaignId: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective || '',
      budget: parseFloat(c.daily_budget || c.lifetime_budget || 0) / 100,
      budgetType: c.daily_budget ? 'daily' : 'lifetime',
      dailyBudget: parseFloat(c.daily_budget || 0) / 100,
    }))
    saveCampaigns(campaignRecords)

    // 2. Fetch ad sets for each campaign
    const allAdSets = []
    const allAds = []

    for (let ci = 0; ci < campaigns.length; ci++) {
      const camp = campaigns[ci]
      try {
        // Throttle: wait 3s between campaigns to respect Meta rate limits
        if (ci > 0) await wait(3000)

        const adSets = await fetchAdsetsForCampaign(camp.id)
        console.log(`[Flywheel Cron] Campaign "${camp.name}": ${adSets.length} ad sets`)
        for (const as of adSets) {
          const audience = classifyAudience(as)
          allAdSets.push({
            metaAdSetId: as.id,
            campaignId: camp.id,
            campaignName: camp.name,
            name: as.name,
            status: as.status,
            budget: parseFloat(as.daily_budget || as.lifetime_budget || 0) / 100,
            dailyBudget: parseFloat(as.daily_budget || 0) / 100,
            audience,
            targeting: as.targeting || null,
          })
        }

        await wait(2000) // Throttle between ad set and ad fetch

        const ads = await fetchAdsForCampaign(camp.id)
        console.log(`[Flywheel Cron] Campaign "${camp.name}": ${ads.length} ads`)
        for (const ad of ads) {
          allAds.push({
            metaAdId: ad.id,
            adSetId: ad.adset_id,
            campaignId: camp.id,
            name: ad.name,
            status: ad.status,
            creativeAngle: classifyCreativeAngle(ad.name),
            formatType: classifyFormat(ad.name),
            thumbnailUrl: ad.creative?.thumbnail_url || null,
            createdTime: ad.created_time,
          })
        }
      } catch (err) {
        console.error(`[Flywheel Cron] Error fetching data for campaign ${camp.id} (${camp.name}):`, err.message, err.stack?.split('\n')[1])
        logFlywheelEvent('sync_error', { campaignId: camp.id, campaignName: camp.name, error: err.message })
      }
    }

    saveAdSets(allAdSets)
    saveAds(allAds)

    // 3. Fetch daily insights for active ads (last 7 days)
    const activeAds = allAds.filter(a => a.status === 'ACTIVE')
    let snapshotCount = 0

    for (let ai = 0; ai < activeAds.length; ai++) {
      const ad = activeAds[ai]
      try {
        // Throttle: wait 2s every 3 ads to stay under Meta rate limits
        if (ai > 0 && ai % 3 === 0) await wait(2000)
        const dailyInsights = await fetchAdInsightsByDay(ad.metaAdId, 7)
        for (const day of dailyInsights) {
          if (!day) continue
          const snap = {
            adId: ad.metaAdId,
            adSetId: ad.adSetId,
            campaignId: ad.campaignId,
            date: day.dateStart || day.date_start || new Date().toISOString().split('T')[0],
            spend: day.spend || 0,
            impressions: day.impressions || 0,
            clicks: day.clicks || 0,
            purchases: day.purchases || 0,
            revenue: day.revenue || 0,
            cpa: day.purchases > 0 ? day.spend / day.purchases : 0,
            roas: day.spend > 0 ? day.revenue / day.spend : 0,
            ctr: day.ctr || 0,
            cpm: day.cpm || 0,
            frequency: day.frequency || 0,
            thumbstopRate: day.impressions > 0 ? (day.videoPlays || 0) / day.impressions : 0,
            sustainRate: day.videoP25 > 0 ? (day.videoP95 || 0) / day.videoP25 : 0,
            hookToClick: day.videoPlays > 0 ? (day.clicks || 0) / day.videoPlays : 0,
          }
          upsertAdSnapshot(snap)
          snapshotCount++
        }
      } catch (err) {
        console.error(`[Flywheel Cron] Error fetching insights for ad ${ad.metaAdId}:`, err.message)
      }
    }

    // 4. Fetch ad set level insights
    const activeAdSets = allAdSets.filter(a => a.status === 'ACTIVE')
    for (const adSet of activeAdSets) {
      try {
        const insights = await fetchAdsetInsights(adSet.metaAdSetId, 'last_7d')
        if (insights) {
          upsertAdSetSnapshot({
            adSetId: adSet.metaAdSetId,
            campaignId: adSet.campaignId,
            date: new Date().toISOString().split('T')[0],
            spend: insights.spend || 0,
            impressions: insights.impressions || 0,
            purchases: insights.purchases || 0,
            revenue: insights.revenue || 0,
            cpa: insights.purchases > 0 ? insights.spend / insights.purchases : 0,
            roas: insights.spend > 0 ? insights.revenue / insights.spend : 0,
            frequency: insights.frequency || 0,
            cpm: insights.cpm || 0,
          })
        }
      } catch (err) {
        console.error(`[Flywheel Cron] Error fetching adset insights ${adSet.metaAdSetId}:`, err.message)
      }
    }

    logFlywheelEvent('meta_sync_complete', {
      campaigns: campaignRecords.length,
      adSets: allAdSets.length,
      ads: allAds.length,
      snapshots: snapshotCount,
    })
    console.log(`[Flywheel Cron] Meta sync complete: ${campaignRecords.length} campaigns, ${allAdSets.length} ad sets, ${allAds.length} ads, ${snapshotCount} snapshots`)

    // Kill/scale rules run on their own daily schedule (6am/6:30am AEST).
    // Do NOT re-run them on every 6-hour sync — that generates duplicate alerts
    // and evaluates on incomplete data windows.

  } catch (err) {
    console.error('[Flywheel Cron] Meta sync failed:', err.message)
    logFlywheelEvent('error', `Meta sync failed: ${err.message}`)
  }
}

// ── Audience Classification ─────────────────────────────────────────────────

function classifyAudience(adSet) {
  const name = (adSet.name || '').toLowerCase()
  if (name.includes('retarget') || name.includes('warm') || name.includes('atc')) return 'retargeting_warm'
  if (name.includes('lookalike') || name.includes('lal')) return 'lookalike'
  if (name.includes('broad') || name.includes('aus wide')) return 'cold_broad'
  if (name.includes('local') || name.includes('hire')) return 'local_hire'
  if (name.includes('advantage') || name.includes('asc')) return 'asc'

  // Check custom audiences in targeting
  const targeting = adSet.targeting || {}
  if (targeting.custom_audiences && targeting.custom_audiences.length > 0) {
    const hasLookalike = targeting.custom_audiences.some(a => a.subtype === 'LOOKALIKE')
    if (hasLookalike) return 'lookalike'
    return 'retargeting_warm'
  }

  return 'cold_broad'
}

// ── Creative Angle Classification ───────────────────────────────────────────

function classifyCreativeAngle(name) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('ugc') || lower.includes('reaction') || lower.includes('unbox')) return 'social_proof'
  if (lower.includes('fomo') || lower.includes('urgent') || lower.includes('last')) return 'fomo'
  if (lower.includes('emotion') || lower.includes('memory') || lower.includes('moment')) return 'emotion'
  if (lower.includes('problem') || lower.includes('stress') || lower.includes('plan')) return 'problem'
  if (lower.includes('confront') || lower.includes('bold') || lower.includes('dare')) return 'confrontational'
  if (lower.includes('review') || lower.includes('testimonial') || lower.includes('proof')) return 'social_proof'
  return 'unknown'
}

// ── Format Classification ───────────────────────────────────────────────────

function classifyFormat(name) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('video') || lower.includes('reel') || lower.includes('ugc')) return 'video'
  if (lower.includes('carousel') || lower.includes('multi')) return 'carousel'
  if (lower.includes('static') || lower.includes('image')) return 'static'
  return 'unknown'
}

// ── Schedule All Flywheel Crons ─────────────────────────────────────────────

// ── Activation Impact Measurement ──────────────────────────────────────────
// Checks all 'tracking' activations and computes before/after CPA/ROAS/frequency.

async function measureActivationImpacts() {
  const activations = getAdActivations('tracking')
  if (!activations.length) return

  console.log(`[Flywheel] Measuring impact for ${activations.length} active ad activations...`)

  for (const activation of activations) {
    const daysSince = Math.floor((Date.now() - new Date(activation.activatedAt).getTime()) / 86400000)
    const baseline = activation.baseline || {}

    for (const window of ['3d', '5d', '7d']) {
      const windowDays = parseInt(window)
      if (daysSince < windowDays) continue
      if (activation.impact[window]) continue // already measured

      // Get adset snapshots for the window period after activation
      const snapshots = getAdSetSnapshots(activation.adSetId, windowDays)
      if (!snapshots.length) continue

      const totalSpend = snapshots.reduce((s, r) => s + (r.spend || 0), 0)
      const totalPurchases = snapshots.reduce((s, r) => s + (r.purchases || 0), 0)
      const totalRevenue = snapshots.reduce((s, r) => s + (r.revenue || 0), 0)
      const avgFreq = snapshots.reduce((s, r) => s + (r.frequency || 0), 0) / snapshots.length

      const currentCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0
      const currentRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

      const cpaDelta = baseline.cpa > 0 ? currentCpa - baseline.cpa : 0
      const roasDelta = baseline.roas > 0 ? currentRoas - baseline.roas : 0

      let cpaDirection = 'neutral'
      if (cpaDelta < -2) cpaDirection = 'improved'
      else if (cpaDelta > 2) cpaDirection = 'degraded'

      updateAdActivationImpact(activation.id, window, {
        cpa: +currentCpa.toFixed(2),
        roas: +currentRoas.toFixed(2),
        frequency: +avgFreq.toFixed(2),
        delta: {
          cpa: +cpaDelta.toFixed(2),
          roas: +roasDelta.toFixed(2),
          cpaDirection
        }
      })

      console.log(`[Flywheel] ${activation.adName} ${window} impact: CPA $${currentCpa.toFixed(2)} (${cpaDirection} vs $${baseline.cpa.toFixed(2)})`)
    }
  }
}

export function startFlywheelCrons() {
  console.log('[Flywheel Cron] Starting flywheel scheduled jobs...')

  // Boot-time cleanup: resolve duplicate unresolved alerts from previous cycles
  try { deduplicateAlerts() } catch (e) { console.error('[Flywheel Cron] Alert dedup failed:', e.message) }

  // Meta sync: every 6 hours (2am, 8am, 2pm, 8pm AEST)
  cron.schedule('0 2,8,14,20 * * *', safeRun('meta-sync', metaSyncJob), { timezone: 'Australia/Brisbane' })

  // Kill rule evaluation: daily at 6am AEST
  cron.schedule('0 6 * * *', safeRun('kill-rules', evaluateKillRules), { timezone: 'Australia/Brisbane' })

  // Scale rule evaluation: daily at 6:30am AEST
  cron.schedule('30 6 * * *', safeRun('scale-rules', evaluateScaleRules), { timezone: 'Australia/Brisbane' })

  // AOV intelligence: daily at 7am AEST
  cron.schedule('0 7 * * *', safeRun('aov-intelligence', calculateAovIntelligence), { timezone: 'Australia/Brisbane' })

  // AI Decision Engine: every 6 hours (offset from meta-sync by 1 hour)
  cron.schedule('0 3,9,15,21 * * *', safeRun('ai-decision-engine', runDecisionEngine), { timezone: 'Australia/Brisbane' })

  // Creative brief generation: every Friday at 5pm AEST
  cron.schedule('0 17 * * 5', safeRun('creative-brief', generateCreativeBrief), { timezone: 'Australia/Brisbane' })

  // Outcome measurement + activation impact: daily at 10am AEST
  cron.schedule('0 10 * * *', safeRun('outcome-measurement', async () => {
    await measureActionOutcomes()
    await measureActivationImpacts()
  }), { timezone: 'Australia/Brisbane' })

  // Daily backup: 1am AEST every day (before any other jobs run)
  cron.schedule('0 1 * * *', safeRun('daily-backup', async () => {
    runDailyBackup()
  }), { timezone: 'Australia/Brisbane' })

  // Run initial meta sync on startup (delayed 30s to let server boot)
  setTimeout(safeRun('startup-meta-sync', metaSyncJob), 30000)

  // Run first backup immediately on startup
  setTimeout(() => {
    try { runDailyBackup() } catch (err) {
      console.error('[Flywheel Cron] Startup backup failed:', err.message)
    }
  }, 5000)

  console.log('[Flywheel Cron] All flywheel jobs scheduled (8 jobs + daily backup)')
}
