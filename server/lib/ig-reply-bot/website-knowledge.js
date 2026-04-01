/**
 * ig-reply-bot/website-knowledge.js
 * Static knowledge base from genderrevealideas.com.au.
 * Used by the reply generator to include real product links and shipping info.
 * Refreshed manually when products/policies change.
 */

export const SITE_URL = 'https://genderrevealideas.com.au'

export const COLLECTIONS = {
  bundles: { name: 'Bundles', url: `${SITE_URL}/collections/gender-reveal-bundles`, count: 38 },
  extinguishers: { name: 'Extinguishers', url: `${SITE_URL}/collections/gender-reveal-extinguishers-australia`, count: 9 },
  smokeBombs: { name: 'Smoke Bombs', url: `${SITE_URL}/collections/gender-reveal-smoke-bombs-australia`, count: 13 },
  cannons: { name: 'Cannons', url: `${SITE_URL}/collections/gender-reveal-cannons`, count: 33 },
  sports: { name: 'Sports Balls', url: `${SITE_URL}/collections/gender-reveal-sports-balls`, count: 13 },
  balloons: { name: 'Balloons & Decor', url: `${SITE_URL}/collections/gender-reveal-balloons`, count: 43 },
}

export const POPULAR_PRODUCTS = [
  { name: 'Gender Reveal Smoke Bombs', price: '$29.99', url: `${SITE_URL}/collections/gender-reveal-smoke-bombs-australia` },
  { name: 'Mini Blaster Powder Extinguisher', price: '$49.99', url: `${SITE_URL}/collections/gender-reveal-extinguishers-australia` },
  { name: 'MEGA Powder Blaster', price: '$149.99', url: `${SITE_URL}/collections/gender-reveal-extinguishers-australia` },
  { name: 'Confetti & Powder Cannon XL', price: '$34.95', url: `${SITE_URL}/collections/gender-reveal-cannons` },
  { name: 'Gender Reveal Golf Balls', price: '$24.99', url: `${SITE_URL}/collections/gender-reveal-sports-balls` },
  { name: 'Gender Reveal Cricket Ball', price: '$29.99', url: `${SITE_URL}/collections/gender-reveal-sports-balls` },
  { name: 'Gender Reveal Soccer Ball', price: '$34.99', url: `${SITE_URL}/collections/gender-reveal-sports-balls` },
  { name: 'Gender Reveal Basketball', price: '$29.99', url: `${SITE_URL}/collections/gender-reveal-sports-balls` },
  { name: 'Burn Away Cake Topper Kit', price: '$29.99', url: `${SITE_URL}/collections/gender-reveal-balloons` },
  { name: 'Blaster & Smoke Reveal Kit', price: '$99.99', url: `${SITE_URL}/collections/gender-reveal-bundles` },
]

export const SHIPPING_INFO = {
  freeShipping: 'Free shipping on all orders over $15',
  courier: 'StarTrack Super Express Post',
  processing: 'Orders ship within 1 to 8 hours (excluding weekends)',
  delivery: {
    'QLD, NSW, VIC Metro': '1 to 2 business days',
    'VIC Remote': '1 to 5 business days',
    'SA, WA, NT': '3 to 6 business days',
  },
  pickup: 'Same day pick up available at checkout',
  tracking: 'Tracking number emailed with every order',
  recommendation: 'Order at least 12 days before your reveal for peace of mind',
  policyUrl: `${SITE_URL}/policies/shipping-policy`,
}

export const FAQ_ANSWERS = {
  smokeBombsStain: 'Minimal risk outdoors. Any residue is typically washable. Best used in open, well ventilated areas.',
  smokeBombsLegal: 'Yes! Our smoke bombs are government approved and registered with Resources Safety & Health QLD. Only legal smoke bombs in Australia. Made with non toxic, natural ingredients.',
  environment: 'Non toxic, eco conscious ingredients. Safe for outdoor use.',
  colourSecret: 'Use our "To Be Announced" option so a friend can specify the colour secretly using the order number.',
  refunds: 'Full protection and replacement guaranteed for lost or damaged parcels.',
}

/**
 * Build a knowledge context string for the reply generator.
 * Keeps it concise so it fits in the Claude prompt without blowing budget.
 */
export function buildKnowledgeContext(commentText) {
  const lower = commentText.toLowerCase()
  const parts = []

  // Shipping questions
  if (lower.match(/ship|deliver|how long|when.*arrive|postage|post|express|pickup|pick up/)) {
    parts.push(`SHIPPING: ${SHIPPING_INFO.freeShipping}. ${SHIPPING_INFO.courier}. ${SHIPPING_INFO.processing}. QLD/NSW/VIC Metro: ${SHIPPING_INFO.delivery['QLD, NSW, VIC Metro']}. SA/WA/NT: ${SHIPPING_INFO.delivery['SA, WA, NT']}. ${SHIPPING_INFO.pickup}. ${SHIPPING_INFO.tracking}.`)
  }

  // Price questions
  if (lower.match(/price|cost|how much|cheap|expensive|afford/)) {
    const priceList = POPULAR_PRODUCTS.slice(0, 5).map(p => `${p.name}: ${p.price}`).join(', ')
    parts.push(`PRICES: ${priceList}. Full range at ${SITE_URL}`)
  }

  // Product type questions
  if (lower.match(/smoke|bomb/)) {
    parts.push(`SMOKE BOMBS: From $29.99. Government approved, non toxic, only legal smoke bombs in Australia. ${COLLECTIONS.smokeBombs.url}`)
  }
  if (lower.match(/cannon|confetti|powder/)) {
    parts.push(`CANNONS: Confetti & Powder from $34.95. XL 50cm size. ${COLLECTIONS.cannons.url}`)
  }
  if (lower.match(/extinguisher|blaster/)) {
    parts.push(`EXTINGUISHERS: Mini Blaster $49.99, MEGA Blaster $149.99. ${COLLECTIONS.extinguishers.url}`)
  }
  if (lower.match(/ball|golf|cricket|soccer|footy|afl|rugby|baseball|basketball/)) {
    parts.push(`SPORTS BALLS: Golf $24.99, Cricket $29.99, Soccer $34.99, Basketball $29.99, AFL $45, Rugby $45. ${COLLECTIONS.sports.url}`)
  }
  if (lower.match(/balloon|decor|cake|topper|backdrop/)) {
    parts.push(`BALLOONS & DECOR: Burn Away Cake Topper $29.99, Backdrop Kit $39.99, Party Props from $14.99. ${COLLECTIONS.balloons.url}`)
  }
  if (lower.match(/bundle|kit|pack/)) {
    parts.push(`BUNDLES: Save up to 50% with kits from $64.95. ${COLLECTIONS.bundles.url}`)
  }

  // Where to buy
  if (lower.match(/where|buy|order|website|link|shop|store/)) {
    parts.push(`SHOP: ${SITE_URL} or link in bio. Free shipping on all orders!`)
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

  // Default — always include website
  if (parts.length === 0) {
    parts.push(`WEBSITE: ${SITE_URL} — Australia's #1 Gender Reveal Store. Free shipping on all orders. Over 70,000+ Aussie customers.`)
  }

  return parts.join('\n')
}
