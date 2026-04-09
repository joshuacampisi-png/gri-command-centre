/**
 * winner-scout.js
 * Winner detection, underperformer detection, AI analysis, and Telegram notifications.
 * Runs daily at 10am AEST after impact measurement.
 *
 * Winner = CPA ≤ $25, purchases ≥ 3, frequency < 4 over 7 days.
 * Strong winner = CPA ≤ $15, purchases ≥ 5.
 * Underperformer = 7d CPA > baseline * 1.5 OR 7d ROAS < baseline * 0.6.
 */
import {
  getAdActivations, markActivationAsWinner, markActivationAsUnderperformer,
  setActivationVerdict, addWinnerLogEntry, getWinnerLog,
  logFlywheelEvent
} from './flywheel-store.js'
import { getCreativeLeaderboard } from './flywheel-engine.js'
import { callClaude } from './claude-guard.js'
import { sendTelegramMessage } from '../connectors/telegram.js'

const JOSH_CHAT_ID = '8040702286'
const WINNER_CPA = 25
const STRONG_WINNER_CPA = 15
const WINNER_MIN_PURCHASES = 3
const STRONG_WINNER_MIN_PURCHASES = 5
const WINNER_MAX_FREQUENCY = 4
const UNDERPERFORM_CPA_MULTIPLIER = 1.5
const UNDERPERFORM_ROAS_MULTIPLIER = 0.6

/**
 * Scan creative leaderboard for winners. Ping Josh with data-backed reasons.
 */
export async function detectWinners() {
  console.log('[WinnerScout] Scanning for winners...')
  const leaderboard = getCreativeLeaderboard()
  const winners = []
  const existingLog = getWinnerLog()
  const recentWinnerIds = new Set(
    existingLog.filter(w => new Date(w.detectedAt) > new Date(Date.now() - 7 * 86400000)).map(w => w.adId)
  )

  for (const cr of leaderboard) {
    if (cr.cpa7d <= 0 || cr.purchases < WINNER_MIN_PURCHASES) continue
    if (cr.cpa7d > WINNER_CPA) continue
    if (cr.frequency >= WINNER_MAX_FREQUENCY) continue

    // Already logged this week — skip
    if (recentWinnerIds.has(cr.adId)) continue

    const isStrong = cr.cpa7d <= STRONG_WINNER_CPA && cr.purchases >= STRONG_WINNER_MIN_PURCHASES

    // Get AI analysis of WHY this ad is winning
    let reason = '', scaleRecommendation = ''
    try {
      const analysis = await analyseWinner(cr)
      reason = analysis.reason || ''
      scaleRecommendation = analysis.scaleRecommendation || ''
    } catch (e) {
      reason = `CPA $${cr.cpa7d} with ${cr.purchases} purchases in 7 days. Frequency ${cr.frequency} is healthy.`
      scaleRecommendation = 'Consider scaling budget 15% if stable for 3+ more days.'
    }

    // Log the winner
    const entry = addWinnerLogEntry({
      adId: cr.adId,
      adName: cr.name,
      campaignName: cr.campaignName || '',
      adSetName: cr.adSetName || '',
      cpa: cr.cpa7d,
      roas: cr.roas7d,
      spend: cr.spend,
      purchases: cr.purchases,
      frequency: cr.frequency,
      thumbstopPct: cr.thumbstopPct || 0,
      sustainPct: cr.sustainPct || 0,
      hookToClickPct: cr.hookToClickPct || 0,
      reason,
      angle: cr.creativeAngle || 'unknown',
      formatType: cr.formatType || 'unknown',
      audience: cr.audience || 'unknown',
      actionTaken: 'noted',
      isStrong,
    })

    // Also mark any matching activation as winner
    const activations = getAdActivations()
    const matching = activations.find(a => a.adId === cr.adId && a.status === 'complete')
    if (matching) markActivationAsWinner(matching.id, reason)

    winners.push({ ...entry, scaleRecommendation })

    // Telegram ping
    await pingWinner(cr, reason, scaleRecommendation, isStrong)

    logFlywheelEvent('winner_detected', {
      adId: cr.adId, adName: cr.name, cpa: cr.cpa7d, roas: cr.roas7d,
      purchases: cr.purchases, reason, isStrong,
    })
  }

  console.log(`[WinnerScout] ${winners.length} new winners detected.`)
  return winners
}

/**
 * Scan completed activations for underperformers.
 */
