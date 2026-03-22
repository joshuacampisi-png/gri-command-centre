/**
 * Blog Generator — SEO Article Writer
 * Uses Claude API to generate rank-recovery blog articles.
 * Follows E-E-A-T best practices, mobile-first, Article schema, internal links.
 *
 * Article spec:
 *   - 1,500–2,000 words
 *   - Single H1 (keyword-optimised title)
 *   - 5–7 H2 sections, H3 sub-sections
 *   - FAQ section (featured snippet targets)
 *   - Product CTA block linking to Shopify collection
 *   - Article JSON-LD schema
 *   - Meta title (50-60 chars) + meta description (150-160 chars)
 *   - Mobile-first: short paragraphs (≤50 words), bullet lists, scannable
 */

import Anthropic from '@anthropic-ai/sdk'
import { env } from './env.js'

const STORE_DOMAIN = 'https://genderrevealideas.com.au'
const BRAND_NAME   = 'Gender Reveal Ideas'
const BRAND_DESC   = 'Australia\'s leading gender reveal party supply store'

// Maps keyword tags/patterns to collection URLs for internal linking
const COLLECTION_MAP = {
  'cannon':         '/collections/gender-reveal-cannons',
  'smoke':          '/collections/gender-reveal-smoke-bombs',
  'powder':         '/collections/gender-reveal-powder-cannons',
  'confetti':       '/collections/gender-reveal-confetti',
  'balloon':        '/collections/gender-reveal-balloons',
  'extinguisher':   '/collections/gender-reveal-extinguishers',
  'cake':           '/collections/gender-reveal-cakes',
  'kit':            '/collections/gender-reveal-kits',
  'game':           '/collections/gender-reveal-games',
  'decoration':     '/collections/gender-reveal-decorations',
  'golf':           '/collections/gender-reveal-golf-balls',
  'default':        '/collections/all',
}

function getCollectionUrl(keyword) {
  const kw = keyword.toLowerCase()
  for (const [key, url] of Object.entries(COLLECTION_MAP)) {
    if (kw.includes(key)) return url
  }
  return COLLECTION_MAP.default
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function generateBlogArticle(drop, brandVoice = '') {
  const client = new Anthropic({ apiKey: env.anthropicApiKey })
  const collectionUrl = getCollectionUrl(drop.keyword)
  const fullCollectionUrl = `${STORE_DOMAIN}${collectionUrl}`

  const brandVoiceSection = brandVoice
    ? `\n## BRAND VOICE (match this tone/style from existing GRI blogs):\n${brandVoice.slice(0, 1500)}\n`
    : ''

  const prompt = `You are an expert SEO content writer for ${BRAND_NAME} (${STORE_DOMAIN}), ${BRAND_DESC}.
${brandVoiceSection}

Write a complete, publish-ready SEO blog article to help recover rankings for this keyword:

**Target keyword:** "${drop.keyword}"
**Previous rank:** #${drop.previousRank} → **Current rank:** #${drop.currentRank} (dropped ${drop.drop} positions)
**Monthly search volume:** ${drop.volume?.toLocaleString() || 'unknown'}
**Primary collection URL:** ${fullCollectionUrl}

## REQUIREMENTS

**Structure:**
1. H1 title — keyword-rich, compelling, 50-60 chars, no click-bait
2. Meta title — same or variation, 50-60 chars
3. Meta description — 150-160 chars, includes keyword + CTA + "Australia"
4. Intro paragraph — hook in first 2 sentences, primary keyword in first 100 words, 60-80 words
5. 5-6 H2 sections (each 150-250 words):
   - What is [keyword] / Why [keyword] matters for gender reveals
   - Types / Styles / Options available
   - How to choose the right one
   - Safety tips / How to use
   - Ideas & inspiration / Styling tips
   - Where to buy [keyword] in Australia (CTA section linking to collection)
6. H3 sub-sections inside 2-3 of the H2s (adds depth)
7. FAQ section (H2) with 4 questions + concise answers (50-80 words each) — target featured snippets
8. Closing paragraph with CTA linking to ${fullCollectionUrl}

**BRAND RULES (non-negotiable):**
- Always include "Gender Reveal Ideas" brand name naturally at least 3 times
- Always weave in the phrase "gender reveal" even if the dropped keyword is about a specific product — anchor the brand
- Write as if from the GRI team's first-hand experience selling and using these products
- Australian English spelling ONLY (organise, colour, specialise, favour, etc.)
- Short paragraphs: MAX 50 words (mobile-first — 70% of readers are on phones)
- Bullet lists wherever possible for scannability
- Mention fast Australian shipping and locally held stock naturally once
- Internal link: mention the collection URL naturally at least twice in body text
- Do NOT write generic AI-sounding content — write with personality, enthusiasm, real product knowledge

**Schema to include:**
Generate Article JSON-LD with:
- @type: Article
- headline (H1 text)
- description (meta description)
- datePublished: today ${new Date().toISOString().split('T')[0]}
- author: { @type: Organization, name: "${BRAND_NAME}", url: "${STORE_DOMAIN}" }
- publisher: same as author
- image: ${STORE_DOMAIN}/cdn/shop/files/gri-social-banner.jpg

**Output format — return valid JSON only:**
{
  "title": "H1 title",
  "metaTitle": "SEO meta title",
  "metaDescription": "150-160 char meta description",
  "slug": "url-slug-for-blog-post",
  "bodyHtml": "Full HTML article body (no <html>/<body> tags — just the article content with H1, H2, H3, p, ul, li, etc.)",
  "schema": { ...Article JSON-LD object... },
  "wordCount": 0,
  "targetKeyword": "${drop.keyword}",
  "internalLinks": ["${fullCollectionUrl}"],
  "summary": "1-sentence description of what this article covers"
}`

  console.log(`[Blog Generator] Generating article for: "${drop.keyword}"`)

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = response.content[0].text.trim()

  // Strip markdown code fences if present
  const clean = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()

  let article
  try {
    article = JSON.parse(clean)
  } catch (e) {
    // Try to extract JSON from the response
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) {
      article = JSON.parse(match[0])
    } else {
      throw new Error(`Failed to parse article JSON: ${e.message}`)
    }
  }

  // Inject schema as script tag into bodyHtml
  const schemaTag = `\n<script type="application/ld+json">\n${JSON.stringify(article.schema, null, 2)}\n</script>`
  article.bodyHtml = (article.bodyHtml || '') + schemaTag

  console.log(`[Blog Generator] Article generated: "${article.title}" (~${article.wordCount} words)`)
  return article
}
