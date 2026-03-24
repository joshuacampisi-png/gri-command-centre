/**
 * Competitor Intelligence Cron
 * Every Monday 4am AEST: runs organic, Google Ads, and Meta scans
 * Then checks for alerts and sends Telegram notifications
 */

import cron from 'node-cron'
import { runOrganicScan, getTopKeywordsByVolume } from './organic-scan.js'
import { runGoogleAdsScan } from './google-ads-intel.js'
import { runMetaAdsScan } from './meta-ads-scraper.js'
import { runAlertChecks } from './competitor-alerts.js'
import { env } from './env.js'

const JOSH_CHAT = env.telegram?.joshChatId || '8040702286'

// The 26 tracked gender reveal keywords
const TRACKED_KEYWORDS = [
  'gender reveal', 'gender reveal ideas', 'gender reveal party',
  'gender reveal box', 'gender reveal balloons', 'gender reveal cake',
  'gender reveal smoke', 'gender reveal confetti', 'gender reveal cannon',
  'gender reveal poppers', 'gender reveal fireworks', 'gender reveal powder',
  'gender reveal games', 'gender reveal decorations', 'gender reveal invitations',
  'gender reveal photoshoot', 'gender reveal outfit', 'gender reveal gifts',
  'gender reveal themes', 'gender reveal australia', 'unique gender reveal ideas',
  'creative gender reveal', 'big gender reveal ideas', 'outdoor gender reveal',
  'indoor gender reveal', 'gender reveal volcano cannon',
]

async function sendTelegram(message) {
  if (!env.telegram?.botToken) return
  try {
    await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: JOSH_CHAT, text: message, parse_mode: 'Markdown' }),
    })
  } catch {}
}

/**
 * Run the full Monday competitor intelligence scan
 */
export async function runFullCompetitorScan() {
  const startTime = Date.now()
  console.log('[CompIntelCron] Starting full Monday competitor scan...')

  let organicResult, paidResult, metaResult

  try {
    // Step 1: Get top keywords by volume for paid search scanning
    console.log('[CompIntelCron] Step 1: Getting top keywords by volume...')
    const topKeywords = await getTopKeywordsByVolume(TRACKED_KEYWORDS, 15)
    const paidScanKeywords = topKeywords.map(k => k.keyword)
    console.log(`[CompIntelCron] Top ${paidScanKeywords.length} keywords selected for paid scan`)

    // Step 2: Organic scan (daily keywords — use all 26)
    console.log('[CompIntelCron] Step 2: Running organic rankings scan...')
    organicResult = await runOrganicScan(TRACKED_KEYWORDS)
    console.log(`[CompIntelCron] Organic scan: ${organicResult.keywords.length} keywords`)

    // Step 3: Google Ads scan (weekly — use top 15 by volume)
    console.log('[CompIntelCron] Step 3: Running Google Ads intelligence scan...')
    paidResult = await runGoogleAdsScan(paidScanKeywords)
    console.log(`[CompIntelCron] Google Ads scan complete`)

    // Step 4: Meta Ad Library scan (monthly — runs every 4th Monday)
    const weekOfMonth = Math.ceil(new Date().getDate() / 7)
    if (weekOfMonth === 1) {
      console.log('[CompIntelCron] Step 4: Running Meta Ad Library scan (monthly)...')
      metaResult = await runMetaAdsScan()
      console.log(`[CompIntelCron] Meta scan: ${metaResult.totalAdsFound} ads found`)
    } else {
      console.log('[CompIntelCron] Step 4: Skipping Meta scan (runs 1st Monday of month)')
    }

    // Step 5: Run alert checks
    console.log('[CompIntelCron] Step 5: Checking for alerts...')
    const alerts = await runAlertChecks()

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    const summary = formatScanSummary(organicResult, paidResult, metaResult, alerts, elapsed)
    await sendTelegram(summary)

    console.log(`[CompIntelCron] Full scan complete in ${elapsed}s`)
    return { organicResult, paidResult, metaResult, alerts, elapsed }
  } catch (e) {
    console.error('[CompIntelCron] Scan failed:', e)
    await sendTelegram(`❌ *Competitor Scan Failed*\n\nError: ${e.message}`)
    throw e
  }
}

function formatScanSummary(organic, paid, meta, alerts, elapsed) {
  let msg = `✅ *Weekly Competitor Scan Complete* (${elapsed}s)\n\n`

  if (organic) {
    const griSummary = organic.summary?.gri
    msg += `*Organic Rankings:*\n`
    msg += `• Keywords scanned: ${organic.keywords.length}\n`
    if (griSummary) {
      msg += `• GRI: ${griSummary.top3} top-3, ${griSummary.top10} top-10, avg #${griSummary.avgRank}\n`
    }
    msg += '\n'
  }

  if (paid) {
    const griPaid = paid.competitors?.gri
    msg += `*Google Ads Intel:*\n`
    msg += `• GRI visibility: ${griPaid?.visibilityShare || 0}%\n`
    msg += `• Market ad spend est: $${(paid.totalEstimatedMarketSpend || 0).toFixed(0)}\n`
    msg += '\n'
  }

  if (meta) {
    msg += `*Meta Ads:*\n`
    msg += `• Total ads found: ${meta.totalAdsFound}\n`
    msg += '\n'
  }

  if (alerts.length > 0) {
    msg += `🔔 *${alerts.length} alerts sent separately*\n`
  } else {
    msg += `No new alerts this week\n`
  }

  return msg
}

/**
 * Schedule the weekly Monday scan
 */
export function scheduleCompetitorIntelCron() {
  // Every Monday at 4am AEST (Brisbane timezone)
  cron.schedule('0 4 * * 1', async () => {
    await runFullCompetitorScan()
  }, {
    timezone: 'Australia/Brisbane',
  })

  console.log('[CompIntelCron] Weekly competitor intelligence scan scheduled (Mondays 4am AEST)')
}
