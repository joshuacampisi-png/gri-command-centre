/**
 * gads-agent-intelligence.js
 * AI layer for the Google Ads Agent:
 *   1. Convert raw findings into recommendation cards
 *   2. Top-ranked findings get full Claude + web search enrichment
 *   3. Lower-ranked findings get fast template cards (protects the daily budget)
 *   4. Daily intelligence briefing via one Claude+web-search call per day
 *
 * Every Claude call routes through claude-guard.js for $10/day budget enforcement.
 */
import { callClaude } from './claude-guard.js'
import { projectImpact } from './gads-agent-engine.js'
import { getConfig } from './gads-agent-store.js'

const MODEL = 'claude-sonnet-4-20250514'
const AI_ENRICHMENT_CAP = 5 // top N findings per scan get Claude + web search; rest are templated

// ── Best-practice web search (single call, Anthropic web_search tool) ───────

async function searchBestPractice(issueTitle) {
  try {
    const response = await callClaude({
      model: MODEL,
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content:
          `Search for the current Google Ads best practice for this issue: "${issueTitle}". ` +
          `Focus on 2025 or 2026 Google Ads guidance from support.google.com, thinkwithgoogle.com, or ` +
          `reputable PPC sources. Return JSON only, no preamble, no markdown: ` +
          `{ "url": "most authoritative source URL", "summary": "2 sentence plain English fix guidance" }`,
      }],
    }, 'gads-agent-web-search')

    const text = response.content?.find(b => b.type === 'text')?.text || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      url: parsed.url || 'https://support.google.com/google-ads',
      summary: parsed.summary || 'Follow Google Ads best practice guidance for this issue.',
    }
  } catch (err) {
    console.warn('[GadsIntel] searchBestPractice failed:', err.message)
    return {
      url: 'https://support.google.com/google-ads',
      summary: 'Follow Google Ads best practice guidance for this issue.',
    }
  }
}

// ── Directional classification ──────────────────────────────────────────────
//
// Every finding falls into one of four directions. This drives what classes
// of recommendation are legal and blocks Claude from suggesting e.g. Smart
// Bidding Exploration on an underperforming campaign.

function classifyDirection(finding) {
  switch (finding.issueKey) {
    case 'campaign_zero_conversions':
    case 'keyword_zero_conversions':
    case 'negative_candidate':
    case 'shopping_product_zero_conversions':
    case 'budget_reallocation':
    case 'low_quality_score':
      return 'underperformance'
    case 'bid_underbid':
      return 'overperformance' // keyword converting well below breakeven CPP
    case 'keyword_zero_impressions':
      return 'structural_cleanup'
    case 'disapproved_ad':
      return 'quality_fix'
    case 'framework_ncac_spike':
    case 'framework_fov_cac_below_one':
    case 'framework_fov_cac_pause_gate':
    case 'framework_sponge_alert':
    case 'framework_cm_negative':
      return 'framework_alert'
    default:
      return 'unknown'
  }
}

const LEGAL_RECOMMENDATIONS_BY_DIRECTION = {
  underperformance: 'Pause, reduce budget, add negative keywords, fix search-term targeting, lower target ROAS/CPA to something achievable, review landing page experience, or refine query matching. NEVER suggest scaling, loosening bid targets, Smart Bidding Exploration, or increasing budgets — those are for overperformers only.',
  overperformance:  'Increase bids, scale budget, add lookalike audiences, or apply Smart Bidding Exploration to capture incremental volume. NEVER suggest pausing or cutting — this entity is already winning.',
  structural_cleanup: 'Remove dead weight that consumes no budget. Do not frame this as a money opportunity — the value is account hygiene, not direct dollar impact.',
  quality_fix: 'Fix the specific quality/compliance issue (disapproval, low QS) via ad rewrites, landing page improvements, or ad relevance work. Do not suggest bidding changes as the primary fix.',
  framework_alert: 'Account-level framework warning. This is a diagnostic flag, not an executable action — the narrative should explain what broke at Layer 1 or Layer 3, which campaigns are the likely suspects based on portfolio mix, and what Josh should investigate manually. Do NOT propose a specific campaign mutation — these alerts drive investigation, not automation.',
  unknown: 'Be conservative. Recommend manual review.',
}

