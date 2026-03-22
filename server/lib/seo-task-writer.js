/**
 * SEO Task Writer — PABLO SYSTEM UPDATE 18 March 2026
 * Triple-check validation before any SEO content goes live.
 * Deduplication before lodging tasks.
 * GRI only.
 */

import { callClaude } from './claude-guard.js'
import { env } from './env.js'
import { getThemeAsset, updateThemeAsset, listThemeAssets } from './shopify-dev.js'
import { createAutoTask, hasBeenSeen } from './auto-task-store.js'
const PREVIEW_THEME_ID = env.shopify.previewThemeId || '161462583385'
const LIVE_THEME_ID    = env.shopify.liveThemeId    || '162307735641'
const STORE_DOMAIN     = env.shopify.storeDomain    || 'bdd19a-3.myshopify.com'
const STORE_URL        = `https://genderrevealideas.com.au`

function previewLink(path = '') {
  return `https://${STORE_DOMAIN}?preview_theme_id=${PREVIEW_THEME_ID}&path=${encodeURIComponent(path)}`
}

// ─────────────────────────────────────────────────────────────
// TRIPLE-CHECK VALIDATION (PABLO SYSTEM UPDATE — Rule 2)
// All SEO content must pass 3 checks before staging to preview.
// ─────────────────────────────────────────────────────────────

/**
 * Check 1 — Technical Validation
 * Returns { pass: boolean, issues: string[] }
 */
function technicalValidation(content, type, existingPagesContent = []) {
  const issues = []

  if (type === 'meta-description') {
    if (content.length < 120) issues.push(`Too short: ${content.length} chars (min 120)`)
    if (content.length > 160) issues.push(`Too long: ${content.length} chars (max 160)`)

    // Keyword stuffing: check if any single word repeats more than 3% of total words
    const words = content.toLowerCase().split(/\s+/)
    const freq = {}
    for (const w of words) freq[w] = (freq[w] || 0) + 1
    const stuffed = Object.entries(freq).filter(([w, c]) => c / words.length > 0.08 && w.length > 3)
    if (stuffed.length > 0) issues.push(`Keyword stuffing: "${stuffed[0][0]}" appears too frequently`)

    // Duplicate content check
    for (const existing of existingPagesContent) {
      if (existing && existing.toLowerCase() === content.toLowerCase()) {
        issues.push('Duplicate: identical to another page meta description')
        break
      }
    }
  }

  if (type === 'meta-title') {
    if (content.length < 50) issues.push(`Too short: ${content.length} chars (min 50)`)
    if (content.length > 60) issues.push(`Too long: ${content.length} chars (max 60)`)
  }

  if (type === 'h1') {
    if (!content.trim()) issues.push('H1 is empty')
    if (content.length > 100) issues.push(`H1 too long: ${content.length} chars`)
  }

  return { pass: issues.length === 0, issues }
}

/**
 * Check 2 — Quality Review
 * Returns { pass: boolean, issues: string[] }
 */
function qualityReview(content, type, pageContext = '') {
  const issues = []

  // Natural language check: no all-caps words (unless acronym), no pipe spam
  if (/\b[A-Z]{4,}\b/.test(content) && !/\b(SEO|GRI|HTML|API|CTR|FAQ|H1|H2)\b/.test(content)) {
    issues.push('Contains ALL-CAPS word — reads unnatural')
  }

  // Pipe spam check (Shopify title templates sometimes use | Shopify Store)
  const pipeCount = (content.match(/\|/g) || []).length
  if (pipeCount > 2) issues.push('Too many pipe separators — reads unnatural')

  // Australian English check: flag obvious US spellings
  const usSpellings = { 'color': 'colour', 'analyze': 'analyse', 'center': 'centre', 'organize': 'organise' }
  for (const [us, au] of Object.entries(usSpellings)) {
    if (new RegExp(`\\b${us}\\b`, 'i').test(content)) {
      issues.push(`US spelling detected: "${us}" → should be "${au}" (Australian English)`)
    }
  }

  // Primary keyword presence (for meta descriptions)
  if (type === 'meta-description') {
    const hasKeyword = /gender reveal/i.test(content) || /gri/i.test(content)
    if (!hasKeyword && pageContext !== '/pages/about' && pageContext !== '/pages/contact') {
      issues.push('Missing primary keyword "gender reveal" — low SEO value')
    }
  }

  return { pass: issues.length === 0, issues }
}

/**
 * Check 3 — Regression Check
 * Is the new content better than the current?
 * Returns { pass: boolean, reason: string, score: { old: number, new: number } }
 */