export async function detectUnderperformers() {
  console.log('[WinnerScout] Scanning for underperformers...')
  const activations = getAdActivations('complete')
  const underperformers = []

  for (const a of activations) {
    // Skip already judged
    if (a.verdict && a.verdict !== 'tracking') continue

    const impact7d = a.impact?.['7d']
    if (!impact7d) continue

    const baseline = a.baseline || {}
    const cpaDegraded = baseline.cpa > 0 && impact7d.cpa > baseline.cpa * UNDERPERFORM_CPA_MULTIPLIER
    const roasDegraded = baseline.roas > 0 && impact7d.roas < baseline.roas * UNDERPERFORM_ROAS_MULTIPLIER

    if (cpaDegraded || roasDegraded) {
      markActivationAsUnderperformer(a.id)
      underperformers.push(a)
      await pingUnderperformer(a, impact7d, baseline)
      logFlywheelEvent('underperformer_detected', {
        adId: a.adId, adName: a.adName,
        baselineCpa: baseline.cpa, currentCpa: impact7d.cpa,
        baselineRoas: baseline.roas, currentRoas: impact7d.roas,
      })
    } else {
      // Not an underperformer — mark as neutral or winner
      if (impact7d.cpa > 0 && impact7d.cpa <= WINNER_CPA && (a.impact?.['7d']?.delta?.cpaDirection === 'improved')) {
        setActivationVerdict(a.id, 'winner')
      } else {
        setActivationVerdict(a.id, 'neutral')
      }
    }
  }

  console.log(`[WinnerScout] ${underperformers.length} underperformers detected.`)
  return underperformers
}

/**
 * AI analysis: why is this ad winning?
 */
async function analyseWinner(cr) {
  const prompt = `You are a Meta Ads performance analyst for Gender Reveal Ideas (Australian DTC gender reveal products).

An ad is winning. Analyse the data and tell me WHY in 2-3 specific, data-backed sentences.

Ad: ${cr.name}
Angle: ${cr.creativeAngle || 'unknown'}
Format: ${cr.formatType || 'unknown'}

7-day metrics:
- CPA: $${cr.cpa7d} AUD (target: $25, breakeven: $50.74)
- ROAS: ${cr.roas7d}x
- Spend: $${cr.spend}
- Purchases: ${cr.purchases}
- Frequency: ${cr.frequency}
- Thumbstop rate: ${cr.thumbstopPct || 0}% (benchmark: 25%)
- Sustain rate: ${cr.sustainPct || 0}% (watched to 95%)
- Hook-to-click: ${cr.hookToClickPct || 0}%
- AOV: $${cr.avgAov || 0}

Analyse: Is it the hook (thumbstop)? The watch time (sustain)? The audience match? The offer? The creative format? Be specific with numbers.

Also give a 1-sentence scale recommendation.

JSON only:
{ "reason": "2-3 sentences explaining why", "scaleRecommendation": "1 sentence", "confidence": 1-10 }`

  const res = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }]
  }, 'winner-scout-analysis')

  const text = res.content[0].text.trim()
  try {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : JSON.parse(text)
  } catch {
    return { reason: text, scaleRecommendation: '', confidence: 5 }
  }
}

/**
 * Telegram: winner detected
 */
async function pingWinner(cr, reason, scaleRec, isStrong) {
  const emoji = isStrong ? '\uD83C\uDFC6\uD83C\uDFC6' : '\uD83C\uDFC6'
  const msg = [
    `${emoji} ${isStrong ? 'STRONG ' : ''}WINNER DETECTED`,
    ``,
    `Ad: *${cr.name}*`,
    `Angle: ${cr.creativeAngle || 'unknown'} | Format: ${cr.formatType || 'unknown'}`,
    ``,
    `CPA: *$${cr.cpa7d}* (target: $25)`,
    `ROAS: *${cr.roas7d}x*`,
    `Purchases: ${cr.purchases} in 7 days`,
    `Spend: $${cr.spend}`,
    `Frequency: ${cr.frequency}`,
    ``,
    `WHY IT'S WINNING:`,
    reason,
    ``,
    `RECOMMENDATION: ${scaleRec}`,
  ].join('\n')

  try {
    await sendTelegramMessage({ chatId: JOSH_CHAT_ID, text: msg })
  } catch (e) {
    console.error('[WinnerScout] Telegram ping failed:', e.message)
  }
}

/**
 * Telegram: underperformer detected
 */
async function pingUnderperformer(activation, impact7d, baseline) {
  const cpaDelta = baseline.cpa > 0 ? ((impact7d.cpa - baseline.cpa) / baseline.cpa * 100).toFixed(0) : '??'
  const msg = [
    `\u26A0\uFE0F REPLACEMENT UNDERPERFORMED`,
    ``,
    `Ad: *${activation.adName}*`,
    `Baseline CPA: $${baseline.cpa} \u2192 Current: $${impact7d.cpa} (+${cpaDelta}%)`,
    `Baseline ROAS: ${baseline.roas}x \u2192 Current: ${impact7d.roas}x`,
    ``,
    `This creative swap made things worse.`,
    `Action: Open Flywheel \u2192 Pause & Replace again with a different angle.`,
  ].join('\n')

  try {
    await sendTelegramMessage({ chatId: JOSH_CHAT_ID, text: msg })
  } catch (e) {
    console.error('[WinnerScout] Telegram underperformer ping failed:', e.message)
  }
}
