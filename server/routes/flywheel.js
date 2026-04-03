/**
 * /api/flywheel/* routes — Ads Intelligence Flywheel.
 * Dashboard data, alerts, briefs, agent actions, conversions, AOV intelligence.
 */
import { Router } from 'express'
import {
  getAlerts, resolveAlert, getConversions, getCpaTargets, updateCpaTarget,
  getWeeklyRhythm, markRhythmDay, getPendingActions, approveAction, rejectAction,
  markActionExecuted, getFlywheelLog, getAovIntel, getAgentLearning,
  getIndustryKnowledge, saveIndustryKnowledge, getLatestBrief, approveBrief,
  getCampaigns, getAdSets, getAds, getFlywheelHealth, runDailyBackup,
} from '../lib/flywheel-store.js'
import {
  getFlywheelSummary, getCreativeLeaderboard, scoreCampaignHealth,
  calculateAovIntelligence, FLYWHEEL
} from '../lib/flywheel-engine.js'
import {
  generateCreativeBrief, runDecisionEngine, executeAction
} from '../lib/flywheel-intelligence.js'
import { metaSyncJob } from '../lib/flywheel-cron.js'
import {
  updateAdSetBudget, updateCampaignBudget, fetchAdsetsForCampaign
} from '../lib/meta-api.js'
import { processShopifyOrder, verifyShopifyHmac } from '../lib/flywheel-webhook.js'

const router = Router()

// ── Summary metrics (top cards) ─────────────────────────────────────────────

