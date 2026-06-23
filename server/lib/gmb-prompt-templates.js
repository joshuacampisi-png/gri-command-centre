// gmb-prompt-templates.js
// Locked-down prompt builder for GMB AI content generation.
// GUARDRAIL layer: FAL never tries to draw branded GRI products (AI warps them badly).
// Only generic lifestyle gender reveal imagery + text overlays.

const CATEGORY_SUBJECTS = {
  tnt: 'couple celebrating mid-reveal with massive pink or blue powder cloud erupting outdoors, no equipment visible',
  smoke: 'couple kissing with soft pink and blue coloured smoke drifting around them, photographer-style shot',
  cannon: 'wide shot of friends and family in a backyard with confetti rain mid-air, pink and blue',
  powder: 'close-up of hands cupping pink and blue holi powder, soft afternoon light',
  burnout: 'pink and blue smoke cloud at a backyard party, no car visible',
  balloon: 'balloon arch in pastels with a couple posing under it, gender reveal banner in soft focus',
  bundle: 'group of friends laughing together with pink and blue confetti, party atmosphere',
  sydney: 'reveal moment with iconic Sydney harbour bridge or coastal background, soft sunset',
  melbourne: 'reveal moment in a leafy Melbourne backyard, eucalyptus trees, garden party vibe',
  brisbane: 'reveal moment in a sunny Queensland backyard, palm trees, casual Aussie vibe',
  default: 'generic Aussie family or couple celebrating reveal moment, warm and joyful'
}

const BASE_STYLE = [
  'warm cinematic photography',
  'soft natural light',
  'Instagram-worthy lifestyle',
  'golden hour or bright airy daylight',
  'professional photo composition',
  'Australian setting where relevant: beach, suburban backyard, gum tree-lined park, suburban street, gold coast vibe',
  'people: expecting couples, pregnant women, families, friends celebrating - diverse, joyful, candid',
  'pink and blue colour palette woven in via balloons / smoke / powder / confetti / clothing - NOT product packaging',
  'square 1:1 aspect ratio for Instagram and GMB'
].join(', ')

const HARD_GUARDRAILS = [
  'HARD GUARDRAILS:',
  'NO branded products, NO fire-extinguisher-shaped cannons, NO TNT-style detonator boxes, NO product packaging, NO logos, NO brand names visible, NO text labels on objects.',
  'NO commercial product photography style - must feel like real lifestyle photography from a family reveal moment.',
  'NO AI-distorted product renders - if powder/confetti is shown it must be ambient (in the air, on the ground) not held in a branded container.'
].join(' ')

// Bias the scene generation based on the trending keyword without ever
// breaking the hard guardrails (no branded products, no logos, etc.).
function keywordSceneBias(trendingKeyword) {
  if (!trendingKeyword || typeof trendingKeyword !== 'string') return ''
  const k = trendingKeyword.toLowerCase()
  const bits = []

  // Location bias
  if (k.includes('sydney')) {
    bits.push('iconic Sydney coastal background (harbour bridge silhouette or Bondi-style coastline in soft focus), golden sunset light')
  } else if (k.includes('melbourne')) {
    bits.push('leafy Melbourne backyard setting, eucalyptus trees, garden party vibe')
  } else if (k.includes('brisbane') || k.includes('gold coast') || k.includes('queensland')) {
    bits.push('sunny Queensland setting, palm trees, casual Aussie outdoor vibe')
  }

  // Setting bias
  if (k.includes('outdoor') || k.includes('backyard')) {
    bits.push('outdoor backyard scene at golden hour, open sky, natural greenery')
  } else if (k.includes('indoor') || k.includes('inside')) {
    bits.push('warm indoor lounge or studio scene with soft window light')
  } else if (k.includes('beach')) {
    bits.push('Australian beach setting at golden hour, soft sand, gentle surf')
  }

  // Scale / intimacy bias
  if (k.includes('small') || k.includes('intimate') || k.includes('just us') || k.includes('simple')) {
    bits.push('intimate close-up of just the expecting couple, tender candid moment, shallow depth of field')
  } else if (k.includes('big') || k.includes('huge') || k.includes('epic') || k.includes('crowd') || k.includes('party')) {
    bits.push('wider group shot with family and friends celebrating together, lively party energy')
  }

  // Product-style bias (ambient only, never branded packaging)
  if (k.includes('smoke')) {
    bits.push('coloured pink and blue smoke prominent in the scene, drifting ambient smoke (not held in any branded canister)')
  }
  if (k.includes('powder') || k.includes('holi')) {
    bits.push('pink and blue powder erupting mid-air or cupped in bare hands, no containers')
  }
  if (k.includes('confetti') || k.includes('cannon')) {
    bits.push('pink and blue confetti raining mid-air, captured at the peak moment')
  }
  if (k.includes('balloon')) {
    bits.push('pastel balloon arch or balloon cluster in soft focus background')
  }
  if (k.includes('tnt') || k.includes('blast') || k.includes('explosion')) {
    bits.push('huge coloured powder cloud erupting outdoors at the moment of reveal, no equipment visible')
  }

  return bits.length ? ` Scene bias from trending keyword "${trendingKeyword}": ${bits.join('; ')}.` : ''
}

