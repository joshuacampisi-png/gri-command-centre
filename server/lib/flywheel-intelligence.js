/**
 * flywheel-intelligence.js
 * AI decision engine and creative brief generator.
 * Uses Claude to analyse performance data and produce actionable recommendations.
 */
import { callClaude } from './claude-guard.js'
import {
  getConversions, getAdSnapshots, getAdSetSnapshots, getAds, getAdSets,
  getCampaigns, getAlerts, getPendingActions, addPendingAction, addBrief,
  addAgentLearning, logFlywheelEvent, getAgentLearning, getLatestBrief,
} from './flywheel-store.js'
import {
  FLYWHEEL, calculateAovIntelligence, getCreativeLeaderboard, getFlywheelSummary
} from './flywheel-engine.js'

// ── Creative Brief Generator (runs every Friday) ────────────────────────────

export async function generateCreativeBrief() {
  console.log('[Flywheel Intelligence] Generating creative brief...')

  const leaderboard = getCreativeLeaderboard()
  const aovIntel = calculateAovIntelligence()
  const conversions = getConversions(14)
  const summary = getFlywheelSummary()

  // Prepare the performance data summary for Claude
  const top3ByRoas = leaderboard.slice(0, 3)
  const worst2 = leaderboard.slice(-2).reverse()
  const top3ByAov = [...leaderboard].sort((a, b) => b.avgAov - a.avgAov).slice(0, 3)

  // Angle performance
  const angleStats = {}
  for (const ad of leaderboard) {
    const angle = ad.creativeAngle || 'unknown'
    if (!angleStats[angle]) angleStats[angle] = { roas: [], aov: [], thumbstop: [], count: 0 }
    angleStats[angle].roas.push(ad.roas7d)
    angleStats[angle].aov.push(ad.avgAov)
    angleStats[angle].thumbstop.push(ad.thumbstopPct)
    angleStats[angle].count++
  }
  const angleBreakdown = Object.entries(angleStats).map(([angle, s]) => ({
    angle,
    avgRoas: s.roas.reduce((a, b) => a + b, 0) / s.count,
    avgAov: s.aov.filter(v => v > 0).length > 0 ? s.aov.filter(v => v > 0).reduce((a, b) => a + b, 0) / s.aov.filter(v => v > 0).length : 0,
    avgThumbstop: s.thumbstop.reduce((a, b) => a + b, 0) / s.count,
    adCount: s.count,
  })).sort((a, b) => b.avgRoas - a.avgRoas)

  // Products in $160+ orders
  const highAovOrders = conversions.filter(c => c.aov >= FLYWHEEL.AOV_TARGET)
  const highAovProducts = {}
  for (const order of highAovOrders) {
    for (const p of (order.products || [])) {
      const cat = p.category || 'unknown'
      highAovProducts[cat] = (highAovProducts[cat] || 0) + 1
    }
  }

  const dataPayload = `
PERFORMANCE DATA (last 14 days)

Blended metrics:
- Total spend: $${summary.weekSpend}
- 7 day ROAS: ${summary.weekRoas}
- 7 day CPA: $${summary.weekCpa}
- Average AOV: $${aovIntel?.avgAov || summary.avgAov7d}
- Median AOV: $${aovIntel?.medianAov || 0}
- AOV target: $${FLYWHEEL.AOV_TARGET}
- Gap to target: $${aovIntel?.gapToTarget || (FLYWHEEL.AOV_TARGET - summary.avgAov7d).toFixed(2)}
- Bundle rate: ${aovIntel?.bundleRate || summary.bundleRate7d}%
- Single item rate: ${aovIntel?.singleItemRate || 0}%
- Orders above $130: ${aovIntel?.aovOver160 || 0}

Top 3 creatives by ROAS:
${top3ByRoas.map((a, i) => `${i + 1}. "${a.name}" (${a.creativeAngle}) — ROAS ${a.roas7d}, CPA $${a.cpa7d}, AOV $${a.avgAov}, Thumbstop ${a.thumbstopPct}%`).join('\n')}

Top 3 creatives by AOV:
${top3ByAov.map((a, i) => `${i + 1}. "${a.name}" (${a.creativeAngle}) — AOV $${a.avgAov}, ROAS ${a.roas7d}`).join('\n')}

Worst 2 creatives:
${worst2.map((a, i) => `${i + 1}. "${a.name}" (${a.creativeAngle}) — ROAS ${a.roas7d}, CPA $${a.cpa7d}, Frequency ${a.frequency}`).join('\n')}

Creative angle performance:
${angleBreakdown.map(a => `- ${a.angle}: ROAS ${a.avgRoas.toFixed(2)}, AOV $${a.avgAov.toFixed(2)}, Thumbstop ${a.avgThumbstop.toFixed(1)}%, ${a.adCount} ads`).join('\n')}

Products in $160+ orders:
${Object.entries(highAovProducts).map(([cat, count]) => `- ${cat}: ${count} appearances`).join('\n') || 'No $160+ orders yet'}

Top product combinations:
${(aovIntel?.topCombos || []).map(c => `- ${c.combo}: ${c.count} orders (${c.pctOfOrders}%)`).join('\n') || 'No bundle data yet'}
`

  const systemPrompt = `You are the creative strategist for Gender Reveal Ideas (genderrevealideas.com.au), an Australian ecommerce brand selling gender reveal products including TNT cannons, smoke bombs, confetti cannons, and cannon hire services on the Gold Coast.

Your job is to write a complete creative brief for the upcoming fortnight based on actual conversion data. The brief must be ready for a video editor and graphic designer to execute without further explanation.

Key strategic goals:
- Push average order value above $160 AUD (currently below this)
- Drive bundle purchases (cannon plus smoke plus accessory as a complete moment, not individual items)
- Maintain CPA targets per product category
- Refresh creative before frequency hits 5 on any cold audience
- This is a one time purchase business. Every customer buys once. Make every acquisition count.

The $160 AOV strategy: customers spend $250 to $1000 on a gender reveal party total. Products are only $50 to $200 of that. Frame the bundle as "everything you need for the moment" not "buy more stuff". Sell the complete reveal experience. Include backup items because you cannot redo this moment.

Bundle psychology: "What if the cannon doesn't fire?" sells a backup. "Make sure everyone gets to join in" sells multi packs. "The smoke makes the photos incredible" sells the add on.

Australian English only. No dashes in body copy. Bold headings.

Output format:
1. What the data says (2 sentences max, just the facts)
2. The one angle to double down on and why
3. The one angle to kill and why
4. Hook copy: write 3 specific hook lines ready for the editor to record or overlay
5. The product or bundle to feature and the exact framing (memory, problem, social proof etc)
6. Format recommendation (static vs video and why)
7. The complete 30 second video script if video is recommended
8. AOV guidance: one specific thing to say in the ad that drives bundle consideration
9. Audience recommendation: who to target and why based on the data`

  try {
    const result = await callClaude(systemPrompt, dataPayload)

    const brief = addBrief({
      weekOf: new Date().toISOString().split('T')[0],
      generatedFrom: {
        metrics: summary,
        aovIntel,
        topAngles: angleBreakdown.slice(0, 3),
        generatedAt: new Date().toISOString(),
      },
      winningAngles: angleBreakdown.slice(0, 3),
      aovInsights: {
        avgAov: aovIntel?.avgAov,
        bundleRate: aovIntel?.bundleRate,
        gapToTarget: aovIntel?.gapToTarget,
        highAovProducts,
      },
      hookRecommended: '',
      formatRecommended: '',
      productFocus: '',
      fullBrief: result,
    })

    logFlywheelEvent('brief_generated', `Creative brief generated for week of ${brief.weekOf}`)
    console.log('[Flywheel Intelligence] Brief generated successfully')
    return brief
  } catch (err) {
    console.error('[Flywheel Intelligence] Brief generation failed:', err.message)
    logFlywheelEvent('error', `Brief generation failed: ${err.message}`)
    return null
  }
}