router.get('/summary', (_req, res) => {
  try {
    const summary = getFlywheelSummary()
    const rhythm = getWeeklyRhythm()
    const pendingActions = getPendingActions('awaiting_approval')
    res.json({ ok: true, summary, rhythm, pendingActionsCount: pendingActions.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Alerts ──────────────────────────────────────────────────────────────────

router.get('/alerts', (_req, res) => {
  try {
    const alerts = getAlerts(true)
    res.json({ ok: true, alerts })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/alerts/:id/resolve', (req, res) => {
  try {
    const alert = resolveAlert(req.params.id)
    if (!alert) return res.status(404).json({ ok: false, error: 'Alert not found' })
    res.json({ ok: true, alert })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Campaign health table ───────────────────────────────────────────────────

router.get('/campaigns', (_req, res) => {
  try {
    const campaigns = getCampaigns()
    const enriched = campaigns.map(c => ({
      ...c,
      health: scoreCampaignHealth(c),
    }))
    res.json({ ok: true, campaigns: enriched })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/adsets', (_req, res) => {
  try {
    const adSets = getAdSets()
    res.json({ ok: true, adSets })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── AOV Intelligence ────────────────────────────────────────────────────────

router.get('/aov', (_req, res) => {
  try {
    const intel = calculateAovIntelligence()
    const history = getAovIntel(30)
    res.json({ ok: true, current: intel, history })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Creative leaderboard ────────────────────────────────────────────────────

router.get('/creatives', (_req, res) => {
  try {
    const leaderboard = getCreativeLeaderboard()
    res.json({ ok: true, creatives: leaderboard })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Creative briefs ─────────────────────────────────────────────────────────

router.get('/brief/latest', (_req, res) => {
  try {
    const brief = getLatestBrief()
    res.json({ ok: true, brief })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/brief/generate', async (_req, res) => {
  try {
    const brief = await generateCreativeBrief()
    if (!brief) return res.status(500).json({ ok: false, error: 'Brief generation failed' })
    res.json({ ok: true, brief })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/brief/:id/approve', (req, res) => {
  try {
    const brief = approveBrief(req.params.id)
    if (!brief) return res.status(404).json({ ok: false, error: 'Brief not found' })
    res.json({ ok: true, brief })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Weekly rhythm ───────────────────────────────────────────────────────────

router.post('/rhythm/:day/complete', (req, res) => {
  try {
    const rhythm = markRhythmDay(req.params.day)
    if (!rhythm) return res.status(404).json({ ok: false, error: 'Rhythm not found' })
    res.json({ ok: true, rhythm })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Flywheel log (raw conversion feed) ──────────────────────────────────────

router.get('/conversions', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14
    const conversions = getConversions(days)
    res.json({ ok: true, conversions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/log', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14
    const log = getFlywheelLog(days)
    res.json({ ok: true, log })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── CPA targets ─────────────────────────────────────────────────────────────

router.get('/targets', (_req, res) => {
  try {
    const targets = getCpaTargets()
    res.json({ ok: true, targets })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/targets/:category', (req, res) => {
  try {
    const { target } = req.body
    if (!target || isNaN(target)) return res.status(400).json({ ok: false, error: 'Invalid target value' })
    const updated = updateCpaTarget(req.params.category, parseFloat(target))
    res.json({ ok: true, target: updated })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── AI Agent actions ────────────────────────────────────────────────────────

router.get('/actions', (req, res) => {
  try {
    const status = req.query.status || 'awaiting_approval'
    const actions = getPendingActions(status)
    res.json({ ok: true, actions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/actions/:id/approve', async (req, res) => {
  try {
    const action = approveAction(req.params.id)
    if (!action) return res.status(404).json({ ok: false, error: 'Action not found' })

    // Execute the action against Meta API
    const execResult = await executeAction(action)
    if (execResult.success) {
      markActionExecuted(req.params.id, execResult.result)
    }
    res.json({ ok: true, action, execution: execResult })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/actions/:id/reject', (req, res) => {
  try {
    const { reason } = req.body
    const action = rejectAction(req.params.id, reason || '')
    if (!action) return res.status(404).json({ ok: false, error: 'Action not found' })
    res.json({ ok: true, action })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Agent learning log ──────────────────────────────────────────────────────

router.get('/learning', (_req, res) => {
  try {
    const learning = getAgentLearning(50)
    res.json({ ok: true, learning })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Decision engine trigger ─────────────────────────────────────────────────

router.post('/decision-engine/run', async (_req, res) => {
  try {
    const actions = await runDecisionEngine()
    res.json({ ok: true, actions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Meta sync trigger ───────────────────────────────────────────────────────

router.post('/meta-sync/trigger', async (_req, res) => {
  try {
    await metaSyncJob()
    res.json({ ok: true, message: 'Meta sync complete' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Shopify order webhook (flywheel entry point) ────────────────────────────

router.post('/webhook/order', (req, res) => {
  // Respond immediately
  res.status(200).json({ ok: true })

  // Process async
  try {
    const order = req.body
    if (order && order.id) {
      processShopifyOrder(order)
    }
  } catch (err) {
    console.error('[Flywheel Route] Webhook processing error:', err.message)
  }
})

// ── Industry knowledge ──────────────────────────────────────────────────────

router.get('/knowledge', (_req, res) => {
  try {
    const knowledge = getIndustryKnowledge()
    res.json({ ok: true, knowledge })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Scale Spend (direct budget control per ad set) ──────────────────────────

router.post('/scale/:adSetId', async (req, res) => {
  try {
    const { adSetId } = req.params
    const { percentage } = req.body // 5 to 18

    if (!percentage || percentage < 5 || percentage > 18) {
      return res.status(400).json({ ok: false, error: 'Percentage must be between 5 and 18' })
    }

    // Get current ad set to find current budget
    const adSets = getAdSets()
    const adSet = adSets.find(a => (a.metaAdSetId || a.id) === adSetId)
    if (!adSet) return res.status(404).json({ ok: false, error: 'Ad set not found' })

    const currentBudget = adSet.dailyBudget || adSet.budget || 0
    if (currentBudget <= 0) {
      return res.status(400).json({ ok: false, error: 'Ad set has no daily budget set' })
    }

    const increase = currentBudget * (percentage / 100)
    const newBudget = Math.round((currentBudget + increase) * 100) / 100

    // Execute against Meta API
    await updateAdSetBudget(adSetId, newBudget)

    // Log it
    const { logFlywheelEvent } = await import('../lib/flywheel-store.js')
    logFlywheelEvent('budget_scaled', {
      adSetId,
      adSetName: adSet.name,
      previousBudget: currentBudget,
      newBudget,
      percentage,
      scaledBy: 'josh_manual',
    })

    res.json({
      ok: true,
      adSetName: adSet.name,
      previousBudget: currentBudget,
      newBudget,
      percentage,
      message: `Budget increased from $${currentBudget.toFixed(2)} to $${newBudget.toFixed(2)} (+${percentage}%)`,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Creative Analysis (auto-detect what a creative is and where it should go) ──

router.post('/analyse-creative', async (req, res) => {
  try {
    const { adName, adId, thumbnail } = req.body

    // Get current performance data to inform placement
    const leaderboard = getCreativeLeaderboard()
    const campaigns = getCampaigns()
    const adSetsData = getAdSets()
    const conversions = getConversions(14)
    const aovIntel = calculateAovIntelligence()

    // Find winning patterns
    const winners = leaderboard.filter(c => c.roas7d > 3.0 && c.purchases > 0)
    const winningAngles = {}
    for (const w of winners) {
      winningAngles[w.creativeAngle] = (winningAngles[w.creativeAngle] || 0) + 1
    }

    // Find underserved audiences with room for growth
    const audiencePerf = {}
    for (const as of adSetsData) {
      const audience = as.audience || 'unknown'
      if (!audiencePerf[audience]) audiencePerf[audience] = { count: 0, names: [] }
      audiencePerf[audience].count++
      audiencePerf[audience].names.push(as.name)
    }

    const { callClaude } = await import('../lib/claude-guard.js')

    const systemPrompt = `You are the creative placement strategist for Gender Reveal Ideas (genderrevealideas.com.au). You analyse a creative asset and determine exactly where it should be placed in the Meta Ads account.

You must output valid JSON only. No markdown.

Output this structure:
{
  "detectedAngle": "emotion|social_proof|fomo|problem|confrontational|unknown",
  "detectedFormat": "video|static|carousel",
  "detectedProducts": ["list of GRI products visible or mentioned"],
  "targetPersona": "Who this creative speaks to (age, life stage, mindset)",
  "recommendedCampaign": "Which campaign type this belongs in (ASC, manual CBO, retargeting, testing ABO)",
  "recommendedAudience": "cold_broad|lookalike|retargeting_warm|local_hire",
  "recommendedAdSet": "Name of the specific ad set to place this in, or 'create new' with reasoning",
  "recommendedDailySpend": number in AUD,
  "attributionWindow": "7d_click_1d_view|1d_click|7d_click",
  "placementReasoning": "2-3 sentences on why this placement based on current performance data",
  "aovPotential": "low|medium|high|premium",
  "suggestedHookLine": "The opening line for this creative if it needs one",
  "suggestedBodyCopy": "Full ad body copy optimised for this angle",
  "suggestedCta": "Shop Now|Get Yours|See the Range|Book a Hire",
  "growthOpportunities": ["list of 1-3 growth ideas based on gaps in current data"]
}`

    const dataPayload = `
CREATIVE TO ANALYSE:
Name: ${adName || 'Unknown'}
Ad ID: ${adId || 'Unknown'}

CURRENT ACCOUNT STATE:
Active campaigns: ${campaigns.map(c => c.name).join(', ')}
Active ad sets: ${adSetsData.filter(a => a.status === 'ACTIVE').map(a => `${a.name} (${a.audience})`).join(', ')}

Winning creative angles: ${JSON.stringify(winningAngles)}
Top 3 performers: ${winners.slice(0, 3).map(w => `${w.name} (${w.creativeAngle}, ROAS ${w.roas7d})`).join(', ') || 'Not enough data yet'}

Audience distribution: ${JSON.stringify(audiencePerf)}

AOV data: Average $${aovIntel?.avgAov || 0}, Bundle rate ${aovIntel?.bundleRate || 0}%, Target $160
Total conversions last 14 days: ${conversions.length}
`

    const result = await callClaude(systemPrompt, dataPayload)

    let parsed
    try {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { raw: result, error: 'Could not parse AI response as JSON' }
    }

    res.json({ ok: true, analysis: parsed })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Growth Opportunities (suggest new audiences, creative ideas) ────────────

router.get('/opportunities', async (_req, res) => {
  try {
    const leaderboard = getCreativeLeaderboard()
    const adSetsData = getAdSets()
    const conversions = getConversions(30)
    const aovIntel = calculateAovIntelligence()

    // Identify gaps
    const opportunities = []

    // Check for underperforming audiences that could be tested differently
    const audienceTypes = {}
    for (const as of adSetsData) {
      const aud = as.audience || 'unknown'
      if (!audienceTypes[aud]) audienceTypes[aud] = { count: 0, adSets: [] }
      audienceTypes[aud].count++
      audienceTypes[aud].adSets.push(as.name)
    }

    if (!audienceTypes['lookalike'] || audienceTypes['lookalike'].count === 0) {
      opportunities.push({
        type: 'audience_gap',
        title: 'No lookalike audiences detected',
        detail: 'Lookalike audiences based on purchasers typically deliver 3.2x higher CTR. Create a 1% lookalike from your purchase pixel data.',
        priority: 'high',
      })
    }

    if (!audienceTypes['retargeting_warm'] || audienceTypes['retargeting_warm'].count < 2) {
      opportunities.push({
        type: 'audience_gap',
        title: 'Retargeting is underbuilt',
        detail: 'Retargeting achieves 3.61 ROAS vs 2.19 for prospecting. Create ad sets for: video viewers (7d), ATC abandoners (3d), page visitors (7d).',
        priority: 'high',
      })
    }

    // Check creative angle diversity
    const angleCount = {}
    for (const cr of leaderboard) {
      angleCount[cr.creativeAngle] = (angleCount[cr.creativeAngle] || 0) + 1
    }
    const testedAngles = Object.keys(angleCount).filter(a => a !== 'unknown')
    const missingAngles = ['emotion', 'social_proof', 'fomo', 'problem', 'confrontational']
      .filter(a => !testedAngles.includes(a))

    if (missingAngles.length > 0) {
      opportunities.push({
        type: 'creative_gap',
        title: `Untested creative angles: ${missingAngles.join(', ')}`,
        detail: `You're only testing ${testedAngles.length} of 5 proven angles. The ${missingAngles[0]} angle is untested and could be a winner.`,
        priority: 'medium',
      })
    }

    // Check bundle messaging
    if (aovIntel && aovIntel.bundleRate < 30) {
      opportunities.push({
        type: 'aov_opportunity',
        title: `Bundle rate is only ${aovIntel.bundleRate}% (target: 30%)`,
        detail: 'Create "Complete Reveal Kit" bundle ads. Use messaging: "Everything you need for the moment" and "What if the cannon doesn\'t fire? Get the backup pack."',
        priority: 'high',
      })
    }

    // Check if any audience has growing CPM with flat CTR (saturation)
    const unknownAngles = leaderboard.filter(c => c.creativeAngle === 'unknown')
    if (unknownAngles.length > leaderboard.length * 0.5) {
      opportunities.push({
        type: 'naming_issue',
        title: `${unknownAngles.length} of ${leaderboard.length} ads have undetected creative angles`,
        detail: 'Name your ads with angle keywords (e.g. "R6 | UGC Reaction | Video | Mega Blaster") so the flywheel can track which angles perform best.',
        priority: 'medium',
      })
    }

    // International opportunity check
    const hasInternational = adSetsData.some(a => (a.name || '').toLowerCase().includes('brazil') || (a.name || '').toLowerCase().includes('international'))
    if (hasInternational) {
      opportunities.push({
        type: 'expansion_opportunity',
        title: 'International audience detected (Brazilian)',
        detail: 'If Brazilian audience is converting, create dedicated Portuguese language creative. Test emotion and social_proof angles with Brazilian UGC. Gender reveal parties are massive in Brazil.',
        priority: 'medium',
      })
    }

    res.json({ ok: true, opportunities, summary: { total: opportunities.length, high: opportunities.filter(o => o.priority === 'high').length } })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Health check ────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  try {
    const health = getFlywheelHealth()
    const status = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503
    res.status(status).json({ ok: health.status !== 'degraded', ...health })
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: err.message })
  }
})

// ── Manual backup trigger ───────────────────────────────────────────────────

router.post('/backup', (_req, res) => {
  try {
    const result = runDailyBackup()
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Constants (for frontend display) ────────────────────────────────────────

router.get('/constants', (_req, res) => {
  res.json({ ok: true, constants: FLYWHEEL })
})

export default router