function regressionCheck(oldContent, newContent, type) {
  if (!oldContent || oldContent === '(none set)') {
    return { pass: true, reason: 'No existing content — new content is an improvement', score: { old: 0, new: 100 } }
  }

  const score = (content, type) => {
    let s = 50
    if (type === 'meta-description') {
      if (content.length >= 120 && content.length <= 160) s += 20
      if (/gender reveal/i.test(content)) s += 15
      if (/australia/i.test(content)) s += 10
      if (/shop|buy|order|explore|discover/i.test(content)) s += 5
    }
    return Math.min(100, s)
  }

  const oldScore = score(oldContent, type)
  const newScore = score(newContent, type)

  if (newScore < oldScore) {
    return {
      pass: false,
      reason: `New content scores lower than current (old: ${oldScore}, new: ${newScore}). Not replacing.`,
      score: { old: oldScore, new: newScore }
    }
  }

  return {
    pass: true,
    reason: `Improvement confirmed (old: ${oldScore}/100 → new: ${newScore}/100)`,
    score: { old: oldScore, new: newScore }
  }
}

/**
 * Run all 3 checks. Returns { pass, check1, check2, check3, allIssues }
 */
export function runTripleCheck(content, type, { oldContent, existingPagesContent = [], pageContext = '' } = {}) {
  const check1 = technicalValidation(content, type, existingPagesContent)
  const check2 = qualityReview(content, type, pageContext)
  const check3 = regressionCheck(oldContent, content, type)

  const allIssues = [
    ...check1.issues.map(i => `[Technical] ${i}`),
    ...check2.issues.map(i => `[Quality] ${i}`),
    ...(!check3.pass ? [`[Regression] ${check3.reason}`] : [])
  ]

  const pass = check1.pass && check2.pass && check3.pass

  return { pass, check1, check2, check3, allIssues }
}

// ─────────────────────────────────────────────────────────────
// SEO IMPACT DATA
// ─────────────────────────────────────────────────────────────

const SEO_IMPACT = {
  'Missing meta description': {
    impact: 'High revenue impact. Pages without meta descriptions get auto-generated snippets by Google — typically lower CTR. Studies show optimised meta descriptions improve CTR by 5–10% on average.',
    fix_type: 'meta',
    effort: 'Low',
  },
  'Meta description too long': {
    impact: 'Google truncates descriptions over ~155 chars, cutting off your CTA. Truncated descriptions reduce CTR by reducing message clarity in search results.',
    fix_type: 'meta',
    effort: 'Low',
  },
  'Meta description too short': {
    impact: 'Short descriptions leave keyword real estate unused and miss your CTA opportunity. Google may auto-generate instead.',
    fix_type: 'meta',
    effort: 'Low',
  },
  'Missing title tag': {
    impact: 'Critical. Title tags are the #1 on-page SEO factor. Missing titles cause Google to generate their own — typically lower-quality and not keyword-optimised.',
    fix_type: 'meta',
    effort: 'Low',
  },
  'Title too short': {
    impact: 'Short titles leave keyword real estate unused. Optimal title length is 50–60 chars. Each unused char is a missed ranking opportunity.',
    fix_type: 'meta',
    effort: 'Low',
  },
  'Title too long': {
    impact: 'Titles over 60 chars get truncated in SERPs. Your brand name and key CTA may be cut off, reducing CTR and brand recognition.',
    fix_type: 'meta',
    effort: 'Low',
  },
  'image(s) missing alt text': {
    impact: 'Google Images is a significant traffic source for product-based ecommerce. Alt text is the primary signal for image indexing. Missing alt text = invisible to image search. Also affects WCAG accessibility compliance.',
    fix_type: 'alt_text',
    effort: 'Medium',
  },
  'Missing H1 tag': {
    impact: 'H1 is the strongest on-page keyword signal after title tag. Missing H1 means Google has weaker understanding of page topic.',
    fix_type: 'content',
    effort: 'Low',
  },
  'Multiple H1 tags': {
    impact: 'Multiple H1s dilute keyword signals and confuse search engines about page topic. Only one H1 should be present.',
    fix_type: 'content',
    effort: 'Low',
  },
  'H1 capitalisation': {
    impact: 'Inconsistent capitalisation looks unprofessional in branded search results and can affect how Google displays your brand.',
    fix_type: 'content',
    effort: 'Low',
  },
  'Missing canonical': {
    impact: 'Without a canonical tag, Google may index duplicate versions of your page (www vs non-www, trailing slash variants), splitting link equity.',
    fix_type: 'technical',
    effort: 'Low',
  },
  'Missing Open Graph': {
    impact: 'Open Graph tags control how your page appears when shared on Facebook, Instagram, and Messenger. Missing OG tags result in poor previews that reduce social traffic.',
    fix_type: 'technical',
    effort: 'Low',
  },
  'No JSON-LD schema markup found': {
    impact: 'Schema markup enables rich results (star ratings, price, availability) in Google SERPs. Rich results have 20–30% higher CTR than standard results.',
    fix_type: 'schema',
    effort: 'Medium',
  },
  'Page failed to load': {
    impact: 'Critical. 404 pages waste crawl budget, destroy link equity, and deliver terrible UX to users following old links or ads.',
    fix_type: 'redirect',
    effort: 'Low',
  },
  'Missing viewport': {
    impact: 'Critical for mobile SEO. Without viewport meta, mobile users see desktop layout. Google uses mobile-first indexing — this directly impacts rankings.',
    fix_type: 'technical',
    effort: 'Low',
  },
}

