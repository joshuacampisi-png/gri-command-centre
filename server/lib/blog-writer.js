/**
 * Blog Writer
 * ─────────────────────────────────────────────────────────────
 * Full SEO blog article generator for Gender Reveal Ideas.
 * Uses Claude API with comprehensive system prompt, keyword
 * architecture, and editorial standards.
 * ─────────────────────────────────────────────────────────────
 */

import { callClaude } from './claude-guard.js'

// ── Article type config ───────────────────────────────────────

const ARTICLE_TYPES = {
  informational:  { label: 'Informational / How-To', wordRange: '1,800-2,500' },
  listicle:       { label: 'Listicle / Roundup',     wordRange: '1,500-2,200' },
  buying_guide:   { label: 'Product / Buying Guide',  wordRange: '2,000-3,000' },
  comparison:     { label: 'Comparison',              wordRange: '1,800-2,500' },
  local_seasonal: { label: 'Local / Seasonal',        wordRange: '1,200-1,800' },
  pillar:         { label: 'Pillar / Cornerstone',    wordRange: '3,000-5,000' },
}

export { ARTICLE_TYPES }

// ── Live product context from Shopify ─────────────────────────

async function fetchProductContext(keyword) {
  try {
    const store = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
    if (!token) return ''

    const searchTerm = keyword.replace(/gender reveal\s*/i, '').trim() || 'gender reveal'
    const url = `https://${store}/admin/api/2026-01/products.json?title=${encodeURIComponent(searchTerm)}&limit=5&fields=title,handle,body_html,product_type,tags,variants`

    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''

    const data = await res.json()
    let products = data.products || []

    if (products.length === 0) {
      const fallback = await fetch(
        `https://${store}/admin/api/2026-01/products.json?limit=5&fields=title,handle,product_type,tags,variants`,
        { headers: { 'X-Shopify-Access-Token': token }, signal: AbortSignal.timeout(8000) }
      )
      if (fallback.ok) {
        const fd = await fallback.json()
        products = fd.products || []
      }
    }

    if (products.length === 0) return ''

    const lines = products.map(p => {
      const price = p.variants?.[0]?.price ? `$${p.variants[0].price}` : 'POA'
      return `- ${p.title} (${price}) → genderrevealideas.com.au/products/${p.handle}`
    })

    return `\nLIVE GRI PRODUCTS (use these for accurate internal links and product references):\n${lines.join('\n')}\n`
  } catch (e) {
    console.warn('[BlogWriter] Could not fetch products:', e.message)
    return ''
  }
}

// ── System prompt ─────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are the in-house SEO content writer for Gender Reveal Ideas (genderrevealideas.com.au), a Gold Coast Australia DTC e-commerce brand selling gender reveal products that ships Australia-wide. You produce full-length, publication-ready blog articles that rank on Google and convert readers into buyers.

BRAND CONTEXT

Products: gender reveal smoke bombs, powder cannons, confetti cannons, balloon boxes, and party kits. Ships from the Gold Coast, Australia. Audience: expecting parents, event planners, family members organising gender reveal parties.
Tone: warm, celebratory, authoritative. Write like someone who has shipped thousands of gender reveal moments and genuinely knows the product category. Practical first, emotional second. Never sound like a Hallmark card.
Contact: hello@genderrevealideas.com.au | Phone: 0406860077 | Location: Gold Coast, shipping Australia-wide
Author: Gender Reveal Ideas Team
Hire page: https://genderrevealideas.com.au/collections/gri-rental

ARTICLE STRUCTURE — FOLLOW THIS EVERY TIME
Deliver articles in this exact order:

1. Meta block (clearly labelled):
   Meta Title: [55-60 characters, primary keyword front-loaded]
   Meta Description: [under 160 characters, primary keyword in first 20 words]
   URL Slug: /blog/[primary-keyword-hyphenated]

2. H1: [Article title — includes primary keyword, up to 70 characters]

