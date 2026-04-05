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
} from './gads-agent-store.js'
import {
  enableCampaign, enableKeyword, pauseKeyword, removeCampaignNegativeKeyword,
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

async function revertChange(rec) {
  const proposed = rec.proposedChange || {}
  const execution = rec.executionResult || {}

  switch (proposed.action) {
    case 'PAUSE_CAMPAIGN':
      return await enableCampaign(rec.entityId)
    case 'PAUSE_KEYWORD':
      return await enableKeyword(proposed.adGroupId, rec.entityId)
    case 'ADD_NEGATIVE_KEYWORD':
      // Use the resourceName captured at execution time
      if (execution?.resourceName) {
        return await removeCampaignNegativeKeyword(execution.resourceName)
      }
      return { ok: false, error: 'No resourceName stored for negative keyword — cannot auto-revert' }
    case 'INCREASE_BID':
      // For now, revert-bid is flagged for manual intervention because we
      // would need the exact previous bid micros to restore precisely.
      return { ok: false, error: 'Bid revert requires manual intervention — previous bid not stored' }
    default:
      return { ok: false, error: `No revert handler for action ${proposed.action}` }
  }
}

// ── Main entry: run accuracy checks for all due completed recommendations ──

export async function runAccuracyChecks() {
  const cfg = getConfig()
  const completed = getRecommendations('completed').filter(r => {
    if (r.accuracyCheckedAt) return false // already checked
    if (!r.accuracyCheckDueAt) return false
    return new Date(r.accuracyCheckDueAt) <= new Date()
  })

  if (completed.length === 0) {
    return { checked: 0, reverted: 0, confirmed: 0 }
  }

  const [campaigns, keywords] = await Promise.all([
    getCampaignPerformance(),
    getKeywordPerformance(),
  ])

  let reverted = 0
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
      } else {
        // Revert
        const revertResult = await revertChange(rec)
        reverted++
        updateRecommendation(rec.id, {
          status: 'reverted',
          accuracyCheckedAt: new Date().toISOString(),
          actualDollarImpact: Number(actual.toFixed(2)),
          accuracyDelta: Number(delta.toFixed(2)),
          accuracyNote: note,
          revertedAt: new Date().toISOString(),
          revertReason: `Projected $${rec.projectedDollarImpact} AUD did not materialise (actual $${actual.toFixed(2)}). ${note}`,
          revertResult,
        })
        logAudit('reverted', {
          projected: rec.projectedDollarImpact,
          actual,
          note,
          revertResult,
        }, rec.id, 'agent')

        await notifyTelegram(
          `🔄 *Google Ads Agent Auto-Revert*\n\n` +
          `*Issue:* ${rec.issueTitle}\n` +
          `*Projected:* $${rec.projectedDollarImpact?.toFixed(2)} AUD ${rec.projectedImpactDirection}\n` +
          `*Actual:* $${actual.toFixed(2)} AUD\n` +
          `*Reason:* ${note}\n` +
          `*Revert result:* ${revertResult?.ok ? (revertResult.dryRun ? 'dry-run' : 'executed') : 'failed — ' + revertResult?.error}`
        )
      }
    } catch (err) {
      console.error('[GadsRevert] Accuracy check error for rec', rec.id, err.message)
      logAudit('accuracy_check_error', { error: err.message }, rec.id, 'agent')
    }
  }

  return { checked: completed.length, reverted, confirmed }
}