// ── AI-enriched card copy ───────────────────────────────────────────────────
//
// The prescription (whatToFix) is ALWAYS the deterministic template — grounded
// in the actual proposedChange that will execute on approval. Claude only
// writes the explanatory narrative (whyItShouldChange), with strict guardrails:
//
//   1. Structured campaign context passed explicitly (no hallucinated numbers)
//   2. Directional hint blocks backwards recommendations (e.g. scaling a loser)
//   3. Numeric claims constrained to provided data only
//   4. Dollar impact framed as contribution margin, not gross revenue

// Render a compact framework snapshot block for Claude prompts. Returns null
// if the framework metrics object is missing or carries an error flag.
function renderFrameworkBlock(framework) {
  if (!framework || framework.error) return null
  const cm = framework.layer1?.cm
  const ncac = framework.layer3?.ncac
  const fovCac = framework.layer3?.fovCac
  const aMer = framework.layer3?.aMer
  const newCount = framework.layer3?.newCustomerCount
  const windowDays = framework.window?.days || 30
  const lines = [
    `FRAMEWORK METRICS (computed from customer-index + ads-metrics, ${windowDays}d window)`,
    cm?.value != null ? `  Layer 1 CM$ (new-customer): $${cm.value.toFixed(2)} AUD (${cm.status || 'n/a'})` : null,
    ncac?.value != null ? `  nCAC: $${ncac.value.toFixed(2)} vs 90d baseline $${(ncac.historicalAvg || 0).toFixed(2)} (${ncac.status || 'n/a'})` : null,
    fovCac?.value != null ? `  FOV/CAC: ${fovCac.value.toFixed(2)}× (${fovCac.status || 'n/a'}) — PAUSE gate if <1.0x for 3+ days` : null,
    aMer?.value != null ? `  aMER: ${aMer.value.toFixed(2)}× (${aMer.status || 'n/a'})` : null,
    newCount?.total != null ? `  New customers: ${newCount.total} total, ${newCount.dailyAvg}/day, ${newCount.wowChangePct >= 0 ? '+' : ''}${newCount.wowChangePct}% WoW (${newCount.trend || 'n/a'})` : null,
    framework.spend?.blended != null ? `  Blended ad spend: $${Math.round(framework.spend.blended).toLocaleString('en-AU')} AUD (Google $${Math.round(framework.spend.google || 0).toLocaleString('en-AU')} + Meta $${Math.round(framework.spend.meta || 0).toLocaleString('en-AU')})` : null,
  ].filter(Boolean)
  return lines.join('\n')
}