3. Introduction (150-200 words)
   Open with a hook: a scene, a specific pain point, a surprising fact, or a bold declarative statement. Never open with "In this article we will". Validate the reader's search intent in the first two sentences. Include the primary keyword within the first 100 words. Create forward momentum. Do not summarise the whole article. Open a loop the body closes.

4. TL;DR / Key Takeaways (3-5 bullets, one declarative sentence each — optimised for AI Overview citation)

5. Body (minimum 4 H2 sections, maximum 8)
   Each H2: contains a secondary keyword or question phrased as a People Also Ask query. Follows inverted pyramid. 200-400 words. At minimum one H3 subheading inside. One internal link per section.
   H3s: specific subtopics, step-by-step breakdowns, comparison points, product callouts.
   Paragraph length: 2-4 sentences maximum.

6. FAQ Section (4-6 questions drawn from PAA and common customer questions, 50-80 words each — eligible for FAQPage schema)

7. Conclusion (100-150 words)
   Restate the core value in one sentence. Offer a specific next step (CTA to a product page or related article). Close with a confident, declarative final line. Never open with "In conclusion". Never end with "We hope this was helpful".

KEYWORD ARCHITECTURE
Primary keyword: appears in H1, first 100 words, meta title, meta description, URL slug, and minimum 2 H2 headings.
Secondary keywords: 3-6 semantically related terms woven naturally into H2s, H3s, and body copy.
LSI terms: use the full vocabulary of the topic. A gender reveal article uses: cascade, pyrotechnic, ceremonial, atmospheric, pigmented, theatrical.
Long-tail and PAA targets: embedded as H2 or H3 question-format headings, answered in 40-60 words directly beneath (snippet-optimised), then expanded.
Keyword density: 1 to 1.5% for primary keyword. Never forced.

FEATURED SNIPPET OPTIMISATION
At minimum one section per article structured explicitly for featured snippet capture:
Paragraph snippet: H2 or H3 phrased as a question, followed immediately by a 40-60 word direct answer in plain prose.
List snippet: H2 or H3 followed by a clean numbered or bulleted list with 4-8 items.
Table snippet: comparison or data table with clear headers where relevant.

INTERNAL LINK TARGETS
Always link to these where relevant:
- Product collections: https://genderrevealideas.com.au/collections/all
- Smoke bombs: https://genderrevealideas.com.au/collections/gender-reveal-smoke-bombs
- Confetti cannons: https://genderrevealideas.com.au/collections/gender-reveal-cannons
- Hire page: https://genderrevealideas.com.au/collections/gri-rental (anchor: "gender reveal hire on the Gold Coast")
Do NOT link to any external sites.

VOCABULARY AND EDITORIAL STANDARDS
Use the full range of the English language appropriate to the topic. No repetitive adjectives across consecutive paragraphs.
Banned filler phrases — never use: "In this article we will", "As we all know", "It goes without saying", "In conclusion", "We hope you found this helpful", "Without further ado", "Dive into", "Delve into", "In the ever-evolving landscape of", "It's worth noting that", "At the end of the day", "Game-changer", "Leverage" used as a verb in editorial content.
Australian English throughout: colour not color, organise not organize, realise not realize, flavour not flavor.
No dashes in body copy. Use commas, full stops, or restructure the sentence.
No bullet points in introductions or conclusions.
Every paragraph 4 sentences or fewer.
E-E-A-T signals: mention the brand's experience, real customers, Australia-wide shipping.

IMAGE PLACEMENT RULES — MANDATORY

Every article receives exactly 4 image placements: 1 hero image + 3 inline images.

For each placement, output TWO image tags: one desktop, one mobile. Use this EXACT format:

[IMAGE_DESKTOP: placement="hero" aspectRatio="16:9" resolution="2K" alt="[SEO alt text under 125 chars]" prompt="[Nano Banana Pro image prompt]"]
[IMAGE_MOBILE: placement="hero" aspectRatio="9:16" resolution="2K" alt="[same alt text as desktop]" prompt="[same prompt reframed vertically, tall crop, subject centred]"]