export function buildImagePrompt({ category, hookText, styleHint, trendingKeyword } = {}) {
  const key = category && CATEGORY_SUBJECTS[category] ? category : 'default'
  const subject = CATEGORY_SUBJECTS[key]
  const hint = styleHint ? ` Extra style detail: ${styleHint}.` : ''
  const bias = keywordSceneBias(trendingKeyword)
  const overlay = hookText
    ? ` With bold modern white sans-serif typography overlaid at the top reading: '${hookText}'`
    : ''
  return [
    `Subject: ${subject}.`,
    `Style: ${BASE_STYLE}.`,
    HARD_GUARDRAILS,
    hint.trim(),
    bias.trim(),
    overlay.trim()
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
}

export function buildClaudePromptForGmb({ category, urlInfo, siteContext, trendingKeyword } = {}) {
  const hasKeyword = trendingKeyword && typeof trendingKeyword === 'string' && trendingKeyword.trim().length > 0
  const kw = hasKeyword ? trendingKeyword.trim() : ''

  const systemLines = [
    "You are writing Google Business Profile post copy for Gender Reveal Ideas, Australia's #1 gender reveal store (Gold Coast HQ, ships Australia-wide, family-owned since 2010, 12K+ Aussie families, 4.85 stars across 12K+ reviews).",
    "Hook text: bold and short for image overlay - examples: PINK OR BLUE?, ITS A...?, THE BIG REVEAL, BOY OR GIRL?",
    "Description: Australian English (colour, organised, favourite). Mention brand naturally. DO NOT name specific products (the image is generic lifestyle, not product). Keep it celebration-focused, not product-focused. End with hashtags."
  ]

  if (hasKeyword) {
    systemLines.push(
      `SEO MODE: This is a keyword-driven post. The trending keyword is "${kw}". Optimise the copy for Google Business Profile search visibility around that exact phrase while still sounding natural and celebration-focused.`
    )
  }

  const system = systemLines.join('\n')

  const url = urlInfo && urlInfo.url ? urlInfo.url : ''
  const button = urlInfo && urlInfo.button ? urlInfo.button : ''
  const ctx = siteContext ? JSON.stringify(siteContext) : 'none'

  const userParts = [
    `Category: ${category}.`,
    `URL the post will link to: ${url}.`,
    `Button type: ${button}.`,
    `Site context (if fetched): ${ctx}.`
  ]

  if (hasKeyword) {
    userParts.push(
      `Trending keyword: "${kw}".`,
      `KEYWORD RULES (Google indexes only the first 100 characters of GMB post descriptions, so this is load-bearing):`,
      `1. The description MUST lead with the trending keyword "${kw}" inside the first 100 characters - ideally in the opening sentence.`,
      `2. Repeat the keyword (or a very close natural variant) 2-3 times across the body without keyword-stuffing.`,
      `3. Use "${kw}" (or a close hashtag variant such as the keyword with spaces removed) as ONE of the hashtags.`,
      `4. The HOOK should incorporate the keyword or its core idea if it can be done naturally and stay short and punchy (e.g. for "gender reveal smoke bomb sydney" the hook could be "SMOKE OR POWDER?" with the description carrying the keyword weight). If the keyword does not fit a short overlay, use a strong generic reveal hook instead.`,
      `5. Australian English throughout. Still no specific GRI product names - the image is generic lifestyle.`
    )
  }

  userParts.push('Generate the four JSON fields. Return ONLY a JSON object, no markdown fences.')

  const user = userParts.join(' ')

  return { system, user }
}

// Maps a trending keyword to one of the existing category buckets so the URL
// mapping table keeps working and the CTA still links to the right product
// or collection page.
export function inferCategoryFromKeyword(trendingKeyword) {
  if (!trendingKeyword || typeof trendingKeyword !== 'string') return 'default'
  const k = trendingKeyword.toLowerCase()

  // City buckets win first - they map to city collection pages
  if (k.includes('sydney')) return 'sydney'
  if (k.includes('melbourne')) return 'melbourne'
  if (k.includes('brisbane') || k.includes('gold coast') || k.includes('queensland')) return 'brisbane'

  // Product buckets
  if (k.includes('tnt') || k.includes('detonator') || k.includes('plunger')) return 'tnt'
  if (k.includes('smoke')) return 'smoke'
  if (k.includes('cannon') || k.includes('confetti')) return 'cannon'
  if (k.includes('powder') || k.includes('holi')) return 'powder'
  if (k.includes('burnout') || k.includes('tyre') || k.includes('tire')) return 'burnout'
  if (k.includes('balloon')) return 'balloon'
  if (k.includes('bundle') || k.includes('pack') || k.includes('kit') || k.includes('combo')) return 'bundle'

  return 'default'
}

export const HOOK_FALLBACKS = [
  'PINK OR BLUE?',
  'ITS A...?',
  'BOY OR GIRL?',
  'THE BIG REVEAL',
  'MUM AND DADS BIGGEST SURPRISE',
  'THE WAIT IS OVER',
  'BABY COMING - PINK OR BLUE?',
  'REVEAL DAY',
  'HE OR SHE?',
  'BIG REVEAL VIBES',
  'OUR LITTLE SECRET',
  'READY TO POP',
  'PINK OR BLUE?',
  'GENDER REVEAL 2026',
  'BABY ON THE WAY',
  'SURPRISE COMING SOON',
  'REVEAL MAGIC',
  'THE FAMILY NEXT CHAPTER',
  'MAKING MEMORIES',
  'BOY OR GIRL - YOU DECIDE'
]