async function writeCardCopy(finding, bestPractice, impact, direction, cfg, framework) {
  // whatToFix is ALWAYS deterministic — never invented by Claude
  const whatToFix = templateWhatToFix(finding)

  // Extract the real campaign context (populated by the engine from Layer 2 auto-discovery)
  const ctx = finding.campaignContext || {}
  const campaignContextLines = [
    ctx.name ? `Campaign name: ${ctx.name}` : null,
    ctx.channel ? `Channel: ${ctx.channel}` : null,
    ctx.bidStrategy ? `Bid strategy: ${ctx.bidStrategy}` : null,
    ctx.dailyBudgetAud != null ? `Daily budget: $${ctx.dailyBudgetAud} AUD` : null,
    ctx.targetRoas != null ? `Target ROAS: ${ctx.targetRoas}x` : null,
    ctx.optimizationScore != null ? `Optimization score: ${Math.round(ctx.optimizationScore * 100)}%` : null,
    ctx.isAutoBid != null ? `Auto-bidding: ${ctx.isAutoBid ? 'yes (manual bid changes ignored by Google)' : 'no'}` : null,
  ].filter(Boolean).join('\n')

  // Use contribution margin from the forecast, not gross revenue
  const fc = finding.forecast || {}
  const netProfitMonthly = fc.monthly?.netProfitChangeAud ?? null
  const revenueMonthly = fc.monthly?.revenueChangeAud ?? null
  const spendMonthly = fc.monthly?.spendChangeAud ?? null
  const impactLine = netProfitMonthly != null
    ? `Projected net profit impact (after ${Math.round(cfg.grossMarginPct * 100)}% margin): $${netProfitMonthly.toFixed(2)} AUD/month. Revenue Δ: ${revenueMonthly >= 0 ? '+' : ''}$${(revenueMonthly || 0).toFixed(2)}. Spend Δ: ${spendMonthly > 0 ? '+' : ''}$${(spendMonthly || 0).toFixed(2)}.`
    : `Projected impact: $${impact.toFixed(2)} AUD/month (${direction})`

  const dxn = classifyDirection(finding)
  const legalRecs = LEGAL_RECOMMENDATIONS_BY_DIRECTION[dxn]

  try {
    const response = await callClaude({
      model: MODEL,
      max_tokens: 400,
      system:
        `You are a senior Google Ads strategist for Gender Reveal Ideas (genderrevealideas.com.au), ` +
        `an Australian DTC gender reveal products brand.\n\n` +
        `BUSINESS CONSTANTS\n` +
        `AOV $${cfg.avgOrderValueAud} AUD, gross margin ${Math.round(cfg.grossMarginPct * 100)}%, ` +
        `breakeven CPP $${cfg.breakevenCppAud} AUD, blanket target ROAS ${cfg.targetRoas}x.\n\n` +

        `THE nCAC / LTGP PROFITABILITY FRAMEWORK — your decision hierarchy\n` +
        `(Source: Taylor Holiday CTC / Nathan Perdriau LTGP / Brad Ploch CBO. GRI adopted this as the canonical ads measurement framework. NEVER use CPA or LTV as primary metrics.)\n\n` +
        `The Six Priority Metrics (top = most important):\n` +
        `  P1 — nCAC = Total Ad Spend / New Customers. New = Shopify customer.numberOfOrders == 1. Use 3-day rolling average. Thresholds vs 90d historical avg: green below, amber +45%, red 2x.\n` +
        `  P2 — FOV/CAC = (first_order_aov × margin) / nCAC. Decision rule: <1.0x for 3+ consecutive days = PAUSE. Green >3.0x, amber 1.0-3.0x, red <1.0x.\n` +
        `  P3 — LTGP:nCAC = (customer revenue at Xd × margin) / nCAC. ALWAYS specify the window (30d/60d/90d/180d/365d). Green >5x, amber 3-5x, red <3x. CAC ceiling = 50-60% of 90d LTGP.\n` +
        `  P4 — CM$ = Net Sales - Cost of Delivery - Ad Spend. Cost of Delivery = COGS + royalties + shipping + payment processing. THE scoreboard metric. If negative, nothing else matters. USE DOLLARS not percentage.\n` +
        `  P5 — aMER = New Customer Revenue / Total Ad Spend. Green >5x, amber 2-5x, red <2x. If aMER << MER, ads are re-converting, not acquiring.\n` +
        `  P6 — New Customer Count (daily). Sponge alert: declines >20% WoW while spend flat/increasing = shrinking acquisition.\n\n` +
        `The Four-Layer Hierarchy (ALWAYS present top-to-bottom, NEVER lead with Layer 4):\n` +
        `  Layer 1 Scoreboard:        CM$ (if negative, every other metric is noise)\n` +
        `  Layer 2 Business metrics:  Order Revenue, Total Ad Spend, MER, AOV\n` +
        `  Layer 3 Customer metrics:  nCAC, FOV/CAC, LTGP:nCAC, Repeat Rate, aMER, New Customer Count\n` +
        `  Layer 4 Channel metrics:   Per-platform ROAS, CPA (PROXY INDICATORS ONLY — not primary)\n\n` +
        `Common mistakes to avoid:\n` +
        `  • Leading with CPA (use nCAC — new customers only)\n` +
        `  • Revenue-based LTV (use LTGP with explicit time window)\n` +
        `  • Hardcoded AOV (track first_order_aov separately)\n` +
        `  • Blended remarketing + prospecting (report nCAC for prospecting only)\n\n` +

        `FRAMEWORK METRICS ARE LIVE (as of 2026-04-05)\n` +
        `The rules engine now computes Layer 1 CM$ and Layer 3 customer metrics (nCAC, FOV/CAC, aMER, new customer count, WoW trend) from the live Shopify customer index + blended Google+Meta ad spend. Cost of Delivery uses the real framework formula (COGS + payment processing + shipping). You MAY reference these numbers in your narrative — they are provided explicitly in the prompt body.\n` +
        `LTGP:nCAC cohort tracking (30/60/90/180/365d) is still pending — it requires monthly cohort grouping. If you need LTGP for a narrative point, note it as "not yet tracked" rather than fabricating a number.\n\n` +

        `WRITING STYLE\n` +
        `Plain Australian English. No dashes. No AI filler phrases ("leveraging", "going forward", "in order to"). Direct and specific.\n\n` +

        `HARD CONSTRAINTS — violating any of these produces a wrong answer:\n` +
        `1. ONLY reference numbers that appear in the "Campaign context", "Forecast", or "Framework metrics" sections below. Do NOT invent specific dollar amounts, percentages, or budgets.\n` +
        `2. Frame dollar impact as contribution margin (CM$), not gross revenue. Revenue on a physical-product business is vanity.\n` +
        `3. Do NOT contradict the "Prescription" field — the narrative must match the action, not propose an alternative.\n` +
        `4. Respect the "Direction" — only recommend actions from the legal set for that direction.\n` +
        `5. For Layer 3 metrics (nCAC, FOV/CAC, aMER), use the exact values from the Framework metrics block. Do NOT fabricate values. LTGP:nCAC is not yet tracked — say so rather than inventing a number.\n\n` +

        `Respond ONLY with a JSON object, no preamble, no markdown.`,
      messages: [{
        role: 'user',
        content:
          `Write the narrative explanation for this Google Ads finding.\n\n` +
          `ISSUE\n${finding.issueTitle}\n\n` +
          (renderFrameworkBlock(framework) ? `${renderFrameworkBlock(framework)}\n\n` : '') +
          `CAMPAIGN CONTEXT (verified from API — use these numbers, not any others)\n${campaignContextLines || '(no context available — this is an account-level framework finding)'}\n\n` +
          `FORECAST (from the deterministic forecast module)\n${impactLine}\n` +
          (fc.formula ? `Formula: ${fc.formula}\n` : '') +
          (fc.confidence ? `Confidence: ${fc.confidence} — ${fc.confidenceReason || ''}\n` : '') +
          `\n` +
          `DIRECTION: ${dxn}\n` +
          `LEGAL RECOMMENDATIONS FOR THIS DIRECTION: ${legalRecs}\n\n` +
          `PRESCRIPTION (this is what will execute when Josh clicks Approve — your narrative must match it, not propose an alternative):\n${whatToFix}\n\n` +
          `BEST PRACTICE CONTEXT: ${bestPractice.summary}\n\n` +
          `Return a JSON object with exactly this field:\n` +
          `{\n` +
          `  "whyItShouldChange": "Two to three sentences explaining what the account is doing wrong, grounded ONLY in the campaign context and forecast numbers above. Frame dollar impact as contribution margin, not gross revenue. Do NOT suggest a different action than the Prescription. Do NOT invent numbers."\n` +
          `}`,
      }],
    }, 'gads-agent-card-writer')

    const text = response.content?.find(b => b.type === 'text')?.text || '{}'
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      whatToFix,
      whyItShouldChange: parsed.whyItShouldChange || templateWhy(finding, impact, direction),
    }
  } catch (err) {
    console.warn('[GadsIntel] writeCardCopy failed:', err.message)
    return {
      whatToFix,
      whyItShouldChange: templateWhy(finding, impact, direction),
    }
  }
}

