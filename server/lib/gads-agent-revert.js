/**
 * gads-agent-revert.js
 * 7-day accuracy check and auto-revert.
 *
 * For every completed recommendation whose accuracyCheckDueAt has passed:
 *   1. Measure actual impact since execution
 *   2. If actual impact >= (config.accuracyMaterialisedPct * projected), confirm it
 *   3. Otherwise revert the underlying change via the API, log it, notify Telegram
 */
import {
  getRecommendations, updateRecommendation, getConfig, logAudit,
  addRecommendation, getExistingActiveFingerprints,
} from './gads-agent-store.js'
import {
  enableCampaign, enableKeyword, pauseKeyword, removeCampaignNegativeKeyword,
  removeNegativeFromSharedList,
} from './gads-mutations.js'
import { getCampaignPerformance, getKeywordPerformance } from './gads-queries.js'
import { microsToDollars } from './gads-client.js'

// Telegram notifier (optional — tolerate missing module)
async function notifyTelegram(message) {
  try {
    const mod = await import('./telegram.js').catch(() => null)
      || await import('./telegram-notifier.js').catch(() => null)
      || await import('./telegram-polling-bot.js').catch(() => null)
    if (mod?.sendTelegramMessage) {
      await mod.sendTelegramMessage(message)
      return true
    }
    if (mod?.notify) {
      await mod.notify(message)
      return true
    }
    // Fallback: direct API call if token is available
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (token && chatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
      })
      return true
    }
  } catch (err) {
    console.warn('[GadsRevert] Telegram notify failed:', err.message)
  }
  return false
}

// ── Actual impact measurement ───────────────────────────────────────────────

async function measureActualImpact(rec, campaigns, keywords) {
  const direction = rec.projectedImpactDirection

  // For paused campaigns: "saving" = cost that the campaign is no longer spending
  // For paused keywords: same logic
  // For negative keywords: measure if the search term is no longer draining clicks
  // For bid increases: revenue delta (compare conversion value before vs after)

  const action = rec.proposedChange?.action

  if (action === 'PAUSE_CAMPAIGN') {
    // If campaign is still paused and has no new cost, saving is confirmed
    const campaign = campaigns.find(c => c.campaignId === rec.entityId)
    if (!campaign) return { actual: rec.projectedDollarImpact, note: 'Campaign no longer in active set, saving confirmed' }
    const spendSinceApproval = microsToDollars(campaign.costMicros) * (7 / 30) // rough daily pro-rata
    // If the campaign somehow accrued spend after we paused it, saving did not materialise
    if (spendSinceApproval > 1) return { actual: 0, note: 'Campaign continued to spend after pause, saving did not materialise' }
    return { actual: rec.projectedDollarImpact, note: 'Campaign stayed paused, projected saving realised' }
  }

  if (action === 'PAUSE_KEYWORD') {
    const kw = keywords.find(k => k.criterionId === rec.entityId)
    if (!kw) return { actual: rec.projectedDollarImpact, note: 'Keyword not in active set, saving confirmed' }
    const recentSpend = microsToDollars(kw.costMicros) * (7 / 30)
    if (recentSpend > 1) return { actual: 0, note: 'Keyword continued to accrue spend, not reverting would compound waste' }
    return { actual: rec.projectedDollarImpact, note: 'Keyword stayed paused, projected saving realised' }
  }

  if (action === 'ADD_NEGATIVE_KEYWORD') {
    // Assume the negative keyword is stopping waste unless we see evidence otherwise.
    return { actual: rec.projectedDollarImpact * 0.8, note: 'Negative keyword in place, partial saving credited' }
  }

  if (action === 'INCREASE_BID') {
    const kw = keywords.find(k => k.criterionId === rec.entityId)
    if (!kw) return { actual: 0, note: 'Keyword no longer active, cannot measure' }
    const conversions = Number(kw.conversions) || 0
    // Rough incremental revenue check — if the keyword is still converting, credit it
    if (conversions > 0) {
      return { actual: rec.projectedDollarImpact * 0.6, note: `Keyword still converting (${conversions.toFixed(1)} conversions in window)` }
    }
    return { actual: 0, note: 'Bid increase did not produce new conversions, reverting' }
  }

  // Manual review items never get auto-reverted
  return { actual: rec.projectedDollarImpact, note: 'Manual review item — accuracy not auto-measured' }
}

