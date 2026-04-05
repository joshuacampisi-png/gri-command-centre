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

// ── AI-enriched card copy ───────────────────────────────────────────────────

async function writeCardCopy(finding, bestPractice, impact, direction, cfg) {
  try {
    const response = await callClaude({
      model: MODEL,
      max_tokens: 500,
      system:
        `You are an expert Google Ads strategist for Gender Reveal Ideas (genderrevealideas.com.au), ` +
        `an Australian DTC gender reveal products brand. Business constants: AOV $${cfg.avgOrderValueAud} AUD, ` +
        `gross margin ${Math.round(cfg.grossMarginPct * 100)}%, breakeven CPP $${cfg.breakevenCppAud} AUD, ` +
        `target ROAS ${cfg.targetRoas}x. Write in plain Australian English. No dashes. No AI filler phrases. ` +
        `Be direct and specific. Respond ONLY with a JSON object, no preamble, no markdown.`,
      messages: [{
        role: 'user',
        content:
          `Write a recommendation card for this Google Ads finding.\n\n` +
          `Issue: ${finding.issueTitle}\n` +
          `Category: ${finding.category}\n` +
          `Entity: ${finding.entityName} (${finding.entityType})\n` +
          `Raw data: ${JSON.stringify(finding.rawData).slice(0, 2000)}\n` +
          `Current best practice guidance: ${bestPractice.summary}\n` +
          `Projected impact: $${impact.toFixed(2)} AUD/month (${direction})\n\n` +
          `Return a JSON object with exactly these three fields:\n` +
          `{\n` +
          `  "whatToFix": "One clear sentence describing the specific action to take",\n` +
          `  "whyItShouldChange": "Two sentences explaining what is happening and why the change matters in business terms",\n` +
          `  "salesImpact": "One sentence on the expected improvement in sales or cost efficiency"\n` +
          `}`,
      }],
    }, 'gads-agent-card-writer')

    const text = response.content?.find(b => b.type === 'text')?.text || '{}'
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      whatToFix: parsed.whatToFix || templateWhatToFix(finding),
      whyItShouldChange: `${parsed.whyItShouldChange || ''} ${parsed.salesImpact || ''}`.trim()
        || templateWhy(finding, impact, direction),
    }
  } catch (err) {
    console.warn('[GadsIntel] writeCardCopy failed:', err.message)
    return {
      whatToFix: templateWhatToFix(finding),
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
export async function buildRecommendationsFromFindings(findings) {
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
        copy = await writeCardCopy(finding, bestPractice, impact, direction, cfg)
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

export async function generateIntelligenceBriefing(accountSummary) {
  try {
    const response = await callClaude({
      model: MODEL,
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system:
        `You are a senior Google Ads strategist for Gender Reveal Ideas (genderrevealideas.com.au), ` +
        `an Australian DTC gender reveal products business. Today is ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane' })}. ` +
        `Write in plain Australian English. No dashes. Respond only with JSON, no markdown, no preamble.`,
      messages: [{
        role: 'user',
        content:
          `Search the web and compile today's Google Ads intelligence briefing covering:\n` +
          `1. Any Google Ads algorithm changes, Smart Bidding updates, or platform changes in the last 7 days\n` +
          `2. Seasonal search trends in Australia relevant to gender reveal products, baby showers, or pregnancy announcements right now\n` +
          `3. Any Google Merchant Centre policy updates or Shopping ads changes\n` +
          `4. Strategic guidance for today given the account summary: ${JSON.stringify(accountSummary)}\n\n` +
          `Return ONLY JSON with exactly these fields:\n` +
          `{\n` +
          `  "algorithmUpdates": "2-3 sentences on any platform changes",\n` +
          `  "seasonalOpportunities": "2-3 sentences on seasonal trends and opportunities",\n` +
          `  "competitorSignals": "1-2 sentences on Shopping ads or DTC landscape",\n` +
          `  "accountHealthSummary": "1-2 sentences of strategic guidance given the summary"\n` +
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