// ── Deterministic template copy (for findings beyond the AI cap) ────────────

function templateWhatToFix(finding) {
  switch (finding.issueKey) {
    case 'campaign_zero_conversions':
      return `Pause the "${finding.entityName}" campaign and move its budget into campaigns with proven conversions.`
    case 'budget_reallocation':
      return `Reduce budget on "${finding.entityName}" and redirect it to the higher performing campaigns listed.`
    case 'keyword_zero_conversions':
      return `Pause "${finding.entityName}" and review search terms for a better-matching keyword variant.`
    case 'keyword_zero_impressions':
      return `Pause or remove "${finding.entityName}" as it has not served a single impression in the window.`
    case 'negative_candidate':
      return `Add "${finding.entityName}" as a campaign-level negative keyword to stop future wasted clicks.`
    case 'bid_underbid':
      return `Increase the bid on "${finding.entityName}" by 20 to 30 percent to capture more of its available traffic.`
    case 'low_quality_score':
      return `Improve ad relevance, landing page experience, or expected CTR for "${finding.entityName}" to lift Quality Score.`
    case 'disapproved_ad':
      return `Review the disapproval reason and fix or replace "${finding.entityName}" so it can serve again.`
    case 'shopping_product_zero_conversions':
      return `Review the product feed and landing experience for "${finding.entityName}" or exclude it from Shopping.`
    case 'framework_ncac_spike':
      return `Investigate which campaigns are driving the nCAC blowout. Compare the last 7 days of per-campaign spend and new-customer attribution against the prior week. Pause or reduce budget on the campaign(s) showing the biggest delta before the account hits the red band.`
    case 'framework_fov_cac_below_one':
      return `First-order gross profit is not covering acquisition cost. Review which campaigns are attracting lower-AOV customers and either tighten targeting, lift prices on hero SKUs, or raise bundle attach rate. If this persists for 2 more days the framework PAUSE gate triggers.`
    case 'framework_fov_cac_pause_gate':
      return `Framework PAUSE gate triggered — FOV/CAC has been below 1.0× for 3+ consecutive days. Pause the highest-spend, lowest-new-customer campaign(s) immediately and investigate offer, pricing, and targeting before resuming spend. This is the framework's hard stop.`
    case 'framework_sponge_alert':
      return `New customer count is falling sharply while ad spend has not pulled back. Audit creative fatigue, audience overlap, and whether recent ads are re-targeting existing buyers instead of acquiring new ones. Shift budget toward prospecting audiences until the new-customer trend recovers.`
    case 'framework_cm_negative':
      return `Contribution margin is negative — the account is losing money on new-customer acquisition after real costs. Immediately reduce blended spend or pause the worst-performing campaigns. Do not resume full budget until CM$ is back above zero for at least 3 consecutive days.`
    default:
      return `Review "${finding.entityName}" and apply the appropriate corrective action.`
  }
}