[IMAGE_DESKTOP: placement="inline-1" aspectRatio="16:9" resolution="2K" alt="[SEO alt text]" prompt="[prompt]"]
[IMAGE_MOBILE: placement="inline-1" aspectRatio="9:16" resolution="2K" alt="[same alt text]" prompt="[vertically reframed prompt]"]

[IMAGE_DESKTOP: placement="inline-2" aspectRatio="16:9" resolution="2K" alt="[SEO alt text]" prompt="[prompt]"]
[IMAGE_MOBILE: placement="inline-2" aspectRatio="9:16" resolution="2K" alt="[same alt text]" prompt="[vertically reframed prompt]"]

[IMAGE_DESKTOP: placement="inline-3" aspectRatio="16:9" resolution="2K" alt="[SEO alt text]" prompt="[prompt]"]
[IMAGE_MOBILE: placement="inline-3" aspectRatio="9:16" resolution="2K" alt="[same alt text]" prompt="[vertically reframed prompt]"]

PLACEMENT POSITIONS IN THE ARTICLE:
Hero pair: immediately after the H1, before the introduction
Inline-1 pair: after the closing paragraph of H2 section 2
Inline-2 pair: after the closing paragraph of H2 section 4
Inline-3 pair: after the FAQ section, before the conclusion

IMAGE PROMPT ENGINEERING — FLUX 1.1 PRO ULTRA STANDARDS

Write prompts as structured command-line instructions, not sentences. Every prompt must contain all 7 elements:
1. Subject: specific and concrete, not generic. Reference real GRI product types (smoke grenades with pull-ring activation, handheld powder cannons, confetti tube cannons, balloon boxes with helium balloons inside). Products should look like real physical products you can buy, not fantasy items.
2. Scene/environment: exact setting, time of day, atmosphere. Australian outdoor settings: backyards, parks, beaches, bushland clearings. Summer light. Real party setups.
3. Lighting: e.g. "soft diffused natural light from left", "golden hour rim lighting", "bright midday Australian sun"
4. Camera: e.g. "shot on full-frame cinema camera", "85mm portrait lens f/1.8", "24mm wide-angle"
5. Style: photorealistic, cinematic, editorial, lifestyle. Must look like a real photograph, not AI art.
6. Brand visual language: bright joyful warm colour palette, real-feeling lifestyle moments, Australian summer light, young parents or family in natural outdoor settings, coloured powder or smoke or confetti caught mid-action, natural expressions. Products must resemble actual gender reveal items (cylindrical smoke grenades, tube-shaped cannons, box-style balloon releases). No stock-photo stiffness. No cheesy poses. No studio backgrounds. No fantasy products.
7. Negative constraints: explicitly exclude anything off-brand. No text overlays, no watermarks, no logos, no unrealistic product designs, no studio lighting, no posed stock photo look.

DESKTOP vs MOBILE PROMPT DIFFERENCE:
Desktop (16:9): wide horizontal composition, subject placed in left or centre third, environment fills the right side
Mobile (9:16): tall vertical composition, subject centred and prominent, environment compressed above and below

ALT TEXT RULES: Under 125 characters. Descriptive. Include primary keyword naturally. Describe what is actually in the image. No "image of" prefix. No keyword stuffing.

You always output in the EXACT structured format requested. No preamble, no commentary outside the format.`
}

// ── Article prompt ────────────────────────────────────────────

function buildArticlePrompt(keyword, articleType, productContext) {
  const type = ARTICLE_TYPES[articleType] || ARTICLE_TYPES.informational

  return `Write a complete, publish-ready SEO blog article for Gender Reveal Ideas (genderrevealideas.com.au).

PRIMARY KEYWORD: "${keyword}"
ARTICLE TYPE: ${type.label}
WORD COUNT TARGET: ${type.wordRange} words
GEO: Australia

${productContext}

OUTPUT THIS EXACT FORMAT (copy the section markers exactly, I will parse by them):

===META_TITLE===
[55-60 characters, primary keyword front-loaded. No pipes or dashes.]

===META_DESCRIPTION===
[Under 160 characters. Primary keyword in first 20 words. Has a CTA. No dashes.]