// ── AI Decision Engine (runs every 6 hours) ─────────────────────────────────

export async function runDecisionEngine() {
  console.log('[Flywheel Intelligence] Running decision engine...')

  const summary = getFlywheelSummary()
  const leaderboard = getCreativeLeaderboard()
  const aovIntel = calculateAovIntelligence()
  const alerts = getAlerts(true)
  const campaigns = getCampaigns()
  const adSets = getAdSets()
  const recentLearning = getAgentLearning(20)
  const pendingCount = getPendingActions('awaiting_approval').length

  // Don't overwhelm Josh with too many pending actions
  if (pendingCount >= 5) {
    console.log('[Flywheel Intelligence] 5 pending actions already, skipping decision cycle')
    return []
  }

  const dataPayload = `
CURRENT STATE OF GRI META ADS

Summary metrics (7 day):
- Spend: $${summary.weekSpend}
- Revenue: $${summary.weekRevenue}
- ROAS: ${summary.weekRoas}
- CPA: $${summary.weekCpa} (target: $${summary.cpaTarget})
- AOV: $${summary.avgAov7d} (target: $${FLYWHEEL.AOV_TARGET})
- Purchases: ${summary.weekPurchases}
- Bundle rate: ${summary.bundleRate7d}%

Active campaigns (${campaigns.length}):
${campaigns.map(c => `- ${c.name} (${c.status}) budget $${(c.dailyBudget || c.daily_budget || 0) / 100}/day`).join('\n')}

Active ad sets (${adSets.filter(a => a.status === 'ACTIVE').length}):
${adSets.filter(a => a.status === 'ACTIVE').map(a => `- ${a.name} (${a.audience || 'unknown'}) budget $${(a.budget || a.dailyBudget || 0)}/day`).join('\n')}

Creative leaderboard (top 5):
${leaderboard.slice(0, 5).map((a, i) => `${i + 1}. "${a.name}" — ROAS ${a.roas7d}, CPA $${a.cpa7d}, Freq ${a.frequency}, Status: ${a.status}`).join('\n')}

Active alerts:
${alerts.map(a => `- [${a.severity}] ${a.title}: ${a.body}`).join('\n') || 'No active alerts'}

Recent agent decisions and outcomes:
${recentLearning.slice(0, 5).map(l => `- ${l.actionType}: predicted ${JSON.stringify(l.predictedOutcome)}, actual: ${JSON.stringify(l.actualOutcome || 'pending')}, accuracy: ${l.predictionAccuracy || 'pending'}`).join('\n') || 'No learning history yet'}

AOV Intelligence:
- Average AOV: $${aovIntel?.avgAov || 0}
- Bundle rate: ${aovIntel?.bundleRate || 0}%
- Top angle for AOV: ${aovIntel?.topAngleForAov || 'unknown'}
- Orders above $130: ${aovIntel?.aovOver160 || 0}

KEY BUSINESS CONTEXT:
- This is a one time purchase (OTP) business. No returning customers. Every acquisition must count.
- Gross margin is 30%. Breakeven ROAS is 3.33.
- Gender reveal ads fatigue fast (impulse, event driven, short consideration window).
- Budget scaling must stay under 20% per edit to avoid resetting Meta's learning phase.
- Josh operates this daily in under 15 minutes. Actions must be specific and immediately executable.
- Never auto execute. Always recommend with full reasoning.
`

  const systemPrompt = `You are the AI marketing agent for Gender Reveal Ideas. You analyse live Meta Ads data and produce specific, actionable recommendations.

You must output valid JSON only. No markdown, no explanation outside the JSON.

For each recommendation, output this structure:
{
  "actions": [
    {
      "action_type": "pause_ad|scale_budget|create_brief|flag_for_review|swap_creative",
      "action_title": "Short title shown to Josh",
      "action_summary": "One sentence plain English summary",
      "ai_reasoning": "Full reasoning with data points. Why this action, why now.",
      "ai_confidence": 1-10,
      "expected_outcome": "What will happen if approved",
      "risk_level": "low|medium|high",
      "entity_name": "Name of campaign/ad set/ad affected",
      "entity_id": "Meta ID if available",
      "entity_type": "campaign|ad_set|ad",
      "execution_payload": { "method": "pauseAd|updateAdSetBudget|etc", "params": {} }
    }
  ]
}

Rules:
- Maximum 5 actions per cycle
- Confidence below 6 gets a caution badge
- High risk actions (kill campaign, budget over $50 increase) need extra justification
- Budget increases must be exactly 15% (never exceed 20%)
- If performance is stable and on target, it is valid to recommend zero actions
- If you have no data, recommend "flag_for_review" with a request to wait for more data
- Learn from previous decision outcomes. If similar actions failed before, explain why this time is different.
- All dollar amounts in AUD`

  try {
    const result = await callClaude(systemPrompt, dataPayload)

    // Parse the JSON response
    let parsed
    try {
      // Handle case where Claude wraps JSON in markdown code blocks
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[Flywheel Intelligence] Failed to parse AI response as JSON')
      logFlywheelEvent('error', 'Decision engine returned non-JSON response')
      return []
    }

    const actions = parsed.actions || []
    const savedActions = []

    for (const action of actions) {
      const saved = addPendingAction({
        actionType: action.action_type,
        actionTitle: action.action_title,
        actionSummary: action.action_summary,
        aiReasoning: action.ai_reasoning,
        aiConfidence: action.ai_confidence,
        expectedOutcome: action.expected_outcome,
        riskLevel: action.risk_level,
        entityName: action.entity_name,
        entityId: action.entity_id,
        entityType: action.entity_type,
        executionPayload: action.execution_payload,
        triggerData: { summary, timestamp: new Date().toISOString() },
      })
      savedActions.push(saved)
      logFlywheelEvent('agent_recommendation', {
        action: action.action_title,
        confidence: action.ai_confidence,
        risk: action.risk_level,
      })
    }

    console.log(`[Flywheel Intelligence] Decision engine produced ${savedActions.length} recommendations`)
    return savedActions
  } catch (err) {
    console.error('[Flywheel Intelligence] Decision engine failed:', err.message)
    logFlywheelEvent('error', `Decision engine failed: ${err.message}`)
    return []
  }
}