function templateWhy(finding, impact, direction) {
  const impactStr = impact > 0
    ? `Projected ${direction === 'save' ? 'monthly saving' : 'monthly revenue opportunity'} of approximately $${impact.toFixed(0)} AUD.`
    : ''
  switch (finding.issueKey) {
    case 'campaign_zero_conversions':
      return `This campaign has accumulated meaningful spend without producing a single conversion in the last 30 days. Every dollar it consumes is currently dropping straight to the floor. ${impactStr}`
    case 'keyword_zero_conversions':
      return `This keyword has passed the bleed threshold with zero conversions, which in a breakeven CPP of $49.35 is a clear signal of non-productive traffic. ${impactStr}`
    case 'negative_candidate':
      return `This search term has burned clicks without converting and carries a CTR low enough to indicate irrelevant intent. Negative listing it removes the leak at the source. ${impactStr}`
    case 'bid_underbid':
      return `This keyword is converting well below the breakeven CPP, which means there is headroom to scale bids and capture more of the available volume before the economics break. ${impactStr}`
    case 'low_quality_score':
      return `A Quality Score below 5 directly inflates effective CPCs and reduces ad rank, making every click more expensive than it needs to be. ${impactStr}`
    case 'disapproved_ad':
      return `A disapproved ad is not serving at all, which means the ad group is operating below its full inventory and potentially missing conversions entirely. ${impactStr}`
    case 'budget_reallocation':
      return `While this campaign is running below target ROAS, at least one other campaign is significantly above target. Shifting budget toward the proven winners improves blended account ROAS immediately. ${impactStr}`
    case 'shopping_product_zero_conversions':
      return `This Shopping product has consumed meaningful spend without producing sales. The feed, price, or product detail page likely needs attention before continuing to spend on it. ${impactStr}`
    case 'keyword_zero_impressions':
      return `A keyword with zero impressions over the full window is dead weight in the account structure. Removing it keeps the account clean and focused on the keywords that actually carry traffic.`
    case 'framework_ncac_spike':
      return `Blended new customer acquisition cost has pushed well past the 90-day baseline, which is the framework's early-warning band. Each new customer is now costing more than historical norms, which compresses contribution margin even if channel ROAS still looks healthy at Layer 4.`
    case 'framework_fov_cac_below_one':
      return `First-order gross profit is no longer covering the cost of acquiring the customer. Without a strong repeat cohort, this means every new customer is sold at a loss. The framework treats this as a warning and escalates to a hard pause if it persists for three consecutive days.`
    case 'framework_fov_cac_pause_gate':
      return `The framework's PAUSE gate has triggered — FOV/CAC has been below breakeven for three or more consecutive days. Continuing to spend at current levels is mathematically burning contribution margin on every new order. This is the framework's hard stop, not a soft warning.`
    case 'framework_sponge_alert':
      return `New customer volume is collapsing while ad spend stays flat or grows, which the framework calls a sponge pattern — the account is absorbing budget without producing the acquisitions that budget was meant to buy. Usually points to creative fatigue, audience overlap, or spend drifting into retargeting.`
    case 'framework_cm_negative':
      return `Contribution margin dollars is the framework's Layer 1 scoreboard, and it is now negative. After accounting for COGS, payment processing, shipping, and blended ad spend, the new customer revenue the account is generating does not cover its own delivery cost. Nothing else in the account matters until this flips back above zero.`
    default:
      return `This issue is reducing the efficiency of the account and should be addressed. ${impactStr}`
  }
}