function getImpactData(issue) {
  for (const [key, data] of Object.entries(SEO_IMPACT)) {
    if (issue.toLowerCase().includes(key.toLowerCase())) return data
  }
  return { impact: 'Contributes to overall SEO health and site quality score.', fix_type: 'general', effort: 'Low' }
}

// ─────────────────────────────────────────────────────────────
// TASK BRIEF GENERATION
// ─────────────────────────────────────────────────────────────

async function generateTaskBrief(finding, company) {
  const impactData = getImpactData(finding.issue)
  const storeUrl = STORE_URL + finding.page

  const prompt = `You are Pablo Escobot, SEO director for ${company === 'GRI' ? 'Gender Reveal Ideas (genderrevealideas.com.au)' : company}.

Write a concise, data-backed task brief for this SEO finding. Be specific, direct, and actionable. Australian English.

FINDING:
- Page: ${finding.page}
- Issue: ${finding.issue}
- Severity: ${finding.severity}
- SEO Impact: ${impactData.impact}

Write the brief in this exact format (plain text, no markdown):

WHAT TO FIX
[One sentence describing exactly what needs to be changed on the page]

WHY THIS MATTERS
[2-3 sentences explaining the SEO and revenue impact using the data provided. Be specific to GRI's market — gender reveal products, Australian ecommerce.]

EXPECTED OUTCOME
[What will improve after this fix — be specific. E.g. "Estimated 5-8% improvement in CTR for this page based on industry benchmarks for optimised meta descriptions in the party supplies niche."]

ACCEPTANCE CRITERIA
[Bullet list of exactly what done looks like — what a developer should verify before marking complete]

Keep it under 200 words total. Be direct and data-backed. Australian English.`

  try {
    const msg = await callClaude({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    }, 'seo-task-writer')
    return msg.content[0]?.text || ''
  } catch(e) {
    return `Issue: ${finding.issue}\nPage: ${finding.page}\nSeverity: ${finding.severity}`
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN TASK LODGER — LOCAL DASHBOARD ONLY. NEVER NOTION.
// ─────────────────────────────────────────────────────────────

export async function processAndLodgeTask(finding, company = 'GRI') {
  // Dedup gate — if this exact issue+page has EVER been seen, skip forever
  if (hasBeenSeen(finding.issue, finding.page)) {
    console.log(`[TaskWriter] SKIP (permanent memory): ${finding.issue} on ${finding.page}`)
    return null
  }

  const impactData = getImpactData(finding.issue)
  const brief      = await generateTaskBrief(finding, company)
  const preview    = previewLink(finding.page)

  const shortIssue = finding.issue.length > 50 ? finding.issue.slice(0, 50) + '...' : finding.issue
  const title      = `[SEO] ${shortIssue} - ${finding.page}`

  const fullDescription = `PAGE: ${finding.page}
ISSUE: ${finding.issue}
SEVERITY: ${finding.severity}
EFFORT: ${impactData.effort}
PREVIEW: ${preview}

${brief}

---
Source: seo-flywheel | ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`

  // Write to local store only — QA gate is inside createAutoTask
  const result = await createAutoTask({
    issue:       finding.issue,
    page:        finding.page,
    severity:    finding.severity,
    priority:    finding.severity === 'High' ? 'High' : finding.severity === 'Medium' ? 'Medium' : 'Low',
    company,
    title,
    description: fullDescription,
    previewUrl:  preview,
    brief,
    effort:      impactData.effort,
    source:      'seo-flywheel',
  })

  if (!result) return null // QA failed or duplicate
  return { task: result.task, brief, preview, finding, impactData }
}

// ─────────────────────────────────────────────────────────────
// FULL FLYWHEEL RUNNER
// Dedup is handled entirely inside createAutoTask / hasBeenSeen.
// This function just drives the loop.
// ─────────────────────────────────────────────────────────────

export async function runFullFlywheelWithBriefs(findings, company = 'GRI') {
  const results  = []
  let   skipped  = 0

  // Sort High → Medium → Low — only process High + Medium
  const toProcess = [...findings]
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.severity] ?? 3))
    .filter(f => f.severity === 'High' || f.severity === 'Medium')

  for (const finding of toProcess) {
    try {
      // hasBeenSeen check happens inside processAndLodgeTask → createAutoTask
      const result = await processAndLodgeTask(finding, company)
      if (!result) { skipped++; continue }
      results.push(result)
      await new Promise(r => setTimeout(r, 600)) // rate limit Claude API
    } catch(e) {
      console.error('[Flywheel] Task error:', e.message)
    }
  }

  console.log(`[Flywheel] ✅ ${results.length} new tasks stored locally | ${skipped} already seen — skipped forever`)
  return results
}
