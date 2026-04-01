/**
 * ig-reply-bot/website-knowledge.js
 * Static knowledge base from genderrevealideas.com.au.
 * Used by the reply generator to include real product links and shipping info.
 *
 * IMPORTANT: All info here MUST match the live website exactly.
 * If unsure about something, DO NOT include it — the reply generator
 * is instructed to direct to the website when info is missing.
 */

export const SITE_URL = 'https://genderrevealideas.com.au'
export const YOUTUBE_URL = 'https://www.youtube.com/@GenderRevealIdeasAustralia'

export const COLLECTIONS = {
  bundles: { name: 'Bundles', url: `${SITE_URL}/collections/gender-reveal-bundles` },
  extinguishers: { name: 'Extinguishers', url: `${SITE_URL}/collections/gender-reveal-extinguishers-australia` },
  smokeBombs: { name: 'Smoke Bombs', url: `${SITE_URL}/collections/gender-reveal-smoke-bombs-australia` },
  cannons: { name: 'Cannons', url: `${SITE_URL}/collections/gender-reveal-cannons` },
  sports: { name: 'Sports Balls', url: `${SITE_URL}/collections/gender-reveal-sports-balls` },
  balloons: { name: 'Balloons & Decor', url: `${SITE_URL}/collections/gender-reveal-balloons` },
}

export const POPULAR_PRODUCTS = [
  { name: 'Gender Reveal Smoke Bombs', price: '$29.99', collection: 'smokeBombs' },
  { name: 'Mini Blaster Powder Extinguisher', price: '$49.99', collection: 'extinguishers' },
  { name: 'MEGA Powder Blaster', price: '$149.99', collection: 'extinguishers' },
  { name: 'Confetti & Powder Cannon XL 50cm', price: '$34.95', collection: 'cannons' },
  { name: 'Gender Reveal Golf Balls', price: '$24.99', collection: 'sports' },
  { name: 'Gender Reveal Cricket Ball', price: '$29.99', collection: 'sports' },
  { name: 'Gender Reveal Soccer Ball', price: '$34.99', collection: 'sports' },
  { name: 'Gender Reveal Basketball', price: '$29.99', collection: 'sports' },
  { name: 'Gender Reveal AFL Ball', price: '$45.00', collection: 'sports' },
  { name: 'Gender Reveal Rugby Ball', price: '$45.00', collection: 'sports' },
  { name: 'Gender Reveal Baseball', price: '$39.99', collection: 'sports' },
  { name: 'Burn Away Cake Topper Kit', price: '$29.99', collection: 'balloons' },
  { name: 'Blaster & Smoke Reveal Kit', price: '$99.99', collection: 'bundles' },
  { name: 'Custom Inflatable Baby Costume Gender Reveal', price: '$149.99', collection: 'balloons' },
  { name: 'Gender Reveal Scratchies 24 Pack', price: '$14.99', collection: 'balloons' },
  { name: 'Full Gender Reveal Backdrop Kit', price: '$39.99', collection: 'balloons' },
  { name: 'Gender Reveal Photo Booth Props 60pcs', price: '$29.99', collection: 'balloons' },
  { name: 'Gender Reveal Dog Bandana', price: '$12.99', collection: 'balloons' },
  { name: 'Gender Reveal Poke Ball 2 Pack', price: '$19.99', collection: 'sports' },
  { name: 'Quad Gender Reveal MEGA Powder Blaster', price: '$399.99', collection: 'extinguishers' },
  { name: 'Gender Geddon Bundle (Largest Bundle)', price: '$849.99', collection: 'bundles' },
  { name: 'Smoke Bomb 4x Bundle Pack', price: '$89.99', collection: 'smokeBombs' },
  { name: 'Gender Reveal Boy & Girl Party Glasses 20pcs', price: '$39.99', collection: 'balloons' },
  { name: 'Gender Reveal Party Voting Sheet', price: '$19.99', collection: 'balloons' },
]

export const SHIPPING_INFO = {
  freeShipping: 'Free shipping Australia wide on orders over $150. Standard shipping $9.99 for smaller orders',
  expressShipping: 'Super Express available: QLD/NSW $25, Rest of AU $35 (1 to 2 business days)',
  courier: 'StarTrack Super Express Post (99% on time accuracy)',
  processing: 'Orders ship within 1 to 8 hours (excluding weekends and public holidays)',
  delivery: {
    'QLD': '1 to 2 business days express, 2 to 7 standard',
    'NSW': '1 to 2 business days express, 2 to 7 standard',
    'VIC Metro': '1 to 3 business days express, 2 to 9 standard',
    'VIC Remote': '1 to 5 business days',
    'SA, WA, NT': '3 to 6 business days',
  },
  pickup: 'Same day pick up available at checkout (Gold Coast)',
  tracking: 'Tracking number emailed with every order',
  protection: 'Full protection on all express orders. Lost or damaged parcels get a full refund or replacement guaranteed',
  recommendation: 'Order at least 12 days before your reveal to be safe',
  internationalNZ: 'NZ shipping $24.99, free over $168.73',
  internationalUS: 'US/Canada shipping $35 (6 to 14 days)',
  policyUrl: `${SITE_URL}/policies/shipping-policy`,
}

