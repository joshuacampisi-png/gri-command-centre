/**
 * fatigue-alert-cron.js
 * Runs every 4 hours. Detects ad fatigue transitions and sends Telegram alerts to Josh.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fetchFullPerformance } from './meta-api.js'
import { calculateFatigueScore, prepareFatigueMetrics, buildFatigueReport } from './fatigue-engine.js'
import { sendTelegramMessage } from '../connectors/telegram.js'
import { dataFile } from './data-dir.js'

const ALERTS_FILE = dataFile('flywheel/fatigue-alerts.json')
const PREV_SCORES_FILE = dataFile('flywheel/fatigue-prev-scores.json')
const JOSH_CHAT_ID = '8040702286'

function loadJSON(file) {
  if (!existsSync(file)) return []
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return [] }
}

function saveJSON(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2))
}

/**
 * Run fatigue check. Compare current scores to previous, alert on transitions.
 */
export async function runFatigueCheck() {
  console.log('[FatigueAlert] Running fatigue check...')

  try {
    const perfData = await fetchFullPerformance('last_7d')
    const campaigns = perfData.campaigns || []

    const prevScores = loadJSON(PREV_SCORES_FILE)
    const prevMap = new Map(prevScores.map(s => [s.adId, s]))
    const alerts = loadJSON(ALERTS_FILE)
    const newScores = []
    const newAlerts = []

    for (const campaign of campaigns) {
      for (const ad of campaign.ads || []) {
        const metrics = prepareFatigueMetrics(ad)
        const report = buildFatigueReport(metrics)
        const adId = ad.id

        newScores.push({
          adId,
          adName: ad.name,
          campaignName: campaign.name,
          score: report.score,
          status: report.status,
          checkedAt: new Date().toISOString()
        })

        const prev = prevMap.get(adId)

        // Alert conditions:
        // 1. Transition from HEALTHY/FRESH → WATCH or worse
        // 2. Transition to FATIGUING or DEAD
        // 3. New ad appearing as already fatiguing

        const prevStatus = prev?.status || 'HEALTHY'
        const SEVERITY_ORDER = ['HEALTHY', 'WATCH', 'FATIGUING', 'DEAD']
        const prevIdx = SEVERITY_ORDER.indexOf(prevStatus)
        const currIdx = SEVERITY_ORDER.indexOf(report.status)

        if (currIdx > prevIdx && currIdx >= 2) {
          // Significant degradation
          const alert = {
            id: `fatigue-${adId}-${Date.now()}`,
            adId,
            adName: ad.name,
            campaignName: campaign.name,
            previousStatus: prevStatus,
            currentStatus: report.status,
            score: report.score,
            signals: report.signals,
            recommendation: report.recommendation,
            daysRemaining: report.daysRemaining,
            frequency: report.frequency,
            acknowledged: false,
            createdAt: new Date().toISOString()
          }
          newAlerts.push(alert)

          // Send Telegram
          const emoji = report.status === 'DEAD' ? '\u26A0\uFE0F' : '\uD83D\uDFE1'
          const msg = [
            `${emoji} *Ad Fatigue Alert*`,
            ``,
            `Ad: *${ad.name}*`,
            `Campaign: ${campaign.name}`,
            `Status: ${prevStatus} \u2192 *${report.status}*`,
            `Score: ${report.score}/100`,
            report.daysRemaining != null ? `Est. days left: ${report.daysRemaining}` : '',
            ``,
            `Signals:`,
            ...report.signals.map(s => `\u2022 ${s}`),
            ``,
            `Recommendation: ${report.recommendation}`,
          ].filter(Boolean).join('\n')

          try {
            await sendTelegramMessage({
              chatId: JOSH_CHAT_ID,
              text: msg,
            })
            console.log(`[FatigueAlert] Telegram sent for ${ad.name}`)
          } catch (e) {
            console.error(`[FatigueAlert] Telegram failed:`, e.message)
          }
        }
      }
    }

    // Save updated scores and alerts
    saveJSON(PREV_SCORES_FILE, newScores)
    if (newAlerts.length > 0) {
      alerts.push(...newAlerts)
      // Keep only last 100 alerts
      const trimmed = alerts.slice(-100)
      saveJSON(ALERTS_FILE, trimmed)
    }

    console.log(`[FatigueAlert] Check complete. ${newAlerts.length} new alerts.`)
    return { ok: true, newAlerts: newAlerts.length, totalAds: newScores.length }
  } catch (err) {
    console.error('[FatigueAlert] Error:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Get unacknowledged fatigue alerts.
 */
export function getUnacknowledgedAlerts() {
  const alerts = loadJSON(ALERTS_FILE)
  return alerts.filter(a => !a.acknowledged)
}

/**
 * Get all fatigue alerts.
 */
export function getAllAlerts() {
  return loadJSON(ALERTS_FILE)
}

/**
 * Acknowledge a fatigue alert.
 */
export function acknowledgeAlert(alertId) {
  const alerts = loadJSON(ALERTS_FILE)
  const alert = alerts.find(a => a.id === alertId)
  if (!alert) return false
  alert.acknowledged = true
  alert.acknowledgedAt = new Date().toISOString()
  saveJSON(ALERTS_FILE, alerts)
  return true
}

/**
 * Start the fatigue alert cron (runs every 4 hours).
 */
export function startFatigueAlertCron() {
  // Run once on startup after 2 min delay (let other systems init)
  // Startup check disabled — saves Meta API calls on deploy
  // setTimeout(() => runFatigueCheck(), 2 * 60 * 1000)

  // Then every 4 hours
  const FOUR_HOURS = 4 * 60 * 60 * 1000
  setInterval(() => runFatigueCheck(), FOUR_HOURS)

  console.log('[FatigueAlert] Cron started (every 4 hours)')
}