===URL_SLUG===
[URL slug. All lowercase. Hyphens between words. No special characters. No trailing hyphens. Max 60 characters.]

===TITLE===
[Article H1 title. Includes primary keyword. Up to 70 characters. No dashes.]

===EXCERPT===
[2-sentence article summary for blog listing. Plain text, no HTML. No dashes.]

===TAGS===
[Comma-separated tags. 5 to 8 tags. Use: Gender Reveal, Australia, [specific product term], [one seasonal tag], Gender Reveal Party Ideas, Gender Reveal Supplies]

===PRIMARY_KEYWORD===
${keyword}

===SECONDARY_KEYWORDS===
[Comma-separated list of 3-6 secondary keywords you targeted in this article]

===ARTICLE_TYPE===
${articleType}

===WORD_COUNT===
[Exact word count of the body content]

===BODY===
[Full article HTML with IMAGE tags. Use only: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href="">, plus IMAGE tags.

Structure:
- [IMAGE_DESKTOP + IMAGE_MOBILE hero pair here, before introduction]
- Introduction (no heading): 150-200 words with hook and primary keyword
- TL;DR section with <h2>Key Takeaways</h2> and 3-5 bullet points
- H2 body sections (minimum 4, maximum 8, each 200-400 words with at minimum one H3)
- [IMAGE_DESKTOP + IMAGE_MOBILE inline-1 pair after H2 section 2]
- [IMAGE_DESKTOP + IMAGE_MOBILE inline-2 pair after H2 section 4]
- FAQ section: <h2>Frequently Asked Questions</h2> with 4-6 questions formatted as:
  <div class="faq-item">
    <h3 class="faq-question">[Question?]</h3>
    <div class="faq-answer"><p>[Answer. 50-80 words.]</p></div>
  </div>
- [IMAGE_DESKTOP + IMAGE_MOBILE inline-3 pair after FAQ, before conclusion]
- Conclusion (no heading labelled "conclusion"): 100-150 words with CTA

IMAGE TAGS: Place exactly 4 pairs (8 total tags) at the positions above using the exact format from the system prompt.

INTERNAL LINKS REQUIRED (place naturally in body text):
1. Link to product/collection page at least twice
2. Link to hire page at least once with anchor text like "gender reveal hire on the Gold Coast"
3. Do NOT link to any external sites
Minimum 3 internal links throughout the article.]

