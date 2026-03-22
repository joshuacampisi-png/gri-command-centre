/**
 * Article Generator
 * ─────────────────────────────────────────────────────────────
 * Generates full 1,200-word SEO blog articles via Claude API.
 * Matches Gender Reveal Ideas brand voice and SEO architecture.
 * ─────────────────────────────────────────────────────────────
 */

import { callClaude } from './claude-guard.js'

// ── Brand rules enforced in every prompt ─────────────────────

function buildSystemPrompt() {
  return `You are the in-house SEO content writer for Gender Reveal Ideas (genderrevealideas.com.au), a Gold Coast Australia brand selling gender reveal products that ships Australia-wide.

Your writing style rules (non-negotiable):
- NO dashes anywhere. Not em dashes, not en dashes, not hyphens in sentences. Use commas or rewrite.
- Plain warm Australian English. Conversational but informative.
- Celebratory, excited tone that matches a party brand. This is a fun category.
- Second person ("you", "your") throughout the article body.
- Short paragraphs. Max 3 sentences per paragraph.
- Use real Australian context: baby showers, backyard parties, families, Gold Coast summer, etc.
- Internal links use the exact format: <a href="https://genderrevealideas.com.au/[path]">anchor text</a>
- All headings use H2 and H3 only. No H1 (that is the title).
- FAQ section uses schema-ready format (instructions given below).
- E-E-A-T signals: mention the brand's experience, real customers, Australia-wide shipping.
- Business name: Gender Reveal Ideas
- Website: genderrevealideas.com.au
- Contact: hello@genderrevealideas.com.au
- Phone: 0406860077
- Location: Gold Coast, shipping Australia-wide
- Author: Gender Reveal Ideas Team

You always output in the EXACT structured format requested. No preamble, no commentary outside the format.`
}

function buildArticlePrompt(spike) {
  const kw = spike.keyword
  const isCannonRelated =
    kw.toLowerCase().includes('volcano') ||
    kw.toLowerCase().includes('cannon') ||
    kw.toLowerCase().includes('tnt')

  const productContext = isCannonRelated
    ? `PRODUCT BEING WRITTEN ABOUT:
- Product name: Gender Reveal TNT (also known as the Gender Reveal Volcano Cannon by customers)
- What it is: A dramatic TNT-style gender reveal device that explodes in pink or blue powder or confetti
- Page to backlink (product page): https://genderrevealideas.com.au/collections/gender-reveal-cannons
- Page to backlink (hire page): https://genderrevealideas.com.au/collections/gri-rental
- Hire option: Yes, this product is available for hire for local Gold Coast events
- Price hint: reference "affordable" without a specific price (prices change)
- Related products to mention: confetti cannons, powder cannons, smoke bombs`
    : `PRODUCT CONTEXT:
- Write about: "${kw}" as it relates to gender reveal party products in Australia
- Link back to: https://genderrevealideas.com.au/collections/all
- Mention hire option: https://genderrevealideas.com.au/collections/gri-rental
- Tone: fun, celebratory, Australian`

  const spikeInfo = spike.changePercent
    ? `+${spike.changePercent}% above 30-day average`
    : spike.percentIncrease
      ? `Breakout rising query at +${spike.percentIncrease}%`
      : 'Rising search trend'

  return `Write a complete, publish-ready 1,200-word SEO blog article for the following trending search term:

TRENDING SEARCH TERM: "${kw}"
SPIKE DATA: ${spikeInfo}
GEO: Australia

${productContext}

OUTPUT THIS EXACT FORMAT (copy the section markers exactly, I will parse by them):

===SEO_TITLE===
[Your SEO title here. Max 60 characters. Include primary keyword. No pipes or dashes. Use a colon if needed.]

===SEO_DESCRIPTION===
[Your meta description here. Max 155 characters. Includes keyword. Has a CTA. No dashes. Ends without a period.]

===URL_HANDLE===
[URL slug. All lowercase. Hyphens between words. No special characters. No trailing hyphens. Max 60 characters. E.g. gender-reveal-volcano-cannon-ideas-australia]

===TITLE===
[Article H1 title. Can differ slightly from SEO title. Exciting, clickable. No dashes.]

===EXCERPT===
[2-sentence article summary. This shows on blog listing page. Plain text, no HTML. No dashes.]

===TAGS===
[Comma-separated tags. 5 to 8 tags. Use: Gender Reveal, Australia, [specific product term], [one seasonal tag], Gender Reveal Party Ideas, Gender Reveal Supplies]

===BODY===
[Full article HTML. Use only: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a href="">.

Structure:
- Opening paragraph (no heading): 2-3 sentences, hook the reader on why this trend is exploding right now
- H2: What Is a [Trending Term]?
- H2: Why Australian Families Are Choosing [Trending Term]
- H2: How to Use [Trending Term] at Your Gender Reveal Party
- H2: [Trending Term] Ideas for Every Style of Party
- H2: Frequently Asked Questions About [Trending Term]
  (FAQ section with 4 questions formatted as:)
  <div class="faq-item">
    <h3 class="faq-question">[Question here?]</h3>
    <div class="faq-answer"><p>[Answer here. 2-3 sentences.]</p></div>
  </div>
- Closing paragraph: no heading, 2-3 sentences, strong CTA to shop/hire at genderrevealideas.com.au

INTERNAL LINKS REQUIRED (place naturally in body text):
1. Link to product/collection page at least twice
2. Link to hire page at least once with anchor text like "gender reveal hire on the Gold Coast"
3. Do NOT link to any external sites

WORD COUNT TARGET: 1,100 to 1,300 words]

===END===`
}

