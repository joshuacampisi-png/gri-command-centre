/**
 * fatigue-engine.js
 * Ad fatigue scoring algorithm for gender reveal products.
 * Gender reveal ads fatigue fast — impulse/event purchase, short consideration window.
 */

/**
 * Calculate fatigue score for an ad (0-100, 100 = perfectly healthy).
 * @param {object} ad - Ad metrics object
 * @param {number} ad.frequency - Current frequency
 * @param {number} ad.daysRunning - Days since ad was created
 * @param {number} ad.roas - Return on ad spend
 * @param {number[]} ad.ctrByDay - Array of CTR values per day (most recent last)
 * @param {number[]} ad.cpaByDay - Array of CPA values per day (most recent last)
 * @returns {{ score: number, status: string, signals: string[] }}
 */
export function calculateFatigueScore(ad) {
  let score = 100
  const signals = []

  // Frequency penalty (gender reveal ads fatigue fast — impulse/event purchase)
  if (ad.frequency > 5.0) {
    score -= 60
    signals.push(`Critical frequency: ${ad.frequency.toFixed(1)}`)
  } else if (ad.frequency > 3.5) {
    score -= 35
    signals.push(`High frequency: ${ad.frequency.toFixed(1)}`)
  } else if (ad.frequency > 2.5) {
    score -= 15
    signals.push(`Rising frequency: ${ad.frequency.toFixed(1)}`)
  }

  // CTR decay — compare last 3 days vs prior 4 days
  if (ad.ctrByDay && ad.ctrByDay.length >= 7) {
    const recent = ad.ctrByDay.slice(-3)
    const prior = ad.ctrByDay.slice(-7, -3)
    const avgRecent = avg(recent)
    const avgPrior = avg(prior)

    if (avgPrior > 0) {
      const ctrDecay = (avgRecent - avgPrior) / avgPrior
      if (ctrDecay < -0.30) {
        score -= 35
        signals.push(`CTR crashed ${(ctrDecay * 100).toFixed(0)}%`)
      } else if (ctrDecay < -0.15) {
        score -= 20
        signals.push(`CTR declining ${(ctrDecay * 100).toFixed(0)}%`)
      }
    }
  }

  // CPA rise — compare last 3 days vs prior 4 days
  if (ad.cpaByDay && ad.cpaByDay.length >= 7) {
    const recent = ad.cpaByDay.slice(-3)
    const prior = ad.cpaByDay.slice(-7, -3)
    const avgRecent = avg(recent)
    const avgPrior = avg(prior)

    if (avgPrior > 0) {
      const cpaRise = (avgRecent - avgPrior) / avgPrior
      if (cpaRise > 0.40) {
        score -= 30
        signals.push(`CPA spiked +${(cpaRise * 100).toFixed(0)}%`)
      } else if (cpaRise > 0.20) {
        score -= 15
        signals.push(`CPA rising +${(cpaRise * 100).toFixed(0)}%`)
      }
    }
  }

  // Days running penalty (gender reveal creative shelf life ~14 days)
  if (ad.daysRunning > 21) {
    score -= 20
    signals.push(`Running ${ad.daysRunning} days (shelf life ~14d)`)
  } else if (ad.daysRunning > 14) {
    score -= 10
    signals.push(`Running ${ad.daysRunning} days`)
  }

  // ROAS floor
  if (ad.roas < 1.0) {
    score -= 40
    signals.push(`ROAS below breakeven: ${ad.roas.toFixed(2)}`)
  } else if (ad.roas < 1.5) {
    score -= 20
    signals.push(`Low ROAS: ${ad.roas.toFixed(2)}`)
  }

  const finalScore = Math.max(0, Math.min(100, score))
  return {
    score: finalScore,
    status: scoreToStatus(finalScore),
    signals
  }
}

/**
 * Map score to status badge.
 */
export function scoreToStatus(score) {
  if (score >= 80) return 'HEALTHY'
  if (score >= 50) return 'WATCH'
  if (score >= 25) return 'FATIGUING'
  return 'DEAD'
}

/**
 * Status colour mapping.
 */
export const STATUS_COLORS = {
  HEALTHY: '#3fb950',
  WATCH: '#d29922',
  FATIGUING: '#e3651d',
  DEAD: '#f85149'
}

/**
 * Process raw daily insights into fatigue-ready metrics.
 */
export function prepareFatigueMetrics(ad) {
  const daily = ad.dailyInsights || []

  return {
    frequency: ad.insights?.frequency || 0,
    daysRunning: ad.daysRunning || 0,
    roas: ad.insights?.roas || 0,
    ctrByDay: daily.map(d => d?.ctr || 0),
    cpaByDay: daily.map(d => d?.cpa || 0)
  }
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
