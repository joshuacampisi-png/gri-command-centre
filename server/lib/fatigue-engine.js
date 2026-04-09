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

/**
 * Estimate days remaining before ad is exhausted, using linear regression on CTR decay.
 * Returns null if insufficient data (need 5+ daily data points).
 */
export function estimateDaysRemaining(ad) {
  const ctrs = ad.ctrByDay || []
  if (ctrs.length < 5) return null

  // Only use non-zero values
  const valid = ctrs.filter(v => v > 0)
  if (valid.length < 5) return null

  // Linear regression: y = mx + b (where x = day index, y = CTR)
  const n = valid.length
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += valid[i]
    sumXY += i * valid[i]
    sumXX += i * i
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  // If CTR is flat or rising, no fatigue projection
  if (slope >= 0) return null

  // CTR floor: below 0.5% is effectively dead for gender reveal ads
  const ctrFloor = 0.5
  const currentCtr = valid[valid.length - 1]

  if (currentCtr <= ctrFloor) return 0

  // Days until CTR hits floor: floor = currentCtr + slope * days
  const daysLeft = Math.ceil((ctrFloor - currentCtr) / slope)
  return Math.max(0, Math.min(daysLeft, 60)) // cap at 60 days
}

/**
 * Enhanced fatigue report for an ad — includes days remaining, CPM trend, and recommendation.
 */
export function buildFatigueReport(ad) {
  const base = calculateFatigueScore(ad)
  const daysRemaining = estimateDaysRemaining(ad)

  // CPM trend (last 3d vs prior 4d)
  let cpmTrend = null
  const cpms = ad.cpmByDay || []
  if (cpms.length >= 7) {
    const recent = avg(cpms.slice(-3))
    const prior = avg(cpms.slice(-7, -3))
    if (prior > 0) {
      cpmTrend = {
        recent,
        prior,
        changePct: ((recent - prior) / prior) * 100
      }
      // CPM spike = audience saturation
      if (cpmTrend.changePct > 50) {
        base.signals.push(`CPM spiked +${cpmTrend.changePct.toFixed(0)}% (audience exhaustion)`)
        base.score = Math.max(0, base.score - 15)
        base.status = scoreToStatus(base.score)
      }
    }
  }

  // Generate recommendation
  let recommendation = ''
  if (base.status === 'DEAD') {
    recommendation = 'Kill this ad immediately. Replace with fresh creative.'
  } else if (base.status === 'FATIGUING') {
    recommendation = 'Prepare replacement creative now. This ad has 1-3 days left.'
  } else if (base.status === 'WATCH') {
    recommendation = 'Monitor closely. Start briefing replacement creative.'
  } else {
    recommendation = 'Performing well. No action needed.'
  }

  return {
    ...base,
    daysRemaining,
    cpmTrend,
    recommendation,
    frequency: ad.frequency || 0,
    daysRunning: ad.daysRunning || 0,
    roas: ad.roas || 0
  }
}

/**
 * Calculate frequency trend from daily snapshots.
 * Compares avg frequency over last 3 days vs last 7 days.
 * @param {Array} snapshots - Array of daily snapshot objects with { frequency } field
 * @returns {{ freq3d, freq7d, velocity, trend, alert, alertMessage } | null}
 */
export function calculateFrequencyTrend(snapshots) {
  if (!snapshots || snapshots.length < 7) return null

  const freqs = snapshots.map(s => s.frequency || 0).filter(f => f > 0)
  if (freqs.length < 7) return null

  const freq3d = avg(freqs.slice(-3))
  const freq7d = avg(freqs.slice(-7))

  if (freq7d === 0) return null

  const velocity = ((freq3d - freq7d) / freq7d) * 100

  let trend = 'stable'
  let alert = false
  let alertMessage = null

  if (velocity > 30) {
    trend = 'rising'
    alert = true
    alertMessage = 'Frequency spiking fast — creative fatigue imminent'
  } else if (velocity > 15) {
    trend = 'rising'
  } else if (velocity < -5) {
    trend = 'falling'
  }

  return { freq3d: +freq3d.toFixed(2), freq7d: +freq7d.toFixed(2), velocity: +velocity.toFixed(1), trend, alert, alertMessage }
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
