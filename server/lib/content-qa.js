/**
 * content-qa.js
 * ─────────────────────────────────────────────────────────────
 * Pre-publish content quality gate. Blocks the autopublish
 * pipeline if the article has:
 *  - Placeholder tokens ([insert X], TODO, TBD, Lorem ipsum)
 *  - Unfilled template slots ([product name], {{keyword}})
 *  - Skeleton sections (H2 with <80 words of body after it)
 *  - Fabricated quotes (any quoted line not in the provided
 *    evidence sources)
 *
 * Two-layer check:
 *  1. Fast regex scan for placeholder + skeleton patterns
 *  2. Haiku vision: given the article + the list of verified
 *     quotes, flag any <blockquote> or "..." attributions that
 *     don't match the verified set
 * ─────────────────────────────────────────────────────────────
 */

import { callClaude } from './claude-guard.js'

const PLACEHOLDER_PATTERNS = [
  /\[insert [^\]]*\]/gi,
  /\[add [^\]]*\]/gi,
  /\[product name\]/gi,
  /\[keyword\]/gi,
  /\[your [^\]]*\]/gi,
  /\[todo\]/gi,
  /\bTODO\b/g,
  /\bTBD\b/g,
  /\bFIXME\b/g,
  /lorem ipsum/gi,
  /\{\{[^}]+\}\}/g, // unrendered handlebars / mustache
  /XX+\s*(seconds|minutes|metres|m)\b/gi, // "XX seconds", "XXX metres"
  /\$X+\b/g, // "$X", "$XX" pricing placeholders
]

// Known system-template strings that are NOT fabricated quotes
// even though they contain words like "our team" / "GRI team"
const CALLOUT_WHITELIST = [
  'pro tip from our team',
  "mum's quick picks",
  'safe for the whole family',
  'gentle on the planet',
  'did you know',
  'gender reveal ideas team',
  'by the gender reveal ideas team',
]

/**
 * @param {string} bodyHtml
 * @param {Array<{quote: string, speaker: string, videoUrl: string}>} verifiedQuotes
 * @param {Array<{title: string, handle: string, url: string}>} knownProducts — best-sellers list so AI can distinguish real from fabricated
 * @param {object} opts
 * @returns {Promise<{ok: boolean, issues: string[]}>}
 */
