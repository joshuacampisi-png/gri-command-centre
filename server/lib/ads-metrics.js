/**
 * ads-metrics.js
 * Business constants and metric calculations for Gender Reveal Ideas.
 * All dollar values in AUD.
 */

export const GRI_ADS = {
  aov: 126.86,
  grossMarginPct: 0.40,
  grossProfitPerOrder: 50.74,
  ncac: 50.74,
  mediaNcac: 43.13,
  breakevenCPP: 50.74,
  profitableCPP: 43.13,
  targetMER: 4.0,
  scaleMER: 6.0,
  breakevenROAS: 2.50,
  dailyMetaSpend: 210,
  dailyGoogleSpend: 200,
  monthlyAgency: 2200,
  // Payment processing (Shopify Payments standard)
  paymentProcessingRate: 0.026,
  paymentProcessingFixed: 0.30,
  // Shipping cost per order (GRI pays $4.50, customer pays the rest)
  shippingCostPerOrder: 4.50,
  // Framework thresholds
  fovCacGreen: 3.0,
  fovCacAmber: 1.0,
  ltgpGreen: 5.0,
  ltgpAmber: 3.0,
  amerGreen: 5.0,
  amerAmber: 2.0,
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
 * Cost Per Acquisition = Ad Spend / Total Orders (all customers).
 * NOTE: This is CPA, NOT nCAC. It includes returning customers.
 * Kept for backward compatibility. Use calculateNCAC for new-customer-only cost.
 */
export function calculateCPA(totalAdSpend, totalOrders) {
  if (!totalOrders || totalOrders <= 0) return 0
  return totalAdSpend / totalOrders
}
// Backward compat alias
export const calculateTrueCAC = calculateCPA

/**
 * nCAC (New Customer Acquisition Cost) = Ad Spend / New Customers ONLY.
 * The real cost to acquire a genuinely new customer.
 * Framework Priority 1.
 */
export function calculateNCAC(totalAdSpend, newCustomerCount) {
  if (!newCustomerCount || newCustomerCount <= 0) return 0
  return totalAdSpend / newCustomerCount
}

/**
 * FOV/CAC (First Order Value / Customer Acquisition Cost).
 * Does the first order generate enough gross profit to cover acquisition?
 * > 1.0 = first order pays for itself. < 1.0 = must return to break even.
 * Framework Priority 2.
 */
export function calculateFOVCAC(firstOrderAov, grossMarginPct, ncac) {
  if (!ncac || ncac <= 0) return 0
  return (firstOrderAov * grossMarginPct) / ncac
}

/**
 * CM$ (Contribution Margin — Dollar Amount).
 * THE scoreboard metric. If negative, nothing else matters.
 * CM$ = Net Sales - Cost of Delivery - Ad Spend.
 * Framework Priority 4 (but Layer 1 in the hierarchy — always shown first).
 */
export function calculateCM(netSales, costOfDelivery, adSpend) {
  return netSales - costOfDelivery - adSpend
}

/**
 * Calculate Cost of Delivery from revenue + order count.
 * CoD = COGS + Shipping + Payment Processing.
 * COGS estimated via (1 - grossMarginPct) * revenue.
 */
export function calculateCostOfDelivery(revenue, shipping, orderCount, grossMarginPct = GRI_ADS.grossMarginPct) {
  const cogs = revenue * (1 - grossMarginPct)
  const paymentFees = (revenue * GRI_ADS.paymentProcessingRate) + (orderCount * GRI_ADS.paymentProcessingFixed)
  // Use actual shipping cost ($4.50/order) not Shopify's total shipping field
  // which includes what the customer pays
  const actualShipping = orderCount * GRI_ADS.shippingCostPerOrder
  return cogs + actualShipping + paymentFees
}

/**
 * aMER (Acquisition Marketing Efficiency Ratio) = New Customer Revenue / Total Ad Spend.
 * Isolates new customer signal. If aMER << MER, ads are mostly re-converting existing customers.
 * Framework Priority 5.
 */
export function calculateAcquisitionMER(newCustomerRevenue, totalAdSpend) {
  if (!totalAdSpend || totalAdSpend <= 0) return 0
  return newCustomerRevenue / totalAdSpend
}

/**
 * Adjusted Marketing Efficiency Ratio (legacy).
 * AMER = (Gross Profit - Ad Spend) / Ad Spend * 100
 * Positive = profitable. Negative = losing money.
 * NOTE: This is the old AMER%, NOT the framework's aMER.
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

// ── Framework Threshold Functions ──────────────────────────────────────────

/**
 * Calculate nCAC thresholds from 90-day historical average.
 * Green = below avg, Amber = 45% above avg, Red = 2x avg.
 */
export function getNcacThresholds(historicalAvg) {
  if (!historicalAvg || historicalAvg <= 0) {
    // Fallback to current baseline if no history
    return { green: GRI_ADS.ncac, amber: GRI_ADS.ncac * 1.45, red: GRI_ADS.ncac * 2.0 }
  }
  return { green: historicalAvg, amber: historicalAvg * 1.45, red: historicalAvg * 2.0 }
}

export function getNcacStatus(ncac, thresholds) {
  if (ncac <= thresholds.green) return 'green'
  if (ncac <= thresholds.amber) return 'amber'
  return 'red'
}

export function getFovCacStatus(fovCac) {
  if (fovCac >= GRI_ADS.fovCacGreen) return 'green'
  if (fovCac >= GRI_ADS.fovCacAmber) return 'amber'
  return 'red'
}

export function getCmStatus(cm, prevCm = null) {
  if (cm < 0) return 'red'
  if (prevCm !== null && cm < prevCm) return 'amber'
  return 'green'
}

export function getAcquisitionMerStatus(amer) {
  if (amer >= GRI_ADS.amerGreen) return 'green'
  if (amer >= GRI_ADS.amerAmber) return 'amber'
  return 'red'
}

export function getNewCustomerTrendStatus(wowChangePct) {
  if (wowChangePct >= 0) return 'green'
  if (wowChangePct > -10) return 'amber'
  return 'red'
}

/**
 * Campaign Health Score 0-100 (portfolio-aware)
 * Returns { score, status, reasons }
 * Status: SCALE | HEALTHY | MONITOR | CULL | EMERGENCY
 *
 * @param {object} campaign - campaign with insights
 * @param {object} [portfolio] - { totalSpend, totalRevenue, weeklyTarget }
 *   If provided, campaigns that contribute significant revenue get protected
 *   from harsh scores (we can't cull revenue we need to survive).
 */
export function calculateCampaignHealth(campaign, portfolio = null) {
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
  } else if (cpp > 0 && cpp <= GRI_ADS.profitableCPP) {
    score += 10
    reasons.push(`CPP $${cpp.toFixed(2)} below profitable threshold ($${GRI_ADS.profitableCPP})`)
  } else if (cpp > GRI_ADS.profitableCPP && cpp <= GRI_ADS.breakevenCPP) {
    // Between profitable and breakeven — acceptable but not great
    reasons.push(`CPP $${cpp.toFixed(2)} between profitable and breakeven`)
  }

  // Volume scoring
  if (purchases < 5) {
    score -= 15
    reasons.push(`Only ${purchases} purchases — low volume`)
  } else if (purchases >= 5 && purchases < 10) {
    score -= 5
    reasons.push(`${purchases} purchases — building volume`)
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

  // Portfolio protection: if this campaign contributes >25% of total revenue,
  // boost score to prevent culling a revenue pillar we depend on
  if (portfolio && portfolio.totalSpend > 0 && purchases > 0) {
    const estRevenue = purchases * GRI_ADS.aov
    const revenueShare = estRevenue / (portfolio.totalRevenue || 1)
    if (revenueShare > 0.25) {
      const boost = Math.min(15, Math.round(revenueShare * 30))
      score += boost
      reasons.push(`Revenue pillar (${(revenueShare * 100).toFixed(0)}% of total) — protected`)
    }
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
 * Generate surgical actions at ad-set and ad level within a campaign.
 * Returns array of { level, entityId, entityName, action, priority, reason, impact }
 * priority: URGENT | HIGH | MEDIUM | LOW
 * action: PAUSE | SCALE_BUDGET | REDUCE_BUDGET | REPLACE_CREATIVE | REFRESH_AUDIENCE | WATCH
 */
export function generateSurgicalActions(campaign) {
  const actions = []
  const campaignInsights = campaign.insights || {}
  const campaignSpend = campaignInsights.spend || 0

  // ── Ad Set level analysis ──
  for (const adset of (campaign.adsets || [])) {
    const ins = adset.insights || {}
    const spend = ins.spend || 0
    const purchases = ins.purchases || 0
    const cpp = purchases > 0 ? spend / purchases : Infinity
    const frequency = ins.frequency || 0

    // Ad set spending with zero conversions
    if (spend > 100 && purchases === 0) {
      actions.push({
        level: 'adset',
        entityId: adset.id,
        entityName: adset.name,
        action: 'PAUSE',
        priority: 'URGENT',
        reason: `$${spend.toFixed(0)} spent with zero purchases`,
        impact: `Save $${(spend / 7).toFixed(0)}/day`
      })
      continue
    }

    // Ad set CPP above breakeven with meaningful spend
    if (cpp > GRI_ADS.breakevenCPP && spend > 50 && purchases > 0) {
      if (cpp > 50) {
        actions.push({
          level: 'adset',
          entityId: adset.id,
          entityName: adset.name,
          action: 'PAUSE',
          priority: 'HIGH',
          reason: `CPP $${cpp.toFixed(2)} is dangerously high (breakeven is $${GRI_ADS.breakevenCPP})`,
          impact: `Losing $${((cpp - GRI_ADS.breakevenCPP) * purchases).toFixed(0)} over this period`
        })
      } else {
        actions.push({
          level: 'adset',
          entityId: adset.id,
          entityName: adset.name,
          action: 'REDUCE_BUDGET',
          priority: 'MEDIUM',
          reason: `CPP $${cpp.toFixed(2)} above breakeven ($${GRI_ADS.breakevenCPP})`,
          impact: `Reduce budget 20-30% to see if CPP improves with less spend`
        })
      }
    }

    // Ad set with great CPP — scale opportunity
    if (cpp < GRI_ADS.profitableCPP && purchases >= 3) {
      actions.push({
        level: 'adset',
        entityId: adset.id,
        entityName: adset.name,
        action: 'SCALE_BUDGET',
        priority: 'MEDIUM',
        reason: `CPP $${cpp.toFixed(2)} well below target ($${GRI_ADS.profitableCPP}) with ${purchases} purchases`,
        impact: `Increase budget 20% — this ad set is profitable`
      })
    }

    // High frequency on ad set — audience fatigue
    if (frequency > 4 && spend > 50) {
      actions.push({
        level: 'adset',
        entityId: adset.id,
        entityName: adset.name,
        action: 'REFRESH_AUDIENCE',
        priority: frequency > 6 ? 'HIGH' : 'MEDIUM',
        reason: `Frequency ${frequency.toFixed(1)} means audience is seeing ads too often`,
        impact: `Broaden targeting or exclude past purchasers`
      })
    }
  }

  // ── Ad (creative) level analysis ──
  for (const ad of (campaign.ads || [])) {
    if (ad.status !== 'ACTIVE') continue

    const ins = ad.insights || {}
    const spend = ins.spend || 0
    const purchases = ins.purchases || 0
    const cpp = purchases > 0 ? spend / purchases : Infinity
    const ctr = ins.ctr || 0
    const frequency = ins.frequency || 0
    const fatigue = ad.fatigue || {}

    // Ad spending with zero conversions and meaningful spend
    if (spend > 50 && purchases === 0) {
      actions.push({
        level: 'ad',
        entityId: ad.id,
        entityName: ad.name,
        action: 'PAUSE',
        priority: spend > 150 ? 'URGENT' : 'HIGH',
        reason: `$${spend.toFixed(0)} spent with zero purchases — this creative isn't converting`,
        impact: `Pause and replace with new creative. Save $${(spend / 7).toFixed(0)}/day.`
      })
      continue
    }

    // Ad with terrible CPP compared to other ads in same campaign
    if (purchases > 0 && cpp > GRI_ADS.breakevenCPP * 1.5) {
      actions.push({
        level: 'ad',
        entityId: ad.id,
        entityName: ad.name,
        action: 'PAUSE',
        priority: 'HIGH',
        reason: `CPP $${cpp.toFixed(2)} is 50%+ above breakeven — dragging campaign down`,
        impact: `Replace with new creative. Budget will redistribute to better performers.`
      })
    }

    // Fatigued creative (from fatigue engine)
    if (fatigue.status === 'DEAD' || fatigue.score < 25) {
      actions.push({
        level: 'ad',
        entityId: ad.id,
        entityName: ad.name,
        action: 'REPLACE_CREATIVE',
        priority: 'HIGH',
        reason: `Creative fatigue score ${fatigue.score}/100 — ${(fatigue.signals || []).join(', ') || 'exhausted'}`,
        impact: `Pause this ad and launch fresh creative. Audience is blind to this one.`
      })
    } else if (fatigue.status === 'FATIGUING' || (fatigue.score >= 25 && fatigue.score < 50)) {
      actions.push({
        level: 'ad',
        entityId: ad.id,
        entityName: ad.name,
        action: 'REPLACE_CREATIVE',
        priority: 'MEDIUM',
        reason: `Creative fatiguing (score ${fatigue.score}/100) — ${(fatigue.signals || []).join(', ') || 'declining'}`,
        impact: `Start testing replacement creative now. This one has 3-5 days left.`
      })
    }

    // Strong performer — flag as the one to protect
    if (cpp > 0 && cpp < GRI_ADS.profitableCPP && purchases >= 2) {
      actions.push({
        level: 'ad',
        entityId: ad.id,
        entityName: ad.name,
        action: 'PROTECT',
        priority: 'LOW',
        reason: `Top performer: CPP $${cpp.toFixed(2)}, ${purchases} purchases`,
        impact: `Do not touch. This creative is printing money.`
      })
    }
  }

  // Sort: URGENT first, then HIGH, MEDIUM, LOW
  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  actions.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9))

  return actions
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