// ── Execute Approved Action ─────────────────────────────────────────────────

export async function executeAction(action) {
  const { executionPayload } = action
  if (!executionPayload || !executionPayload.method) {
    return { success: false, error: 'No execution payload' }
  }

  // Dynamic import to avoid circular deps
  const meta = await import('./meta-api.js')

  try {
    let result
    switch (executionPayload.method) {
      case 'pauseAd':
        result = await meta.pauseAd(executionPayload.params?.adId)
        break
      case 'updateAdSetBudget':
        result = await meta.updateAdSetBudget(
          executionPayload.params?.adSetId,
          executionPayload.params?.newDailyBudget
        )
        break
      case 'updateCampaignBudget':
        result = await meta.updateCampaignBudget(
          executionPayload.params?.campaignId,
          executionPayload.params?.newDailyBudget
        )
        break
      case 'updateAdStatus':
        result = await meta.updateAdStatus(
          executionPayload.params?.adId,
          executionPayload.params?.status
        )
        break
      case 'updateAdSetStatus':
        result = await meta.updateAdSetStatus(
          executionPayload.params?.adSetId,
          executionPayload.params?.status
        )
        break
      case 'updateCampaignStatus':
        result = await meta.updateCampaignStatus(
          executionPayload.params?.campaignId,
          executionPayload.params?.status
        )
        break
      case 'flagCreativeSwap':
      case 'createBrief':
      case 'sendSlackBrief':
        // These are non-Meta-API actions, just log them
        result = { flagged: true, message: `${executionPayload.method} acknowledged` }
        break
      default:
        return { success: false, error: `Unknown method: ${executionPayload.method}` }
    }

    logFlywheelEvent('action_executed', {
      actionId: action.id,
      method: executionPayload.method,
      result,
    })

    return { success: true, result }
  } catch (err) {
    logFlywheelEvent('action_failed', {
      actionId: action.id,
      method: executionPayload.method,
      error: err.message,
    })
    return { success: false, error: err.message }
  }
}

