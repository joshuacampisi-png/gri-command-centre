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

export function buildImagePrompt({ category, hookText, styleHint } = {}) {
  const key = category && CATEGORY_SUBJECTS[category] ? category : 'default'
  const subject = CATEGORY_SUBJECTS[key]
  const hint = styleHint ? ` Extra style detail: ${styleHint}.` : ''
  const overlay = hookText
    ? ` With bold modern white sans-serif typography overlaid at the top reading: '${hookText}'`
    : ''
  return [
    `Subject: ${subject}.`,
    `Style: ${BASE_STYLE}.`,
    HARD_GUARDRAILS,
    hint.trim(),
    overlay.trim()
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
}

export function buildClaudePromptForGmb({ category, urlInfo, siteContext } = {}) {
  const system = [
    "You are writing Google Business Profile post copy for Gender Reveal Ideas, Australia's #1 gender reveal store (Gold Coast HQ, ships Australia-wide, family-owned since 2010, 12K+ Aussie families, 4.85 stars across 12K+ reviews).",
    "Hook text: bold and short for image overlay - examples: PINK OR BLUE?, ITS A...?, THE BIG REVEAL, BOY OR GIRL?",
    "Description: Australian English (colour, organised, favourite). Mention brand naturally. DO NOT name specific products (the image is generic lifestyle, not product). Keep it celebration-focused, not product-focused. End with hashtags."
  ].join('\n')

  const url = urlInfo && urlInfo.url ? urlInfo.url : ''
  const button = urlInfo && urlInfo.button ? urlInfo.button : ''
  const ctx = siteContext ? JSON.stringify(siteContext) : 'none'

  const user = `Category: ${category}. URL the post will link to: ${url}. Button type: ${button}. Site context (if fetched): ${ctx}. Generate the four JSON fields. Return ONLY a JSON object, no markdown fences.`

  return { system, user }
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