// ── Proposed API change shape per finding ───────────────────────────────────

function buildProposedChange(finding) {
  switch (finding.issueKey) {
    case 'campaign_zero_conversions':
      return { action: 'PAUSE_CAMPAIGN', campaignId: finding.entityId }
    case 'budget_reallocation':
      return {
        action: 'REDUCE_CAMPAIGN_BUDGET',
        campaignId: finding.entityId,
        notes: 'Manual review recommended before reducing budget — flag for Josh to confirm target.',
      }
    case 'keyword_zero_conversions':
    case 'keyword_zero_impressions':
      return {
        action: 'PAUSE_KEYWORD',
        criterionId: finding.entityId,
        adGroupId: finding.rawData?.adGroupId || '',
      }
    case 'negative_candidate':
      return {
        action: 'ADD_NEGATIVE_KEYWORD',
        campaignId: finding.rawData?.campaignId || '',
        searchTerm: finding.entityId,
        matchType: 'PHRASE',
      }
    case 'bid_underbid':
      return {
        action: 'INCREASE_BID',
        criterionId: finding.entityId,
        adGroupId: finding.rawData?.adGroupId || '',
        multiplier: 1.25,
      }
    case 'low_quality_score':
    case 'disapproved_ad':
    case 'shopping_product_zero_conversions':
      return { action: 'MANUAL_REVIEW_REQUIRED', entityType: finding.entityType, entityId: finding.entityId }
    case 'framework_ncac_spike':
    case 'framework_fov_cac_below_one':
    case 'framework_fov_cac_pause_gate':
    case 'framework_sponge_alert':
    case 'framework_cm_negative':
      // Framework alerts are diagnostic, not executable. The agent flags them
      // so Josh can investigate at the account level — no single campaign
      // mutation resolves a Layer 1 / Layer 3 issue.
      return {
        action: 'FRAMEWORK_ALERT_REVIEW_REQUIRED',
        scope: 'account',
        issueKey: finding.issueKey,
        notes: 'Account-level framework alert. Review portfolio attribution and adjust spend / creative strategy manually — no single-entity mutation applies.',
      }
    default:
      return { action: 'MANUAL_REVIEW_REQUIRED' }
  }
}

// ── Main: convert findings into recommendation records ─────────────────────

/**
 * Takes the array of findings from the rules engine and produces
 * recommendation card objects ready to be inserted into the store.
 * Top `AI_ENRICHMENT_CAP` findings get full Claude + web search.
 * Rest get deterministic template cards.
 */
export async function buildRecommendationsFromFindings(findings, framework = null) {
  const cfg = getConfig()
  const out = []

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i]
    const { impact, direction } = projectImpact(finding, cfg)

    let bestPractice = {
      url: 'https://support.google.com/google-ads',
      summary: 'Standard Google Ads best practice for this issue type.',
    }
    let copy = {
      whatToFix: templateWhatToFix(finding),
      whyItShouldChange: templateWhy(finding, impact, direction),
    }

    // Only enrich the top N findings with Claude + web search to protect the budget
    if (i < AI_ENRICHMENT_CAP) {
      try {
        bestPractice = await searchBestPractice(finding.issueTitle)
        copy = await writeCardCopy(finding, bestPractice, impact, direction, cfg, framework)
      } catch (err) {
        console.warn(`[GadsIntel] Enrichment failed for finding ${i}:`, err.message)
      }
    }

    out.push({
      priority: i + 1,
      severity: finding.severity,
      category: finding.category,
      issueTitle: finding.issueTitle,
      whatToFix: copy.whatToFix,
      whyItShouldChange: copy.whyItShouldChange,
      projectedDollarImpact: impact,
      projectedImpactDirection: direction,
      bestPracticeSource: bestPractice.url,
      bestPracticeSummary: bestPractice.summary,
      entityType: finding.entityType,
      entityId: finding.entityId,
      entityName: finding.entityName,
      currentValue: finding.rawData,
      proposedChange: buildProposedChange(finding),
      fingerprint: finding.fingerprint,
    })
  }

  return out
}