// ── Measure Action Outcomes (runs 48-72 hours after execution) ──────────────

export async function measureActionOutcomes() {
  const { getPendingActions } = await import('./flywheel-store.js')
  const executed = getPendingActions('all').filter(a =>
    a.status === 'executed' &&
    a.executedAt &&
    !a.outcomeMeasuredAt &&
    new Date(a.executedAt) < new Date(Date.now() - 48 * 60 * 60 * 1000)
  )

  for (const action of executed) {
    // Get current metrics for the entity
    const snapshots = action.entityType === 'ad'
      ? getAdSnapshots(action.entityId, 3)
      : getAdSetSnapshots(action.entityId, 3)

    if (snapshots.length === 0) continue

    const recentRoas = snapshots.slice(-1)[0]?.roas || 0
    const recentCpa = snapshots.slice(-1)[0]?.cpa || 0
    const beforeRoas = action.triggerData?.summary?.weekRoas || 0
    const beforeCpa = action.triggerData?.summary?.weekCpa || 0

    const { recordActionOutcome } = await import('./flywheel-store.js')
    recordActionOutcome(action.id, {
      roasBefore: beforeRoas,
      roasAfter: recentRoas,
      cpaBefore: beforeCpa,
      cpaAfter: recentCpa,
      notes: recentRoas > beforeRoas ? 'ROAS improved' : 'ROAS declined',
      rating: recentRoas > beforeRoas ? 4 : 2,
    })

    // Feed into learning
    addAgentLearning({
      actionType: action.actionType,
      actionId: action.id,
      triggerConditions: action.triggerData,
      predictedOutcome: { expectedOutcome: action.expectedOutcome },
      actualOutcome: { roasBefore: beforeRoas, roasAfter: recentRoas, cpaBefore: beforeCpa, cpaAfter: recentCpa },
      predictionAccuracy: beforeRoas > 0 ? Math.round(Math.min(recentRoas / beforeRoas, beforeRoas / recentRoas) * 100) : 0,
      confidenceWas: action.aiConfidence,
      confidenceShouldBe: recentRoas > beforeRoas ? Math.min(10, (action.aiConfidence || 5) + 1) : Math.max(1, (action.aiConfidence || 5) - 1),
    })

    logFlywheelEvent('outcome_measured', {
      actionId: action.id,
      actionType: action.actionType,
      roasBefore: beforeRoas,
      roasAfter: recentRoas,
      improved: recentRoas > beforeRoas,
    })
  }
}