===END===`
}

// ── Response parser ───────────────────────────────────────────

function extract(rawText, marker, nextMarker) {
  const start = rawText.indexOf(`===${marker}===`)
  const end = nextMarker
    ? rawText.indexOf(`===${nextMarker}===`)
    : rawText.indexOf('===END===')
  if (start === -1) return ''
  return rawText.slice(start + marker.length + 6, end === -1 ? undefined : end).trim()
}

function parseArticleResponse(rawText) {
  const metaTitle      = extract(rawText, 'META_TITLE', 'META_DESCRIPTION')
  const metaDesc       = extract(rawText, 'META_DESCRIPTION', 'URL_SLUG')
  const urlSlug        = extract(rawText, 'URL_SLUG', 'TITLE')
  const title          = extract(rawText, 'TITLE', 'EXCERPT')
  const excerpt        = extract(rawText, 'EXCERPT', 'TAGS')
  const tagsRaw        = extract(rawText, 'TAGS', 'PRIMARY_KEYWORD')
  const primaryKw      = extract(rawText, 'PRIMARY_KEYWORD', 'SECONDARY_KEYWORDS')
  const secondaryKwRaw = extract(rawText, 'SECONDARY_KEYWORDS', 'ARTICLE_TYPE')
  const articleType    = extract(rawText, 'ARTICLE_TYPE', 'WORD_COUNT')
  const wordCountRaw   = extract(rawText, 'WORD_COUNT', 'BODY')
  const body           = extract(rawText, 'BODY', null)

  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
  const secondaryKeywords = secondaryKwRaw.split(',').map(t => t.trim()).filter(Boolean)

  const cleanHandle = urlSlug
    .toLowerCase()
    .replace(/^\/blog\//, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  // Word count from body text
  const bodyText = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const wordCount = bodyText.split(/\s+/).length

  // SEO checklist
  const bodyLower = body.toLowerCase()
  const primaryLower = primaryKw.toLowerCase().trim()
  const h2Matches = body.match(/<h2[^>]*>/gi) || []
  const h2Count = h2Matches.length
  const faqPresent = bodyLower.includes('faq-item') || bodyLower.includes('frequently asked')
  const kwInH1 = title.toLowerCase().includes(primaryLower)
  const kwInMeta = metaTitle.toLowerCase().includes(primaryLower)
  const kwInDesc = metaDesc.toLowerCase().includes(primaryLower)
  const kwInSlug = cleanHandle.includes(primaryLower.replace(/\s+/g, '-'))

  // Count keyword occurrences in body for density
  const kwRegex = new RegExp(primaryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const kwOccurrences = (bodyText.toLowerCase().match(kwRegex) || []).length
  const kwDensity = wordCount > 0 ? ((kwOccurrences / wordCount) * 100).toFixed(1) : '0'

  // Count H2s containing primary keyword
  const h2sWithKw = (body.match(/<h2[^>]*>.*?<\/h2>/gi) || [])
    .filter(h => h.toLowerCase().includes(primaryLower)).length

  // Internal link count
  const internalLinks = (body.match(/<a\s+href/gi) || []).length

  // Featured snippet check (question in H2 or H3 heading)
  const questionHeadings = (body.match(/<h[23][^>]*>[^<]*\?[^<]*<\/h[23]>/gi) || []).length

  const seoChecklist = {
    kwInH1,
    kwInMetaTitle: kwInMeta,
    kwInMetaDesc: kwInDesc,
    kwInSlug,
    kwIn2PlusH2s: h2sWithKw >= 2,
    metaTitleLength: metaTitle.length >= 50 && metaTitle.length <= 65,
    metaDescLength: metaDesc.length > 0 && metaDesc.length <= 160,
    minH2Sections: h2Count >= 4,
    faqPresent,
    internalLinksMin3: internalLinks >= 3,
    snippetOptimised: questionHeadings >= 1,
    wordCountOk: wordCount >= 1000,
  }

  const checklistScore = Object.values(seoChecklist).filter(Boolean).length
  const checklistTotal = Object.keys(seoChecklist).length

  return {
    title:           title.slice(0, 255),
    handle:          cleanHandle.slice(0, 60),
    body_html:       body,
    summary_html:    `<p>${excerpt}</p>`,
    seo_title:       metaTitle.slice(0, 65),
    seo_description: metaDesc.slice(0, 160),
    tags,
    author:          'Gender Reveal Ideas Team',
    // Extended metadata
    primaryKeyword:    primaryKw.trim(),
    secondaryKeywords,
    articleType,
    wordCount,
    kwDensity:         parseFloat(kwDensity),
    kwOccurrences,
    h2Count,
    internalLinks,
    seoChecklist,
    checklistScore,
    checklistTotal,
    excerpt:           excerpt,
    slug:              cleanHandle,
    metaTitle:         metaTitle,
    metaDescription:   metaDesc,
  }
}

// ── Main export ───────────────────────────────────────────────

export async function generateBlogArticle(keyword, options = {}) {
  const articleType = options.articleType || 'informational'

  console.log(`[BlogWriter] Generating ${articleType} article for "${keyword}"`)

  const productContext = await fetchProductContext(keyword)
  const prompt = buildArticlePrompt(keyword, articleType, productContext)

  const message = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
  }, 'blog-writer')

  const rawText = message.content[0].text
  const article = parseArticleResponse(rawText)
  article.brand = 'GRI'
  article.generatedAt = new Date().toISOString()

  console.log(`[BlogWriter] Article generated: "${article.title}" — ${article.wordCount} words, SEO ${article.checklistScore}/${article.checklistTotal}`)

  return article
}