export async function validateContent(bodyHtml, verifiedQuotes = [], knownProducts = [], { skipHaiku = false, minSectionWords = 70 } = {}) {
  const issues = []

  // ── Layer 1: regex scan ─────────────────────────────────────
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = bodyHtml.match(pattern)
    if (matches && matches.length > 0) {
      issues.push(`Placeholder found: "${matches[0]}" (${matches.length}x)`)
    }
  }

  // ── Layer 2: skeleton section detection ─────────────────────
  const h2Blocks = splitOnH2(bodyHtml)
  for (const block of h2Blocks) {
    const text = stripHtml(block.body)
    const words = text.split(/\s+/).filter(Boolean).length
    // Skip short-answer-style sections + FAQ heading
    if (words < minSectionWords && !/frequently asked|short answer/i.test(block.heading)) {
      issues.push(`Skeleton section: "${block.heading.slice(0, 60)}" only ${words} words`)
    }
  }

  // ── Layer 2b: required sections ─────────────────────────────
  if (!/<h2[^>]*>\s*Frequently Asked Questions/i.test(bodyHtml)) {
    issues.push('Missing required "Frequently Asked Questions" section')
  }

  // ── Layer 2c: clean completion check ────────────────────────
  // Article should end with a closing tag or a full-stop, not mid-word
  const tail = stripHtml(bodyHtml).slice(-80).trim()
  const endsClean = /[.!?][")]*\s*$/.test(tail) || /<\/(p|script|article|blockquote)>\s*$/i.test(bodyHtml.trim())
  if (!endsClean) {
    issues.push(`Article appears truncated (last 40 chars: "${tail.slice(-40)}")`)
  }

  // ── Layer 3: quote verification ─────────────────────────────
  const blockquoteRe = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi
  const pQuoteRe = /["“"]([^"""]{20,300})["""][^<]{0,60}(michael puts it|says michael|michael said|michael explains)/gi

  const foundQuotes = []
  let m
  while ((m = blockquoteRe.exec(bodyHtml)) !== null) {
    const txt = stripHtml(m[1]).trim()
    if (!isWhitelistedCallout(txt)) foundQuotes.push(txt)
  }
  while ((m = pQuoteRe.exec(bodyHtml)) !== null) {
    foundQuotes.push(m[1].trim())
  }

  if (foundQuotes.length > 0) {
    const verified = verifiedQuotes.map(q => normalize(q.quote))
    for (const q of foundQuotes) {
      const nq = normalize(q)
      if (!nq) continue
      const matched = verified.some(v =>
        v.includes(nq.slice(0, 30)) || nq.includes(v.slice(0, 30)),
      )
      if (!matched) {
        issues.push(`Unverified quote (not in transcript set): "${q.slice(0, 80)}..."`)
      }
    }
  }

  // ── Layer 4: Haiku vibe check (optional) ────────────────────
  if (!skipHaiku) {
    try {
      const haikuCheck = await haikuScan(bodyHtml, verifiedQuotes, knownProducts)
      if (haikuCheck.issues?.length) issues.push(...haikuCheck.issues.map(i => `AI: ${i}`))
    } catch (e) {
      console.warn('[ContentQA] Haiku scan skipped:', e.message)
    }
  }

  return { ok: issues.length === 0, issues }
}

function isWhitelistedCallout(text) {
  const t = String(text).toLowerCase().trim()
  return CALLOUT_WHITELIST.some(w => t.startsWith(w) || t.includes(w))
}

function splitOnH2(bodyHtml) {
  const blocks = []
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi
  let m
  while ((m = re.exec(bodyHtml)) !== null) {
    blocks.push({ heading: stripHtml(m[1]).trim(), body: m[2] || '' })
  }
  return blocks
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ────────────────────────────────────────────────────────────
// Haiku scan — trim article to save tokens
// ────────────────────────────────────────────────────────────

async function haikuScan(bodyHtml, verifiedQuotes, knownProducts = []) {
  const bodyText = stripHtml(bodyHtml).slice(0, 10000)
  const verifiedSummary = verifiedQuotes.length
    ? verifiedQuotes.map(q => `- "${q.quote}" — ${q.speaker}`).join('\n')
    : '(no verified quotes supplied — so any "Michael said" or "our team says" quote is fabricated and should be flagged)'
  const productSummary = knownProducts.length
    ? knownProducts.map(p => `- ${p.title}`).join('\n')
    : '(no product list supplied — do NOT flag product names as fabricated)'

  const msg = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `You are a pre-publish content QA reviewer for Gender Reveal Ideas blog articles. Flag ONLY clear-cut problems, not stylistic or cautious editorial concerns.

BLOCK on these:
1. Fabricated direct quotes attributed to "Michael" / "Michael said" / "says Michael" that are NOT in the verified list
2. Unfilled template placeholders the regex missed (e.g. "[insert X]", "{{keyword}}")
3. Obvious truncation (article ends mid-sentence or mid-list)

DO NOT flag:
- Callout box titles like "Pro tip from our team", "Safe for the whole family", "Gentle on the planet", "Mum's Quick Picks" — these are SYSTEM TEMPLATES not fabricated quotes
- Author attribution "By the Gender Reveal Ideas Team"
- Real GRI product names that appear in the KNOWN PRODUCTS list below
- General safety / shipping / eco claims (those are editorial positioning, not QA blockers)
- Stylistic tone preferences

Respond ONLY as JSON:
{"issues": ["concise issue 1", "concise issue 2"]}

If the article looks clean, return {"issues": []}.`,
    messages: [{
      role: 'user',
      content: `VERIFIED QUOTES (anything else attributed to Michael is fabricated):
${verifiedSummary}

KNOWN GRI PRODUCTS (do NOT flag these as fabricated even if unfamiliar):
${productSummary}

ARTICLE BODY (text only):
${bodyText}`,
    }],
  }, 'blog-content-qa')

  const text = msg.content?.[0]?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { issues: [] }
  try {
    const parsed = JSON.parse(jsonMatch[0])
    return { issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5) : [] }
  } catch { return { issues: [] } }
}