export const FAQ_ANSWERS = {
  smokeBombsStain: 'Our products do not stain! The powder is easily washed out. All our products are custom made and fully Australian standard.',
  smokeBombsLegal: 'Yes! Our smoke bombs are government approved and registered with Resources Safety & Health QLD. Only legal smoke bombs in Australia. Made with non toxic, natural ingredients.',
  environment: 'Non toxic, eco conscious ingredients. Safe for outdoor use.',
  colourSecret: 'Use our "To Be Announced" option so a friend can specify the colour secretly using the order number.',
  refunds: 'Full protection and replacement guaranteed for lost or damaged parcels.',
}

/**
 * Build a knowledge context string for the reply generator.
 */
export function buildKnowledgeContext(commentText) {
  const lower = commentText.toLowerCase()
  const parts = []

  // ALWAYS include the golden rule
  parts.push(`GOLDEN RULE: If you are not 100% sure we stock a specific product, NEVER say we don't have it. Instead say "Check out our full range at the link in bio babe!" or "We've got heaps on the website gorgeous, have a look!"`)

  // Shipping questions
  if (lower.match(/ship|deliver|how long|when.*arrive|postage|post|express|pickup|pick up|free shipping|shipping cost/)) {
    parts.push(`SHIPPING: ${SHIPPING_INFO.freeShipping}. ${SHIPPING_INFO.expressShipping}. Shipped via ${SHIPPING_INFO.courier}. ${SHIPPING_INFO.processing}. QLD/NSW: ${SHIPPING_INFO.delivery['QLD']}. VIC Metro: ${SHIPPING_INFO.delivery['VIC Metro']}. SA/WA/NT: ${SHIPPING_INFO.delivery['SA, WA, NT']}. ${SHIPPING_INFO.pickup}. ${SHIPPING_INFO.tracking}. ${SHIPPING_INFO.protection}.`)
  }

  // Price questions
  if (lower.match(/price|cost|how much|cheap|expensive|afford/)) {
    const priceList = POPULAR_PRODUCTS.slice(0, 6).map(p => `${p.name}: ${p.price}`).join(', ')
    parts.push(`PRICES: ${priceList}. Full range at ${SITE_URL}`)
  }

  // Product type questions
  if (lower.match(/smoke|bomb/)) {
    parts.push(`SMOKE BOMBS: From $29.99. 4x Bundle $89.99. Government approved, non toxic, only legal smoke bombs in Australia. ${COLLECTIONS.smokeBombs.url}`)
  }
  if (lower.match(/cannon|confetti|powder/)) {
    parts.push(`CANNONS: Confetti & Powder from $34.95. XL 50cm size. ${COLLECTIONS.cannons.url}`)
  }
  if (lower.match(/extinguisher|blaster/)) {
    parts.push(`EXTINGUISHERS: Mini Blaster $49.99, MEGA Blaster $149.99, Quad MEGA $399.99. ${COLLECTIONS.extinguishers.url}`)
  }
  if (lower.match(/ball|golf|cricket|soccer|footy|afl|rugby|baseball|basketball|poke/)) {
    parts.push(`SPORTS BALLS: Golf $24.99, Cricket $29.99, Soccer $34.99, Basketball $29.99, AFL $45, Rugby $45, Baseball $39.99, Poke Ball 2pk $19.99. ${COLLECTIONS.sports.url}`)
  }
  if (lower.match(/balloon|decor|cake|topper|backdrop|prop|glasses|voting|scratchie/)) {
    parts.push(`BALLOONS & DECOR: Cake Topper $29.99, Backdrop Kit $39.99, Photo Props $29.99, Scratchies $14.99, Party Glasses $39.99. ${COLLECTIONS.balloons.url}`)
  }
  if (lower.match(/inflatable|costume|suit|baby suit|baby costume/)) {
    parts.push(`INFLATABLE COSTUME: Custom Inflatable Baby Costume $149.99. ${COLLECTIONS.balloons.url}`)
  }
  if (lower.match(/bundle|kit|pack|combo/)) {
    parts.push(`BUNDLES: Blaster & Smoke Kit $99.99, Gender Geddon (largest) $849.99. Save up to 50%. ${COLLECTIONS.bundles.url}`)
  }
  if (lower.match(/dog|bandana|pet/)) {
    parts.push(`PET REVEAL: Gender Reveal Dog Bandana $12.99. ${COLLECTIONS.balloons.url}`)
  }

  // Where to buy
  if (lower.match(/where|buy|order|website|link|shop|store/)) {
    parts.push(`SHOP: ${SITE_URL} or link in bio. Free shipping on orders over $150!`)
  }

  // Staining concern
  if (lower.match(/stain|mess|clean/)) {
    parts.push(`STAINING: ${FAQ_ANSWERS.smokeBombsStain}`)
  }

  // Legal concern
  if (lower.match(/legal|safe|allow|permit/)) {
    parts.push(`LEGAL: ${FAQ_ANSWERS.smokeBombsLegal}`)
  }

  // Secret colour
  if (lower.match(/secret|surprise|friend.*order|someone.*order/)) {
    parts.push(`SECRET REVEAL: ${FAQ_ANSWERS.colourSecret}`)
  }

  // How to use / help / tutorial / video requests
  if (lower.match(/how to|how do|tutorial|video|help|instructions|guide|demo|watch|show me|explain/)) {
    parts.push(`YOUTUBE: For tutorials and how to videos, check out our YouTube channel: ${YOUTUBE_URL}`)
  }

  // Default — always include website link
  parts.push(`WEBSITE: ${SITE_URL} — Australia's #1 Gender Reveal Store. 70,000+ Aussie customers.`)

  return parts.join('\n')
}