// ── Daily intelligence briefing ─────────────────────────────────────────────

export async function generateIntelligenceBriefing(accountSummary, framework = null) {
  const cfg = getConfig()
  const frameworkBlock = renderFrameworkBlock(framework)
  try {
    const response = await callClaude({
      model: MODEL,
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system:
        `You are a senior Google Ads strategist for Gender Reveal Ideas (genderrevealideas.com.au), ` +
        `an Australian DTC gender reveal products business. Today is ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane' })}.\n\n` +
        `FRAMEWORK — use this language and hierarchy when discussing account health:\n` +
        `nCAC/LTGP framework (Taylor Holiday CTC). Six priority metrics top-to-bottom:\n` +
        `  CM$ (scoreboard, contribution margin dollars)\n` +
        `  nCAC (ad spend / new customers, new = customer.numberOfOrders == 1)\n` +
        `  FOV/CAC (first_order_aov × margin / nCAC, pause if <1.0x for 3+ days)\n` +
        `  LTGP:nCAC at specified window (green >5x, amber 3-5x, red <3x)\n` +
        `  aMER (new customer revenue / ad spend)\n` +
        `  New customer count daily.\n` +
        `4-layer hierarchy: Layer 1 CM$ → Layer 2 business metrics → Layer 3 customer metrics → Layer 4 channel ROAS. NEVER lead with Layer 4.\n` +
        `Revenue on a physical product business is vanity. Frame dollar claims as contribution margin or LTGP, never gross revenue.\n\n` +
        `FRAMEWORK METRICS ARE LIVE. The agent now computes Layer 1 CM$ and Layer 3 customer metrics (nCAC, FOV/CAC, aMER, new customer count, WoW trend) from the live Shopify customer index and blended Google+Meta spend. Use the exact numbers provided in the user message, do NOT fabricate values. LTGP:nCAC cohort tracking is still pending — if you need LTGP, say "not yet tracked" rather than inventing a number.\n\n` +
        `Write in plain Australian English. No dashes. Respond only with JSON, no markdown, no preamble.`,
      messages: [{
        role: 'user',
        content:
          `Compile today's Google Ads intelligence briefing for GRI covering:\n` +
          `1. Any Google Ads algorithm changes, Smart Bidding updates, or platform changes in the last 7 days\n` +
          `2. Seasonal search trends in Australia for gender reveal products, baby showers, or pregnancy announcements right now\n` +
          `3. Any Google Merchant Centre policy or Shopping ads changes\n` +
          `4. Strategic guidance using the nCAC/LTGP framework. Account summary: ${JSON.stringify(accountSummary)}.\n\n` +
          (frameworkBlock ? `${frameworkBlock}\n\n` : '') +
          `Return ONLY JSON with exactly these fields:\n` +
          `{\n` +
          `  "algorithmUpdates": "2-3 sentences on any platform changes",\n` +
          `  "seasonalOpportunities": "2-3 sentences on seasonal trends and opportunities (framed against acquiring new customers, not blended revenue)",\n` +
          `  "competitorSignals": "1-2 sentences on Shopping ads or DTC landscape",\n` +
          `  "accountHealthSummary": "1-2 sentences of strategic guidance. Lead with CM$ / profitability framing, not ROAS."\n` +
          `}`,
      }],
    }, 'gads-agent-briefing')

    const text = response.content?.find(b => b.type === 'text')?.text || '{}'
    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    console.warn('[GadsIntel] generateIntelligenceBriefing failed:', err.message)
    return {
      algorithmUpdates: 'No significant Google Ads platform updates detected in the last 7 days.',
      seasonalOpportunities: 'Monitor gender reveal and baby shower seasonal trends ahead of peak periods.',
      competitorSignals: 'No notable shifts in the DTC gender reveal landscape today.',
      accountHealthSummary: 'Continue monitoring account performance against breakeven CPP and target ROAS.',
    }
  }
}