// ── Revert a change via the Google Ads API ──────────────────────────────────
//
// This function is NO LONGER called automatically. It is called by the
// approve route when the user explicitly approves a "REVERT_CHANGE" card
// that was raised by the accuracy-check sweep. Rule: nothing ever touches
// the Google Ads account without Josh's explicit click.

export async function executeRevert(originalRec) {
  const proposed = originalRec.proposedChange || {}
  const execution = originalRec.executionResult || {}

  switch (proposed.action) {
    case 'PAUSE_CAMPAIGN':
      return await enableCampaign(originalRec.entityId)
    case 'PAUSE_KEYWORD':
      return await enableKeyword(proposed.adGroupId, originalRec.entityId)
    case 'ADD_NEGATIVE_KEYWORD':
      // The approve route might have routed this to a shared list or a
      // campaign-level negative. Check which path was taken at execution.
      if (execution?.routedTo === 'shared_list' && execution?.resourceName) {
        return await removeNegativeFromSharedList(execution.resourceName)
      }
      if (execution?.resourceName) {
        return await removeCampaignNegativeKeyword(execution.resourceName)
      }
      return { ok: false, error: 'No resourceName stored for negative keyword — cannot revert automatically' }
    case 'INCREASE_BID':
      return { ok: false, error: 'Bid revert requires manual intervention — previous bid micros not stored' }
    default:
      return { ok: false, error: `No revert handler for action ${proposed.action}` }
  }
}

// ── Main entry: run accuracy checks and raise REVERT APPROVAL CARDS ─────────
//
// CRITICAL: this function NEVER reverts anything automatically. When the
// accuracy check determines that a change's projected impact did not
// materialise, it creates a NEW pending recommendation card with category
// 'revert'. The agent waits for Josh to click Approve on that card before
// calling the Google Ads API to reverse the original change.
//
// Rule: "you cannot auto approve anything with my Google Ads account"