// ── Response parser ───────────────────────────────────────────

function extract(rawText, marker, nextMarker) {
  const start = rawText.indexOf(`===${marker}===`)
  const end   = nextMarker
    ? rawText.indexOf(`===${nextMarker}===`)
    : rawText.indexOf('===END===')
  if (start === -1) return ''
  return rawText.slice(start + marker.length + 6, end).trim()
}

// Validate no dashes in text metadata fields
function validateNoDashes(fields) {
  const warnings = []
  for (const [name, val] of Object.entries(fields)) {
    if ((val || '').includes(' - ') || (val || '').includes(' — ') || (val || '').includes(' – ')) {
      warnings.push(`Dash detected in ${name}: "${val}"`)
    }
  }
  return warnings
}

function parseArticleResponse(rawText, spike) {
  const seoTitle      = extract(rawText, 'SEO_TITLE', 'SEO_DESCRIPTION')
  const seoDesc       = extract(rawText, 'SEO_DESCRIPTION', 'URL_HANDLE')
  const urlHandle     = extract(rawText, 'URL_HANDLE', 'TITLE')
  const title         = extract(rawText, 'TITLE', 'EXCERPT')
  const excerpt       = extract(rawText, 'EXCERPT', 'TAGS')
  const tagsRaw       = extract(rawText, 'TAGS', 'BODY')
  const body          = extract(rawText, 'BODY', null)

  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

  // Clean handle: lowercase, hyphens only, no trailing hyphens
  const cleanHandle = urlHandle
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  // Validate
  const warnings = validateNoDashes({ seoTitle, seoDesc, title, excerpt })
  if (warnings.length) {
    warnings.forEach(w => console.warn(`[ArticleGenerator] WARNING: ${w}`))
  }

  return {
    title:           title.slice(0, 255),
    handle:          cleanHandle.slice(0, 60),
    body_html:       body,
    summary_html:    `<p>${excerpt}</p>`,
    seo_title:       seoTitle.slice(0, 60),
    seo_description: seoDesc.slice(0, 155),
    tags,
    author:          'Gender Reveal Ideas Team',
    spike,
  }
}

// ── Main export ───────────────────────────────────────────────

export async function generateFullArticle(spike) {
  console.log(`[ArticleGenerator] Generating article for spike: "${spike.keyword}"`)

  const message = await callClaude({
    model:      'claude-opus-4-5',
    max_tokens: 4000,
    system:     buildSystemPrompt(),
    messages:   [{ role: 'user', content: buildArticlePrompt(spike) }],
  }, 'article-generator')

  const rawText = message.content[0].text
  const article = parseArticleResponse(rawText, spike)

  console.log(`[ArticleGenerator] ✅ Article generated: "${article.title}" — handle: ${article.handle}`)
  console.log(`[ArticleGenerator]    SEO title (${article.seo_title.length} chars): ${article.seo_title}`)
  console.log(`[ArticleGenerator]    SEO desc  (${article.seo_description.length} chars): ${article.seo_description}`)

  return article
}
