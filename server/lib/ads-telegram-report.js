/**
 * ads-telegram-report.js
 * Daily Meta Ads performance report sent to Telegram.
 */
import { sendTelegramMessage } from '../connectors/telegram.js'
import { fetchFullPerformance } from './meta-api.js'
import { calculateFatigueScore, prepareFatigueMetrics, scoreToStatus } from './fatigue-engine.js'
import { callClaude } from './claude-guard.js'
import { readFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const JOSH_CHAT = process.env.TELEGRAM_JOSH_CHAT_ID || '8040702286'

export async function sendAdsDailyReport() {
  try {
    const campaigns = await fetchFullPerformance('today')
    const yesterdayCampaigns = await fetchFullPerformance('yesterday').catch(() => null)

    // Aggregate today's totals
    const today = aggregateMetrics(campaigns)
    const yesterday = yesterdayCampaigns ? aggregateMetrics(yesterdayCampaigns) : null

    // Score all ads
    const allAds = []
    for (const c of campaigns) {
      for (const ad of c.ads || []) {
        if (ad.status !== 'ACTIVE') continue
        const metrics = prepareFatigueMetrics(ad)
        const fatigue = calculateFatigueScore(metrics)
        allAds.push({ ...ad, fatigue, campaignName: c.name })
      }
    }

    const healthy = allAds.filter(a => a.fatigue.status === 'HEALTHY').length
    const watch = allAds.filter(a => a.fatigue.status === 'WATCH').length
    const fatiguing = allAds.filter(a => a.fatigue.status === 'FATIGUING').length
    const dead = allAds.filter(a => a.fatigue.status === 'DEAD').length

    // Action items
    const actionAds = allAds.filter(a => a.fatigue.score < 50)
    const actionLines = actionAds.length > 0
      ? actionAds.map(a =>
          `• ${a.name} — ROAS ${a.insights?.roas?.toFixed(2) || '?'}, Freq ${a.insights?.frequency?.toFixed(1) || '?'} → ${a.fatigue.signals[0] || 'Replace creative'}`
        ).join('\n')
      : '✅ No immediate action required'

    // Top performer
    const topAd = allAds.sort((a, b) => (b.insights?.roas || 0) - (a.insights?.roas || 0))[0]
    const topLine = topAd
      ? `🏆 ${topAd.name} — ROAS ${topAd.insights?.roas?.toFixed(2)}, CPA $${topAd.insights?.cpa?.toFixed(2)}, CTR ${topAd.insights?.ctr?.toFixed(2)}%`
      : 'No active ads today'

    // Market pulse from Claude
    let marketPulse = ''
    try {
      const claudeRes = await callClaude({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'You are a concise Australian DTC media buying analyst. 3 sentences max. No filler. No greetings.',
        messages: [{
          role: 'user',
          content: `Today's GRI Meta Ads data: ROAS ${today.roas.toFixed(2)}, CPA $${today.cpa.toFixed(2)}, CPM $${today.cpm.toFixed(2)}, CTR ${today.ctr.toFixed(2)}%, Spend $${today.spend.toFixed(2)}. ${fatiguing + dead} ads fatiguing/dead out of ${allAds.length}. Give a brief market pulse for Australian gender reveal products.`
        }]
      }, 'ads-daily-report')
      marketPulse = claudeRes.content[0].text
    } catch {
      marketPulse = 'AI analysis unavailable.'
    }

    const aestDate = new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const delta = (todayVal, yesterdayVal, prefix = '', suffix = '', invert = false) => {
      if (!yesterday || yesterdayVal == null) return ''
      const diff = todayVal - yesterdayVal
      const pct = yesterdayVal !== 0 ? ((diff / yesterdayVal) * 100).toFixed(0) : '—'
      const isGood = invert ? diff < 0 : diff > 0
      return ` ${isGood ? '📈' : '📉'} ${diff > 0 ? '+' : ''}${pct}%`
    }

    const report = `📊 *GRI Meta Ads — Daily Report*
📅 ${aestDate} | 🇦🇺 AEST
━━━━━━━━━━━━━━━━━━

*TODAY'S PERFORMANCE*
━━━━━━━━━━━━━━━━━━
💰 ROAS: ${today.roas.toFixed(2)}${delta(today.roas, yesterday?.roas)}
🎯 CPA: $${today.cpa.toFixed(2)} AUD${delta(today.cpa, yesterday?.cpa, '', '', true)}
👆 CTR: ${today.ctr.toFixed(2)}%${delta(today.ctr, yesterday?.ctr)}
📢 CPM: $${today.cpm.toFixed(2)} AUD${delta(today.cpm, yesterday?.cpm, '', '', true)}
💸 Total Spend: $${today.spend.toFixed(2)} AUD

━━━━━━━━━━━━━━━━━━
*AD HEALTH SUMMARY*
━━━━━━━━━━━━━━━━━━
✅ Healthy: ${healthy} ads
⚠️ Watch: ${watch} ads
🔶 Fatiguing: ${fatiguing} ads
🔴 Dead: ${dead} ads

━━━━━━━━━━━━━━━━━━
*ACTION REQUIRED*
━━━━━━━━━━━━━━━━━━
${actionLines}

━━━━━━━━━━━━━━━━━━
*TOP PERFORMER TODAY*
━━━━━━━━━━━━━━━━━━
${topLine}

━━━━━━━━━━━━━━━━━━
*MARKET PULSE*
━━━━━━━━━━━━━━━━━━
${marketPulse}`

    await sendTelegramMessage({ chatId: JOSH_CHAT, text: report })
    console.log('[AdsReport] Daily report sent to Telegram')
    return { ok: true }
  } catch (err) {
    console.error('[AdsReport] Failed:', err.message)
    return { ok: false, error: err.message }
  }
}

function aggregateMetrics(campaigns) {
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalPurchases = 0, totalPurchaseValue = 0

  for (const c of campaigns) {
    if (c.insights) {
      totalSpend += c.insights.spend || 0
      totalImpressions += c.insights.impressions || 0
      totalClicks += c.insights.clicks || 0
      totalPurchases += c.insights.purchases || 0
      totalPurchaseValue += c.insights.purchaseValue || 0
    }
  }

  return {
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    purchases: totalPurchases,
    purchaseValue: totalPurchaseValue,
    roas: totalSpend > 0 ? totalPurchaseValue / totalSpend : 0,
    cpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0
  }
}