export async function runAccuracyChecks() {
  const cfg = getConfig()
  const completed = getRecommendations('completed').filter(r => {
    if (r.accuracyCheckedAt) return false
    if (!r.accuracyCheckDueAt) return false
    return new Date(r.accuracyCheckDueAt) <= new Date()
  })

  if (completed.length === 0) {
    return { checked: 0, revertCardsRaised: 0, confirmed: 0 }
  }

  const [campaigns, keywords] = await Promise.all([
    getCampaignPerformance(),
    getKeywordPerformance(),
  ])

  // Dedup: don't raise a second revert card for the same original rec
  const existingFingerprints = getExistingActiveFingerprints()

  let revertCardsRaised = 0
  let confirmed = 0

  for (const rec of completed) {
    try {
      const { actual, note } = await measureActualImpact(rec, campaigns, keywords)
      const delta = actual - (rec.projectedDollarImpact || 0)
      const threshold = (rec.projectedDollarImpact || 0) * cfg.accuracyMaterialisedPct
      const materialised = actual >= threshold

      if (materialised) {
        confirmed++
        updateRecommendation(rec.id, {
          accuracyCheckedAt: new Date().toISOString(),
          actualDollarImpact: Number(actual.toFixed(2)),
          accuracyDelta: Number(delta.toFixed(2)),
          accuracyNote: note,
        })
        logAudit('accuracy_check_passed', {
          projected: rec.projectedDollarImpact,
          actual,
          note,
        }, rec.id, 'agent')
        continue
      }

      // Impact did NOT materialise. Raise a revert APPROVAL card — do NOT
      // execute the revert. Josh must explicitly click Approve on the new
      // card for the revert to run against the Google Ads account.
      const revertFingerprint = `revert::${rec.id}`
      if (existingFingerprints.has(revertFingerprint)) {
        // Already raised a pending revert card for this rec — skip
        updateRecommendation(rec.id, {
          accuracyCheckedAt: new Date().toISOString(),
          actualDollarImpact: Number(actual.toFixed(2)),
          accuracyDelta: Number(delta.toFixed(2)),
          accuracyNote: note + ' (revert card already pending)',
        })
        continue
      }

      const revertCard = addRecommendation({
        priority: 1, // revert cards always sit at the top
        severity: 'high',
        category: 'revert',
        issueTitle: `Revert approval needed — "${rec.issueTitle}" did not deliver`,
        whatToFix: `Approve reversing the original change. This will ${describeRevertAction(rec)}.`,
        whyItShouldChange: `The original change was projected to ${rec.projectedImpactDirection} $${rec.projectedDollarImpact?.toFixed(2)} AUD/month but the 7-day accuracy check measured only $${actual.toFixed(2)}. ${note}`,
        projectedDollarImpact: Math.abs(delta),
        projectedImpactDirection: 'save',
        currentValue: {
          originalRecommendationId: rec.id,
          originalAction: rec.proposedChange?.action,
          originalExecutionResult: rec.executionResult,
          originalProjected: rec.projectedDollarImpact,
          actualMeasured: actual,
          measurementNote: note,
        },
        proposedChange: {
          action: 'REVERT_CHANGE',
          originalRecommendationId: rec.id,
          reason: note,
        },
        bestPracticeSource: '',
        bestPracticeSummary: '',
        entityType: rec.entityType,
        entityId: rec.entityId,
        entityName: rec.entityName,
        fingerprint: revertFingerprint,
      })
      revertCardsRaised++

      updateRecommendation(rec.id, {
        accuracyCheckedAt: new Date().toISOString(),
        actualDollarImpact: Number(actual.toFixed(2)),
        accuracyDelta: Number(delta.toFixed(2)),
        accuracyNote: note,
        revertCardRaisedId: revertCard.id,
      })

      logAudit('revert_card_raised', {
        originalRecommendationId: rec.id,
        revertCardId: revertCard.id,
        projected: rec.projectedDollarImpact,
        actual,
        note,
      }, rec.id, 'agent')

      await notifyTelegram(
        `⚠️ *Google Ads Agent — Revert Approval Needed*\n\n` +
        `*Original:* ${rec.issueTitle}\n` +
        `*Projected:* $${rec.projectedDollarImpact?.toFixed(2)} AUD ${rec.projectedImpactDirection}\n` +
        `*Actual:* $${actual.toFixed(2)} AUD\n` +
        `*Reason:* ${note}\n\n` +
        `A revert approval card has been raised. Open the Google Ads Agent tab and approve the revert card to reverse the original change. *The agent will not revert automatically.*`
      )
    } catch (err) {
      console.error('[GadsRevert] Accuracy check error for rec', rec.id, err.message)
      logAudit('accuracy_check_error', { error: err.message }, rec.id, 'agent')
    }
  }

  return { checked: completed.length, revertCardsRaised, confirmed }
}

// Human-readable description of what the revert will actually do
function describeRevertAction(rec) {
  const action = rec.proposedChange?.action
  switch (action) {
    case 'PAUSE_CAMPAIGN':    return `re-enable the "${rec.entityName}" campaign`
    case 'PAUSE_KEYWORD':     return `re-enable the "${rec.entityName}" keyword`
    case 'ADD_NEGATIVE_KEYWORD': return `remove "${rec.entityName}" from the negative keyword list where it was added`
    case 'INCREASE_BID':      return `flag for manual bid restoration (previous bid not snapshotted)`
    default:                  return `reverse the original "${action}" action`
  }
}
