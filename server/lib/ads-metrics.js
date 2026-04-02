/**
 * ads-metrics.js
 * Business constants and metric calculations for Gender Reveal Ideas.
 * All dollar values in AUD.
 */

export const GRI_ADS = {
  aov: 105,
  grossMarginPct: 0.30,
  grossProfitPerOrder: 31.50,
  breakevenCPP: 31.50,
  profitableCPP: 26.00,
  targetMER: 4.0,
  scaleMER: 6.0,
  breakevenROAS: 3.33,
}

/**
 * Marketing Efficiency Ratio = Shopify Revenue / Meta Spend
 * Higher is better. 4x+ is the target for GRI.
 */
export function calculateMER(shopifyRevenue, totalAdSpend) {
  if (!totalAdSpend || totalAdSpend <= 0) return 0
  return shopifyRevenue / totalAdSpend
}

/**
 * True Customer Acquisition Cost = Meta Spend / Shopify Orders
 * Uses actual Shopify order count, not Meta-attributed purchases.
 */
export function calculateTrueCAC(totalAdSpend, totalOrders) {
  if (!totalOrders || totalOrders <= 0) return 0
  return totalAdSpend / totalOrders
}

/**
 * Adjusted Marketing Efficiency Ratio
 * AMER = (Gross Profit - Ad Spend) / Ad Spend * 100
 * Positive = profitable. Negative = losing money.
 */
export function calculateAMER(shopifyRevenue, totalAdSpend, grossMarginPct = 0.30) {
  if (!totalAdSpend || totalAdSpend <= 0) return 0
  const grossProfit = shopifyRevenue * grossMarginPct
  return ((grossProfit - totalAdSpend) / totalAdSpend) * 100
}

/**
 * Net Profit on Ad Spend = (Revenue * Margin - Spend) / Spend
 * Like ROAS but accounts for margin. > 0 means profitable.
 */
export function calculateNPOAS(shopifyRevenue, totalAdSpend, grossMarginPct = 0.30) {
  if (!totalAdSpend || totalAdSpend <= 0) return 0
  return (shopifyRevenue * grossMarginPct - totalAdSpend) / totalAdSpend
}

/**
 * Campaign Health Score 0-100
 * Returns { score, status, reasons }
 * Status: SCALE | HEALTHY | MONITOR | CULL | EMERGENCY
 */
export function calculateCampaignHealth(campaign) {
  const insights = campaign.insights || {}
  const spend = insights.spend || 0
  const purchases = insights.purchases || 0
  const frequency = insights.frequency || 0
  const cpp = purchases > 0 ? spend / purchases : 0

  let score = 70 // Start at baseline
  const reasons = []

  // Instant zero: spending with nothing to show
  if (spend > 200 && purchases === 0) {
    return {
      score: 0,
      status: 'EMERGENCY',
      reasons: [`$${spend.toFixed(0)} spent with zero purchases — bleeding money`]
    }
  }

  // CPP scoring
  if (cpp > 50) {
    score -= 40
    reasons.push(`CPP $${cpp.toFixed(2)} is dangerously high (>$50)`)
  } else if (cpp > GRI_ADS.breakevenCPP) {
    score -= 20
    reasons.push(`CPP $${cpp.toFixed(2)} above breakeven ($${GRI_ADS.breakevenCPP})`)
  } else if (cpp > 0 && cpp < GRI_ADS.profitableCPP) {
    score += 10
    reasons.push(`CPP $${cpp.toFixed(2)} below profitable threshold ($${GRI_ADS.profitableCPP})`)
  }

  // Volume scoring
  if (purchases < 10) {
    score -= 25
    reasons.push(`Only ${purchases} purchases — insufficient volume`)
  } else if (purchases > 50) {
    score += 10
    reasons.push(`${purchases} purchases — strong volume`)
  }

  // Frequency scoring (creative fatigue indicator)
  if (frequency > 6) {
    score -= 40
    reasons.push(`Frequency ${frequency.toFixed(1)} is extreme (>6) — severe creative fatigue`)
  } else if (frequency > 4) {
    score -= 20
    reasons.push(`Frequency ${frequency.toFixed(1)} is high (>4) — creative fatigue likely`)
  }

  // Clamp
  score = Math.max(0, Math.min(100, score))

  // Status mapping
  let status
  if (score >= 80) status = 'SCALE'
  else if (score >= 60) status = 'HEALTHY'
  else if (score >= 40) status = 'MONITOR'
  else if (score >= 20) status = 'CULL'
  else status = 'EMERGENCY'

  return { score, status, reasons }
}

