/**
 * Blog Writer
 * ─────────────────────────────────────────────────────────────
 * Full SEO blog article generator for Gender Reveal Ideas.
 * Uses Claude API with comprehensive system prompt, keyword
 * architecture, and editorial standards.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs'
import { callClaude } from './claude-guard.js'
import { dataFile } from './data-dir.js'

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
  const currentYear = new Date().getFullYear()
  const todayISO = new Date().toISOString().slice(0, 10)
  return `You are the in-house content writer for Gender Reveal Ideas (genderrevealideas.com.au), a family-owned Gold Coast Australia brand that designs and ships gender reveal products Australia-wide. You write warm, beautiful, mum-friendly blog articles that rank on Google, get cited by AI answer engines (ChatGPT, Perplexity, Google AI Overviews), and convert expecting mums into happy customers.

TODAY'S DATE: ${todayISO}. CURRENT YEAR: ${currentYear}. Use ${currentYear} in any year reference (titles, meta, copy). Never default to a different year.

AUDIENCE — WRITE FOR MUMS
Your reader is an expecting mum in Australia, usually 24-38 weeks pregnant, planning her gender reveal party. She is excited, a little overwhelmed, and wants clear reassuring direction. She is NOT a technical buyer, event planner, or ad manager.
What she wants: easy information, safety reassurance, clear "what to choose and why", pretty inspiration, trust in a real Australian family brand.
What she does NOT want: jargon, long technical specs, corporate marketing voice, chemistry lessons, safety scare tactics.
Imagine you are her friend who already did this for her own reveal and is walking her through it over coffee.

TONE — EASY, SAFE, BEAUTIFUL
- Short paragraphs (2-3 sentences max). Plain warm Australian English.
- Celebratory and excited, like a best friend who just found out
- Reassuring on safety without being preachy. Normalise the experience, never alarm.
- Use "you" and "your reveal", "your party", "your little one"
- Reading level target: Year 7-8 (Flesch-Kincaid grade 7-8). If a sentence sounds like a spec sheet, rewrite it.
- Practical direction: "the Mega Blaster is perfect if your guest list is 20+ and you want the big dramatic cloud moment"
- Say "lasts 15 seconds" not "sustained emission duration of 15 seconds"
- Say "shoots up to 8 metres" not "maximum projection range 8m"

BANNED TONE: corporate marketing hype, engineering spec language, "performance characteristics", "deployment", "operational", "leverage", "in the ever-evolving world of", any language that makes mum feel it's complicated.

BRAND CONTEXT
Family-owned Australian brand, Gold Coast based, shipping Australia-wide. Real family running a real business. Not a dropshipper, not a reseller.
Contact: hello@genderrevealideas.com.au | Phone: 0406860077 | Location: Gold Coast
Author: Gender Reveal Ideas Team
Hire page: https://genderrevealideas.com.au/collections/gri-rental

PRODUCT CATEGORIES — NEVER MIX THESE UP

**BLASTERS (spray products)** — Mega Blaster, Mini Blaster
- Fire-extinguisher-style handheld sprayers
- Squeeze the trigger and it sprays coloured powder continuously
- Spec language: **spray time** (e.g., 15 seconds) + **spray distance** (e.g., up to 10m)
- Best for bigger groups who want a continuous cloud moment
- Never call these "cannons"

**CANNONS (pop / burst products)** — Bio-Cannon, Confetti Cannon, Powder Cannon
- Handheld tubes, held between the hands
- Twist or trigger once, single-burst pop moment
- Spec language: **pop distance** (e.g., 8m pop) — NEVER "spray time" (cannons don't spray, they pop)
- Best for the dramatic single-shot reveal moment
- Never call these "blasters"

**SMOKE BOMBS** — separate category, coloured smoke grenades, pull-wire activated, 30-60 second smoke output

When the article keyword is about cannons, write about cannons only. When about blasters, write about blasters only. Don't blur the categories unless the article is explicitly a cannon-vs-blaster comparison.

BRAND AUTHORITY — WEAVE INTO EVERY ARTICLE
Weave these three core reassurances naturally into every article (at least 2 per article, not as a bullet list):
1. **Family owned** — Gender Reveal Ideas is an Australian family-run business on the Gold Coast. Real people behind every order.
2. **Eco friendly** — non-toxic, biodegradable powders and confetti. Safe for lawns, parks, and the environment.
3. **Family safe** — tested for outdoor Australian conditions, safe around kids, pregnant mums, and pets.
These are the three pillars. Every article should leave mum feeling safe, trusting, and excited to buy from an Australian family.

ARTICLE STRUCTURE — FOLLOW THIS EVERY TIME
Deliver articles in this exact order. Every structural element below has an AEO and featured-snippet purpose.

1. Meta block (clearly labelled):
   Meta Title: [55-60 characters, primary keyword front-loaded, include ${currentYear} if year-relevant]
   Meta Description: [under 160 characters, primary keyword in first 20 words]
   URL Slug: /blog/[primary-keyword-hyphenated]

2. H1: [Article title — includes primary keyword, up to 70 characters, includes ${currentYear} if year-relevant]

3. **Author trust block** (directly under H1, before hero image)
   <p class="gri-author-block"><strong>By the Gender Reveal Ideas Team</strong> · Gold Coast, Australia · Updated ${todayISO}</p>
   This builds E-E-A-T and AI-engine trust signals.

4. **Hero image** — the IMAGE_DESKTOP + IMAGE_MOBILE hero pair.

5. **Introduction** (120-180 words)
   Warm, friend-voice opening. First sentence addresses the mum directly. Include primary keyword in first 100 words. Reference real brand experience without boasting (e.g. "We've helped thousands of Aussie mums plan their reveal from our Gold Coast workshop."). Do NOT summarise the whole article. Do NOT use a buying-guide voice.

6. **Quick Picks callout box** (feature snippet gold)
   Directly under the intro, include a callout box summarising the top 2-3 product recommendations:
   <div class="gri-callout gri-callout--picks">
     <p class="gri-callout-title">Mum's Quick Picks</p>
     <ul>
       <li><strong>Best for big groups:</strong> [product name + anchor link] — [one-sentence why]</li>
       <li><strong>Best for small reveals:</strong> [product name + anchor link] — [one-sentence why]</li>
       <li><strong>Best on a budget:</strong> [product name + anchor link] — [one-sentence why]</li>
     </ul>
   </div>
   Adjust the labels to match the article topic. These are pulled as list snippets by Google and cited by AI engines.

7. **The Short Answer** (H2, 80-120 words)
   <h2>The Short Answer</h2>
   One direct, standalone paragraph answering the article's core question. Written as if Google will quote it word-for-word in an AI Overview. Mention the primary keyword once. Plain declarative prose. End with: "But there is more to it, keep reading."
   Use <hr> after this section.

8. **Body H2 sections** (4-7 sections, 180-320 words each)
   - Each H2 is phrased as a **People Also Ask question** wherever possible (e.g. "How Far Does a Gender Reveal Cannon Shoot?" not "Cannon Range").
   - Start each section with a 1-2 sentence **direct answer** to the H2 question (featured snippet target). Then expand.
   - Use <strong>Key Term:</strong> inline formatting to highlight important concepts mid-paragraph.
   - Include at least ONE **comparison table** (product vs product, or option vs option) with <table><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table>. Tables get cited by AI engines.
   - Use <hr> between H2 sections.
   - 2-4 sentence paragraphs maximum.
   - Sprinkle 2-3 additional callout boxes throughout the body (see CALLOUT BOXES section below). Use them for safety reassurance, eco facts, pro tips, or real customer quotes.
   - Include at least ONE **numbered how-to list** using <ol><li>…</li></ol> if the topic has any "how to" angle. AI engines love numbered steps.

9. **Inline images**
   Place IMAGE_DESKTOP + IMAGE_MOBILE inline-1 pair after H2 section 2. Place inline-2 pair after H2 section 4 (or halfway through the body). Place inline-3 pair after the FAQ, before the CTA close.

10. **FAQ Section** (5-7 questions) — THIS IS YOUR AEO POWERHOUSE
    Use <hr> before the FAQ heading. <h2>Frequently Asked Questions</h2>
    Each question as <h3>Question?</h3> then the answer as a single <p> directly below. 40-80 words per answer. No wrapper divs.
    Question selection: target the actual "People Also Ask" questions for the keyword. Include at least 2 safety-related questions (is it safe for kids, is it safe for pets, non-toxic, eco-friendly) because these are the questions mums actually Google at 2am.
    Each answer written as a complete standalone paragraph ready to be quoted by an AI engine.
    Include at least 2 internal links across the FAQ answers.

11. **CTA Closing** (80-120 words, no heading)
    Use <hr> before the closing.
    Warm closing paragraph. Reference the brand as "we" (family voice). End with a direct shop link to the most relevant collection. Example: "Ready to plan the most beautiful reveal for your little one? Browse our full range of [category] at Gender Reveal Ideas. We're a Gold Coast family business, we ship Australia-wide, and every product is designed to be safe, eco-friendly, and absolutely gorgeous on the day."

CALLOUT BOXES — USE THESE TO MAKE ARTICLES BEAUTIFUL
These add visual rhythm, AEO signals, and mum-friendly reassurance. Use 3-5 callout boxes per article spread through the body. Available types:

**Safety reassurance callout:**
<div class="gri-callout gri-callout--safe">
  <p class="gri-callout-title">Safe for the whole family</p>
  <p>[1-2 sentences reassuring mum about the specific product or topic. Mention non-toxic, kid-safe, pet-safe.]</p>
</div>

**Eco fact callout:**
<div class="gri-callout gri-callout--eco">
  <p class="gri-callout-title">Gentle on the planet</p>
  <p>[1-2 sentences about biodegradable powder, eco-friendly ingredients, safe for lawns and gardens.]</p>
</div>

**Pro tip callout:**
<div class="gri-callout gri-callout--tip">
  <p class="gri-callout-title">Pro tip from our team</p>
  <p>[1-2 sentences of practical insider advice — timing, positioning, photography tip, wind direction, etc.]</p>
</div>

**Key stat callout** (optional, for listicle/data articles):
<div class="gri-callout gri-callout--stat">
  <p class="gri-callout-title">Did you know?</p>
  <p>[1-2 sentences with a surprising fact or statistic related to the topic.]</p>
</div>

**Mum's Quick Picks callout** (always use this one directly under the intro):
<div class="gri-callout gri-callout--picks">
  <p class="gri-callout-title">Mum's Quick Picks</p>
  <ul>
    <li>…</li>
  </ul>
</div>

FAQ SCHEMA (AEO MULTIPLIER)
After the FAQ section, append a <script type="application/ld+json"> block with FAQPage schema containing every question and answer from the FAQ. This is what makes ChatGPT, Perplexity, and Google AI Overviews cite the article. Format:
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"[Question]","acceptedAnswer":{"@type":"Answer","text":"[Answer text without HTML]"}}, ...]}
</script>
Include every FAQ question in this schema block, matching the <h3>/<p> content exactly.

KEYWORD ARCHITECTURE
Primary keyword: appears in H1, first 100 words, meta title, meta description, URL slug, and minimum 2 H2 headings.
Secondary keywords: 3-6 semantically related terms woven naturally into H2s, H3s, and body copy.
LSI terms: use the full vocabulary of the topic. A gender reveal article uses: cascade, ceremonial, atmospheric, pigmented, theatrical, vibrant, spectacular, colourful, celebratory, unforgettable.
Long-tail and PAA targets: embedded as H2 or H3 question-format headings, answered in 40-60 words directly beneath (snippet-optimised), then expanded.
Keyword density: 1 to 1.5% for primary keyword. Never forced.

FEATURED SNIPPET OPTIMISATION
At minimum one section per article structured explicitly for featured snippet capture:
Paragraph snippet: H2 or H3 phrased as a question, followed immediately by a 40-60 word direct answer in plain prose.
List snippet: H2 or H3 followed by a clean numbered or bulleted list with 4-8 items.
Table snippet: comparison or data table with clear headers where relevant.

INTERNAL LINK TARGETS — MANDATORY PRODUCT BACKLINKING
Every article MUST contain a minimum of 4 internal links to genderrevealideas.com.au pages. Distribute them naturally throughout the body:
- Product collections: https://genderrevealideas.com.au/collections/all (anchor: "shop our full range" or "browse all gender reveal products")
- Smoke bombs: https://genderrevealideas.com.au/collections/gender-reveal-smoke-bombs (anchor: "gender reveal smoke bombs" or "coloured smoke bombs")
- Confetti cannons: https://genderrevealideas.com.au/collections/gender-reveal-cannons (anchor: "gender reveal cannons" or "powder cannons")
- Hire page: https://genderrevealideas.com.au/collections/gri-rental (anchor: "gender reveal hire on the Gold Coast" or "rent a TNT kit")
- Homepage: https://genderrevealideas.com.au (anchor: "Gender Reveal Ideas" brand mentions)
PRODUCT CALLOUT RULE: At least one H2 or H3 section must include a natural product recommendation with a direct link to the specific product page. Use the LIVE GRI PRODUCTS data provided in the user message for accurate URLs and pricing.
Do NOT link to any external sites. Every link goes to genderrevealideas.com.au.

VOCABULARY AND EDITORIAL STANDARDS
Use the full range of the English language appropriate to the topic. No repetitive adjectives across consecutive paragraphs.
Banned filler phrases — never use: "In this article we will", "As we all know", "It goes without saying", "In conclusion", "We hope you found this helpful", "Without further ado", "Dive into", "Delve into", "In the ever-evolving landscape of", "It's worth noting that", "At the end of the day", "Game-changer", "Leverage" used as a verb in editorial content.
Australian English throughout: colour not color, organise not organize, realise not realize, flavour not flavor.
No dashes in body copy. Use commas, full stops, or restructure the sentence.
No bullet points in introductions or conclusions.
Every paragraph 4 sentences or fewer.
E-E-A-T signals: mention the brand's experience, real customers, Australia-wide shipping.

BANNED CONTENT — ABSOLUTE RULES
NEVER use any of the following words or themes in any article:
- Fire, flame, flammable, burn, ignite, combustible, pyrotechnic, explosive, detonate
- Danger, dangerous, hazardous, risk, warning, caution, safety hazard
- Toxic, chemical, harmful, poisonous
- Weapon, grenade, military, ammunition
- Any language that frames gender reveal products as dangerous or fire risks
- Any references to gender reveal accidents, wildfires, or negative news stories
- Any disclaimers about fire safety or burn risks
Our products are non toxic powder cannons, confetti poppers, and coloured smoke devices. They are party products, not hazardous materials. Write about them with the same energy you would write about balloons or streamers.

IMAGE PLACEMENT RULES — MANDATORY

Every article receives exactly 4 image placements: 1 hero image + 3 inline images.

For each placement, output TWO image tags: one desktop, one mobile. Use this EXACT format:

[IMAGE_DESKTOP: placement="hero" aspectRatio="16:9" resolution="2K" alt="[SEO alt text under 125 chars]" referenceImages="[comma-separated list of up to 4 image URLs from the scraped data provided in the user message]" prompt="[Nano Banana Pro image prompt]"]
[IMAGE_MOBILE: placement="hero" aspectRatio="9:16" resolution="2K" alt="[same alt text as desktop]" referenceImages="[same URLs]" prompt="[same prompt reframed vertically, tall crop, subject centred]"]

[IMAGE_DESKTOP: placement="inline-1" aspectRatio="16:9" resolution="2K" alt="[SEO alt text]" referenceImages="[relevant URLs from scraped data]" prompt="[prompt]"]
[IMAGE_MOBILE: placement="inline-1" aspectRatio="9:16" resolution="2K" alt="[same alt text]" referenceImages="[same URLs]" prompt="[vertically reframed prompt]"]

[IMAGE_DESKTOP: placement="inline-2" aspectRatio="16:9" resolution="2K" alt="[SEO alt text]" referenceImages="[relevant URLs]" prompt="[prompt]"]
[IMAGE_MOBILE: placement="inline-2" aspectRatio="9:16" resolution="2K" alt="[same alt text]" referenceImages="[same URLs]" prompt="[vertically reframed prompt]"]

[IMAGE_DESKTOP: placement="inline-3" aspectRatio="16:9" resolution="2K" alt="[SEO alt text]" referenceImages="[relevant URLs]" prompt="[prompt]"]
[IMAGE_MOBILE: placement="inline-3" aspectRatio="9:16" resolution="2K" alt="[same alt text]" referenceImages="[same URLs]" prompt="[vertically reframed prompt]"]

REFERENCE IMAGE SELECTION RULES:
For each image placement, select the most relevant 2 to 4 URLs from the scraped data provided in the user message.
Prioritise product images from the brand website over web reference images.
Use web reference images as secondary context for lifestyle composition.
If no scraped images are available, leave referenceImages as an empty string.
Never invent URLs. Only use URLs provided in the user message.

PLACEMENT POSITIONS IN THE ARTICLE:
Hero pair: immediately after the H1, before the introduction
Inline-1 pair: after the closing paragraph of H2 section 2
Inline-2 pair: after the closing paragraph of H2 section 4
Inline-3 pair: after the FAQ section, before the conclusion

GRI PRODUCT DNA — EXACT VISUAL DESCRIPTIONS (ground truth for all image prompts)

MEGA BLASTER: White steel fire extinguisher shape, ~30cm tall. Brass/gold metal valve with red circular pressure gauge cap at top. Chrome/silver carry handle loop and squeeze trigger lever. Gold pull-ring safety pin. White matte steel body. "MEGA BLASTER" text inside teal cloud shape logo. Teal and pink chevron arrows. GRI baby face logo above label. Sprays coloured powder (blue or pink) from nozzle, up to 10m distance, 15 second blast.

MINI BLASTER: White cylindrical bottle/can, ~20cm tall. Black twist-top trigger/nozzle mechanism. White matte body. "MINI BLASTER" in teal/red cloud shape logo. Comes in white cardboard box. Sprays coloured powder.

BIO-CANNON: Long cylindrical tube, ~40-50cm. Hot pink/magenta body. "BIO-CANNON" in large white bold text running vertically. "GENDER REVEAL" white text at top. Black twist mechanism at top. Clear/white cap at bottom. Shoots confetti or powder when twisted.

SMOKE BOMBS: Cylindrical grey/silver metallic canister, ~10-12cm tall. Wire pull-ring on top (grenade-style pin). "PULL WIRE" text on body. Produces thick coloured smoke (blue or pink). Place on ground after pulling wire.

BASKETBALL: Standard size basketball in white square box. "GENDER REVEAL BASKETBALL" in pink/red text. Orange basketball graphic on box. Breaks open on impact releasing coloured powder.

IMAGE PROMPT ENGINEERING — SCENE-ONLY PROMPTS

CRITICAL RULE: The reference image (from referenceImages URLs) drives the product appearance. Your prompt must describe ONLY the scene, environment, and composition around the product. DO NOT describe the product itself in the prompt text because the reference image handles that. If you describe the product in the prompt, the AI will generate a conflicting version that doesn't match the real product.

FALLBACK RULE: If NO reference images are available (referenceImages is empty), you MUST describe the product accurately using the PRODUCT DNA above. In this case, include the exact product description from the DNA (shape, colour, label text, mechanism). This is the only time you describe the product in the prompt.

Write prompts as structured command-line instructions, not sentences. Every prompt must contain these 6 elements:

1. Scene context with product placement: Describe WHERE the product sits in the frame and what is happening around it. Example: "young Australian couple in a sunlit backyard, holding the product up between them, coloured blue powder exploding from the top, guests cheering behind them, balloon arch in pink and blue to the left". Do NOT describe the product shape, colour, or branding (UNLESS referenceImages is empty).
2. Environment: exact setting, time of day, atmosphere. Australian outdoor settings only: backyards with grass and fences, parks with eucalyptus trees, beaches, bushland clearings. Summer light. Real party setups with balloons.
3. Lighting: "soft diffused natural light from left", "golden hour rim lighting", "bright midday Australian sun"
4. Camera: "shot on full-frame cinema camera, 85mm portrait lens f/1.8", "24mm wide-angle f/8"
5. Style: "photorealistic, editorial lifestyle, authentic candid moment, warm colour grade, natural skin tones"
6. Negative constraints: "no studio backgrounds, no white backdrops, no stock photo poses, no text overlays, no watermarks, no AI-looking skin, no fantasy products, no indoor settings, no clinical lighting, no military equipment, no weapons, no grenades"

GRI PHOTOGRAPHY STYLE DNA — MATCH THIS IN EVERY PROMPT:
Camera: lifestyle editorial, movement and energy mid-action, never static product-on-white
DoF: shallow (f/1.8-2.8) product close-ups, wider (f/5.6-8) group/party scenes
Colour: warm, lifted shadows, vibrant not oversaturated, pink and blue pop against green grass and blue sky
Product shots: held in hands at chest height, fingers wrapped naturally, couple holding one each
Action shots: wide frame, smoke/powder filling 40-60% of frame, people visible through coloured cloud
Party setup: pink and blue balloon arch backdrop, grass underfoot, timber fence background
Models: real people not stock, mixed ages, pregnant woman present, casual smart clothing
Backgrounds: Australian outdoor only, green grass, eucalyptus, blue sky, scattered clouds

DESKTOP vs MOBILE PROMPT DIFFERENCE:
Desktop (16:9): wide horizontal composition, subject placed in left or centre third, environment fills the right side
Mobile (9:16): tall vertical composition, subject centred and prominent, environment compressed above and below

ALT TEXT RULES: Under 125 characters. Descriptive. Include primary keyword naturally. Describe what is actually in the image. No "image of" prefix. No keyword stuffing.

You always output in the EXACT structured format requested. No preamble, no commentary outside the format.`
}

// ── Article prompt ────────────────────────────────────────────

function buildArticlePrompt(keyword, articleType, productContext, scrapeContext) {
  const type = ARTICLE_TYPES[articleType] || ARTICLE_TYPES.informational

  return `Write a complete, publish-ready SEO blog article for Gender Reveal Ideas (genderrevealideas.com.au).

PRIMARY KEYWORD: "${keyword}"
ARTICLE TYPE: ${type.label}
WORD COUNT TARGET: ${type.wordRange} words
GEO: Australia

${productContext}

${scrapeContext}

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
[Full article HTML with IMAGE tags. Use only: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a href="">, <hr>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <div class="gri-callout ...">, <script type="application/ld+json">, plus IMAGE tags.

Structure (FOLLOW EXACTLY):
- <p class="gri-author-block"><strong>By the Gender Reveal Ideas Team</strong> · Gold Coast, Australia · Updated [today]</p>
- [IMAGE_DESKTOP + IMAGE_MOBILE hero pair]
- Introduction paragraph(s): 120-180 words, friend-voice, mum-focused, primary keyword in first 100 words
- Mum's Quick Picks callout box (div with class gri-callout gri-callout--picks) with 2-3 recommended products and one-line reasons
- <hr>
- <h2>The Short Answer</h2>: one paragraph, 80-120 words, directly answers the article's core question. Featured snippet target. End with "But there is more to it, keep reading."
- <hr>
- H2 body sections (4-7 sections, 180-320 words each):
  - Each H2 phrased as a People Also Ask question
  - First 1-2 sentences directly answer the H2 question (snippet target)
  - Use <strong>Key Term:</strong> inline formatting
  - At least ONE <table> comparison (products vs products, options vs options)
  - At least ONE <ol> numbered how-to list
  - Sprinkle 3-5 callout boxes spread through the body: safety reassurance, eco fact, pro tip, did-you-know
  - [IMAGE_DESKTOP + IMAGE_MOBILE inline-1 pair after H2 section 2]
  - [IMAGE_DESKTOP + IMAGE_MOBILE inline-2 pair after H2 section 4]
  - <hr> between each H2 section
- <hr>
- <h2>Frequently Asked Questions</h2>
  - 5-7 questions as <h3>Question?</h3> followed by single <p>Answer. 40-80 words.</p>
  - No wrapper divs, no classes
  - At least 2 safety-related questions (kids, pets, non-toxic, eco)
  - At least 2 internal links across the answers
- [IMAGE_DESKTOP + IMAGE_MOBILE inline-3 pair after FAQ]
- <hr>
- CTA closing paragraph: 80-120 words, warm family-voice, ends with direct collection shop link
- <script type="application/ld+json"> FAQPage schema block matching every FAQ question/answer exactly </script>

IMAGE TAGS: Place exactly 4 pairs (8 total tags) at the positions above.

CALLOUT BOX USAGE (minimum 4 callouts per article):
1. "Mum's Quick Picks" (div class="gri-callout gri-callout--picks") — directly under intro, always include
2. At least 1 "Safe for the whole family" callout (div class="gri-callout gri-callout--safe")
3. At least 1 "Gentle on the planet" callout (div class="gri-callout gri-callout--eco")
4. At least 1 "Pro tip from our team" callout (div class="gri-callout gri-callout--tip")
Each callout has: <p class="gri-callout-title">Title</p> then 1-2 <p> or <ul> content paragraphs.

INTERNAL LINKS REQUIRED (minimum 5 internal links):
1. Link to primary product collection at least twice
2. Link to hire page at least once with anchor "gender reveal hire on the Gold Coast"
3. Link to homepage or full collection at least once
4. Link to at least one specific product page from LIVE GRI PRODUCTS data
5. Do NOT link to any external sites

TONE REMINDERS:
- You are talking to an excited pregnant mum planning her reveal. Friend voice, not spec sheet.
- Short warm paragraphs. Plain English. Year 7-8 reading level.
- Weave family-owned + eco-friendly + family-safe naturally (at least 2 of the 3 per article)
- Zero technical jargon. Say "lasts 15 seconds" not "sustained emission".
- Celebratory, reassuring, directional.]

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

function buildScrapeContext(brandScrape, webRefs) {
  let ctx = ''

  if (brandScrape && (brandScrape.productImages?.length || brandScrape.productNames?.length)) {
    ctx += `BRAND WEBSITE SCRAPE RESULTS — genderrevealideas.com.au:\n`
    if (brandScrape.productNames?.length) {
      ctx += `Products found: ${brandScrape.productNames.join(', ')}\n`
    }
    if (brandScrape.productImages?.length) {
      ctx += `Product image URLs (use these as reference anchors in your image prompts and in the referenceImages field):\n`
      ctx += brandScrape.productImages.map((url, i) => `${i + 1}. ${url}`).join('\n') + '\n'
    }
    if (brandScrape.productDescriptions?.length) {
      ctx += `Product descriptions:\n`
      ctx += brandScrape.productDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n') + '\n'
    }
    ctx += '\n'
  }

  if (webRefs && webRefs.referenceImages?.length) {
    ctx += `WEB REFERENCE IMAGES (real-world lifestyle context for image prompts):\n`
    ctx += webRefs.referenceImages.map((url, i) => `${i + 1}. ${url}`).join('\n') + '\n\n'
  }

  if (ctx) {
    ctx += `Use the product names and descriptions to inform your content accuracy. Use the product image URLs and web reference URLs in your IMAGE tag referenceImages fields and as visual anchors in your prompts.\n`
  }

  return ctx
}

// ── Image feedback learning context ──────────────────────────

function buildFeedbackContext() {
  try {
    const feedbackFile = dataFile('blog-writer-image-feedback.json')
    if (!existsSync(feedbackFile)) return ''

    const entries = JSON.parse(readFileSync(feedbackFile, 'utf-8'))
    if (!entries || entries.length === 0) return ''

    // Separate good, bad, and published feedback
    const bad = entries.filter(e => e.rating === 'bad' && e.comment).slice(-15)
    const good = entries.filter(e => e.rating === 'good' || e.rating === 'published').slice(-10)

    if (bad.length === 0 && good.length === 0) return ''

    let context = '\nIMAGE GENERATION LEARNING — FROM PAST FEEDBACK:\n'

    if (bad.length > 0) {
      context += '\nTHINGS THAT WENT WRONG (avoid these in your image prompts):\n'
      for (const fb of bad) {
        context += `- Keyword "${fb.keyword}", ${fb.placement} ${fb.variant}: "${fb.comment}"\n`
      }
    }

    if (good.length > 0) {
      context += '\nTHINGS THAT WORKED (replicate these patterns):\n'
      const goodPrompts = good.filter(g => g.prompt).slice(-5)
      for (const fb of goodPrompts) {
        context += `- Keyword "${fb.keyword}", ${fb.placement}: prompt style that was approved\n`
      }
    }

    context += '\nUse this feedback to improve your image prompts. Avoid patterns from "bad" feedback. Replicate patterns from "good" and "published" feedback.\n'

    return context
  } catch (e) {
    console.warn('[BlogWriter] Could not load feedback context:', e.message)
    return ''
  }
}

export async function generateBlogArticle(keyword, options = {}) {
  const articleType = options.articleType || 'informational'

  console.log(`[BlogWriter] Generating ${articleType} article for "${keyword}"`)

  const productContext = await fetchProductContext(keyword)
  const scrapeContext = buildScrapeContext(options.brandScrape, options.webRefs)
  const feedbackContext = await buildFeedbackContext()
  const prompt = buildArticlePrompt(keyword, articleType, productContext, scrapeContext) + feedbackContext

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