/**
 * Generate alerts from an array of campaign data.
 * Returns array of { id, severity, message, action, campaignId }
 */
export function generateAlerts(campaigns) {
  const alerts = []
  let alertId = 0

  for (const campaign of campaigns) {
    const insights = campaign.insights || {}
    const spend = insights.spend || 0
    const purchases = insights.purchases || 0
    const frequency = insights.frequency || 0
    const cpp = purchases > 0 ? spend / purchases : 0
    const name = campaign.name || campaign.id

    // CRITICAL: Burning money — high spend, zero purchases
    if (spend > 300 && purchases === 0) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'CRITICAL',
        message: `"${name}" has spent $${spend.toFixed(0)} with zero purchases — burning money`,
        action: 'Pause this campaign immediately and audit creative + targeting',
        campaignId: campaign.id
      })
    }

    // HIGH: Above breakeven CPP on meaningful spend
    if (cpp > GRI_ADS.breakevenCPP && spend > 200) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'HIGH',
        message: `"${name}" CPP is $${cpp.toFixed(2)} on $${spend.toFixed(0)} spend — above breakeven ($${GRI_ADS.breakevenCPP})`,
        action: 'Review creative performance. Consider pausing worst-performing ad sets.',
        campaignId: campaign.id
      })
    }

    // HIGH: Creative fatigue
    if (frequency > 4) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'HIGH',
        message: `"${name}" frequency is ${frequency.toFixed(1)} — creative fatigue detected`,
        action: 'Refresh creatives or broaden audience. Current ads are being shown too often.',
        campaignId: campaign.id
      })
    }

    // OPPORTUNITY: Profitable and scaling
    if (cpp > 0 && cpp < GRI_ADS.profitableCPP && purchases > 30) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'OPPORTUNITY',
        message: `"${name}" CPP is $${cpp.toFixed(2)} with ${purchases} purchases — scale opportunity`,
        action: 'Increase daily budget by 20-30%. This campaign is printing money.',
        campaignId: campaign.id
      })
    }
  }

  return alerts
}

/**
 * Scale path calculator.
 * Given current monthly numbers, calculate what's needed for $1M/yr and $2M/yr.
 * Returns { current, targets: [{ label, monthlyRev, monthlySpend, dailySpend, gap }] }
 */
export function calculateScalePath(currentMonthlyRev, currentMonthlySpend, currentMER) {
  const effectiveMER = currentMER > 0 ? currentMER : GRI_ADS.targetMER
  const currentDailySpend = currentMonthlySpend / 30

  const current = {
    monthlyRev: currentMonthlyRev,
    monthlySpend: currentMonthlySpend,
    dailySpend: currentDailySpend,
    annualRev: currentMonthlyRev * 12,
    mer: effectiveMER
  }

  const targets = [
    {
      label: '$1M/year',
      monthlyRev: 1_000_000 / 12,
      monthlySpend: (1_000_000 / 12) / effectiveMER,
      dailySpend: ((1_000_000 / 12) / effectiveMER) / 30,
      gap: {
        monthlyRev: Math.max(0, (1_000_000 / 12) - currentMonthlyRev),
        monthlySpend: Math.max(0, ((1_000_000 / 12) / effectiveMER) - currentMonthlySpend),
        dailySpend: Math.max(0, (((1_000_000 / 12) / effectiveMER) / 30) - currentDailySpend)
      }
    },
    {
      label: '$2M/year',
      monthlyRev: 2_000_000 / 12,
      monthlySpend: (2_000_000 / 12) / effectiveMER,
      dailySpend: ((2_000_000 / 12) / effectiveMER) / 30,
      gap: {
        monthlyRev: Math.max(0, (2_000_000 / 12) - currentMonthlyRev),
        monthlySpend: Math.max(0, ((2_000_000 / 12) / effectiveMER) - currentMonthlySpend),
        dailySpend: Math.max(0, (((2_000_000 / 12) / effectiveMER) / 30) - currentDailySpend)
      }
    }
  ]

  return { current, targets }
}
