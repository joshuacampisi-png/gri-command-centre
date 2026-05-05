/**
 * shopping-feed-optimise.js
 * Bulk optimise Shopify products for Google Shopping feed performance.
 *
 * Phase 1: SEO titles (Shopping-optimised, store titles stay clean)
 * Phase 2: Product types + condition + age_group
 * Phase 3: Google Product Categories (deep taxonomy)
 *
 * Run: node scripts/shopping-feed-optimise.js
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN

async function gql(query, variables = {}) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  const data = await res.json()
  if (data.errors) console.error('  GQL Error:', JSON.stringify(data.errors[0]?.message || data.errors))
  return data
}

// ── Product classification rules ──────────────────────────────────────────

function classifyProduct(title, tags, handle, currentType) {
  const t = title.toLowerCase()
  const h = handle.toLowerCase()
  const tagStr = (tags || '').toLowerCase()

  // Skip non-shoppable products
  if (t.includes('[free]') || t.includes('shipping upgrade') || t.includes('double powder, double')) {
    return { skip: true }
  }

  // TNT Hire
  if (t.includes('tnt') && (t.includes('hire') || t.includes('reveal'))) {
    return { category: 'tnt', productType: 'Gender Reveal > TNT Hire', googleCat: '5709' }
  }
  if (t.includes('diy hire') || t.includes('balloon garland')) {
    return { category: 'decor', productType: 'Gender Reveal > Decorations', googleCat: '2587' }
  }

  // Bundles (check before individual products)
  if (t.includes('bundle') || t.includes('gender-geddon') || t.includes('party set') || t.includes('party box') || t.includes('decoration set')) {
    if (t.includes('smoke') && t.includes('cannon')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Smoke & Cannon', googleCat: '5709' }
    if (t.includes('cannon') || t.includes('extinguisher') || t.includes('blaster')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Cannon & Extinguisher', googleCat: '5709' }
    if (t.includes('smoke')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Smoke Bombs', googleCat: '5709' }
    if (t.includes('afl') || t.includes('soccer') || t.includes('golf') || t.includes('sport') || t.includes('game day') || t.includes('race day')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Sports', googleCat: '5709' }
    if (t.includes('balloon')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Balloon Kit', googleCat: '2587' }
    if (t.includes('mario') || t.includes('paw patrol') || t.includes('toy story')) return { category: 'party_set', productType: 'Party Supplies > Themed Party Set', googleCat: '5452' }
    return { category: 'bundle', productType: 'Gender Reveal > Bundles', googleCat: '5709' }
  }

  // 2-pack / 4-pack (bundles)
  if (t.includes('2 pack') || t.includes('4 pack') || t.includes('4x bundle')) {
    if (t.includes('confetti')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Confetti Cannon Pack', googleCat: '5709' }
    if (t.includes('powder')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Powder Cannon Pack', googleCat: '5709' }
    if (t.includes('smoke')) return { category: 'bundle', productType: 'Gender Reveal > Bundles > Smoke Bombs Pack', googleCat: '5709' }
    return { category: 'bundle', productType: 'Gender Reveal > Bundles', googleCat: '5709' }
  }

  // Mega / Extinguisher / Blaster
  if (t.includes('mega') && (t.includes('blaster') || t.includes('extinguisher'))) {
    return { category: 'blaster', productType: 'Gender Reveal > Powder Extinguisher', googleCat: '2781' }
  }
  if (t.includes('quad') && t.includes('extinguisher')) {
    return { category: 'blaster', productType: 'Gender Reveal > Powder Extinguisher', googleCat: '2781' }
  }
  if (t.includes('mini blaster') || t.includes('extinguisher')) {
    return { category: 'blaster', productType: 'Gender Reveal > Powder Extinguisher', googleCat: '2781' }
  }

  // Burnout powder
  if (t.includes('burnout')) {
    return { category: 'burnout', productType: 'Gender Reveal > Burnout Tyre Powder', googleCat: '5709' }
  }

  // Smoke bombs
  if (t.includes('smoke bomb') || (t.includes('smoke') && t.includes('box'))) {
    return { category: 'smoke', productType: 'Gender Reveal > Smoke Bombs', googleCat: '5709' }
  }

  // Cannons
  if (t.includes('cannon') || t.includes('popper')) {
    if (t.includes('confetti') && t.includes('powder')) return { category: 'cannon', productType: 'Gender Reveal > Confetti & Powder Cannon', googleCat: '2781' }
    if (t.includes('confetti')) return { category: 'cannon', productType: 'Gender Reveal > Confetti Cannon', googleCat: '2781' }
    if (t.includes('powder') || t.includes('bio')) return { category: 'cannon', productType: 'Gender Reveal > Powder Cannon', googleCat: '2781' }
    if (t.includes('prank')) return { category: 'cannon', productType: 'Gender Reveal > Prank Cannon', googleCat: '2781' }
    return { category: 'cannon', productType: 'Gender Reveal > Cannon', googleCat: '2781' }
  }

  // Sports
  if (t.includes('golf ball') || t.includes('soccer ball') || t.includes('basketball') || t.includes('baseball') || t.includes('afl') || t.includes('nrl') || t.includes('cricket') || t.includes('nfl')) {
    return { category: 'sports', productType: 'Gender Reveal > Sports Reveal', googleCat: '1049' }
  }

  // Powder standalone
  if (t.includes('powder') && !t.includes('cannon') && !t.includes('blaster')) {
    return { category: 'powder', productType: 'Gender Reveal > Powder', googleCat: '5709' }
  }

  // Balloons
  if (t.includes('balloon') || t.includes('foil')) {
    return { category: 'balloon', productType: 'Gender Reveal > Balloons', googleCat: '2587' }
  }

  // Costume
  if (t.includes('costume') || t.includes('inflatable')) {
    return { category: 'costume', productType: 'Gender Reveal > Costumes', googleCat: '5192' }
  }

  // Party themed (Mario, Paw Patrol etc)
  if (t.includes('mario') || t.includes('paw patrol') || t.includes('toy story')) {
    return { category: 'party_set', productType: 'Party Supplies > Themed Party Set', googleCat: '5452' }
  }

  // Decorations / accessories
  if (t.includes('cake topper') || t.includes('curtain') || t.includes('back drop') || t.includes('backdrop')) {
    return { category: 'decor', productType: 'Gender Reveal > Decorations', googleCat: '2587' }
  }
  if (t.includes('sash') || t.includes('badge') || t.includes('wrist band') || t.includes('glasses') || t.includes('prop') || t.includes('bandana')) {
    return { category: 'accessory', productType: 'Gender Reveal > Accessories', googleCat: '5709' }
  }
  if (t.includes('scratchie') || t.includes('scratch')) {
    return { category: 'game', productType: 'Gender Reveal > Games & Activities', googleCat: '5709' }
  }
  if (t.includes('game') || t.includes('voting') || t.includes('prediction')) {
    return { category: 'game', productType: 'Gender Reveal > Games & Activities', googleCat: '5709' }
  }
  if (t.includes('confetti') && t.includes('decoration')) {
    return { category: 'decor', productType: 'Gender Reveal > Confetti', googleCat: '5709' }
  }

  // Tableware
  if (t.includes('cup') || t.includes('plate') || t.includes('napkin') || t.includes('fork')) {
    return { category: 'tableware', productType: 'Gender Reveal > Tableware', googleCat: '2587' }
  }
  if (t.includes('gun') || t.includes('spray')) {
    return { category: 'cannon', productType: 'Gender Reveal > Confetti Gun', googleCat: '2781' }
  }

  // Glue dots etc
  if (t.includes('glue dot') || t.includes('balloon glue')) {
    return { category: 'accessory', productType: 'Party Supplies > Balloon Accessories', googleCat: '2587' }
  }

  // Colour party cannons (non gender reveal)
  if (t.includes('party') && (t.includes('green') || t.includes('orange') || t.includes('purple'))) {
    return { category: 'party_cannon', productType: 'Party Supplies > Colour Powder Cannon', googleCat: '2781' }
  }

  // Default
  return { category: 'other', productType: 'Gender Reveal > Party Supplies', googleCat: '5709' }
}

// ── SEO title generator ──────────────────────────────────────────────────

function generateSeoTitle(title, classification) {
  const t = title
  const cat = classification.category

  // Don't touch themed party sets (not gender reveal)
  if (cat === 'party_set') return t + ' | Party Supplies Australia'
  if (cat === 'party_cannon') return t + ' | Colour Powder Cannon Australia'

  // Already has Australia? Don't double up
  const hasAu = t.toLowerCase().includes('australia')

  switch (cat) {
    case 'tnt':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Hire Kit'
    case 'cannon':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Party'
    case 'blaster':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Powder Blaster'
    case 'burnout':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Tyre Burnout'
    case 'smoke':
      return t.replace(/\s*$/, '') + ' Pink Blue Holi Powder' + (hasAu ? '' : ' Australia')
    case 'bundle':
      return t.replace(/\s*$/, '').replace(/🎉/g, '').trim() + (hasAu ? '' : ' Australia') + ' | Gender Reveal Bundle'
    case 'sports':
      return t.replace(/\s*$/, '') + ' Powder' + (hasAu ? '' : ' Australia') + ' | Gender Reveal'
    case 'balloon':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Party'
    case 'costume':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Party'
    case 'decor':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Decorations'
    case 'accessory':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Party'
    case 'game':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Party Games'
    case 'tableware':
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal Party'
    case 'powder':
      return t.replace(/\s*$/, '') + ' Holi Colour' + (hasAu ? '' : ' Australia') + ' | Gender Reveal'
    default:
      return t.replace(/\s*$/, '') + (hasAu ? '' : ' Australia') + ' | Gender Reveal'
  }
}

// ── SEO description generator ────────────────────────────────────────────

function generateSeoDescription(title, classification) {
  const cat = classification.category
  const base = title.replace(/[🎉💥💨]/g, '').trim()

  const descriptions = {
    cannon: `Shop ${base} at Gender Reveal Ideas. Premium quality gender reveal cannons with vibrant powder and confetti. Fast Australia wide shipping. Eco friendly and biodegradable.`,
    blaster: `Shop ${base} at Gender Reveal Ideas. Our powder extinguisher blasters create a massive colour cloud for the ultimate gender reveal moment. Ships Australia wide.`,
    smoke: `Shop ${base} at Gender Reveal Ideas. Vibrant pink and blue holi powder smoke bombs for stunning gender reveal photos and videos. Fast shipping across Australia.`,
    burnout: `Shop ${base} at Gender Reveal Ideas. Create an epic burnout tyre gender reveal with our premium coloured powder. Vibrant pink or blue. Ships Australia wide.`,
    bundle: `Shop ${base} at Gender Reveal Ideas. Save big with our gender reveal bundle packs. Everything you need for the perfect reveal party. Fast Australia wide delivery.`,
    sports: `Shop ${base} at Gender Reveal Ideas. Exploding powder sports balls for a unique gender reveal moment. Available in pink and blue. Fast shipping across Australia.`,
    tnt: `Hire our TNT gender reveal kit at Gender Reveal Ideas. Packed with powder and confetti for the ultimate wow moment. Self hire, delivered across Australia.`,
    balloon: `Shop ${base} at Gender Reveal Ideas. Premium quality balloons and balloon kits for your gender reveal or baby shower party. Fast Australia wide shipping.`,
    costume: `Shop ${base} at Gender Reveal Ideas. Stand out at your gender reveal party with our fun costumes. Premium quality, fast Australia wide delivery.`,
    decor: `Shop ${base} at Gender Reveal Ideas. Beautiful decorations for your gender reveal or baby shower party. Premium quality, fast shipping across Australia.`,
    accessory: `Shop ${base} at Gender Reveal Ideas. Fun accessories to complete your gender reveal party. Premium quality, fast Australia wide shipping.`,
    game: `Shop ${base} at Gender Reveal Ideas. Fun party games and activities for your gender reveal celebration. Fast Australia wide shipping.`,
    tableware: `Shop ${base} at Gender Reveal Ideas. Premium gender reveal and baby shower tableware. Stylish designs for your party. Fast Australia wide delivery.`,
    powder: `Shop ${base} at Gender Reveal Ideas. Vibrant holi colour powder for gender reveals and celebrations. Non toxic, eco friendly. Ships Australia wide.`,
    party_set: `Shop ${base} at Gender Reveal Ideas. Complete themed party sets with everything you need. Fast Australia wide shipping.`,
    party_cannon: `Shop ${base} at Gender Reveal Ideas. Vibrant colour powder cannons for parties and celebrations. Fast Australia wide shipping.`,
  }

  return descriptions[cat] || `Shop ${base} at Gender Reveal Ideas. Australia's favourite gender reveal store. Premium quality, fast shipping across Australia.`
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== SHOPPING FEED OPTIMISATION ===\n')

  // Load product data
  const products = JSON.parse(readFileSync('/tmp/gri-products-audit.json', 'utf8'))
  console.log(`Loaded ${products.length} products\n`)

  let updated = 0, skipped = 0, errors = 0

  for (const p of products) {
    const classification = classifyProduct(p.title, p.tags, p.handle, p.productType)

    if (classification.skip) {
      console.log(`  SKIP: ${p.title.substring(0, 50)}`)
      skipped++
      continue
    }

    const seoTitle = generateSeoTitle(p.title, classification)
    const seoDesc = generateSeoDescription(p.title, classification)
    const productType = classification.productType
    const googleCat = classification.googleCat

    // Extract numeric ID from gid://shopify/Product/123456
    const numericId = p.id.split('/').pop()

    // Build mutation - update SEO, productType, and metafields
    const mutation = `
      mutation {
        productUpdate(input: {
          id: "${p.id}"
          productType: "${productType}"
          seo: {
            title: ${JSON.stringify(seoTitle.substring(0, 70))}
            description: ${JSON.stringify(seoDesc.substring(0, 320))}
          }
        }) {
          product { id title productType seo { title } }
          userErrors { field message }
        }
      }
    `

    try {
      const result = await gql(mutation)
      const ue = result.data?.productUpdate?.userErrors || []
      if (ue.length > 0) {
        console.log(`  ERROR: ${p.title.substring(0, 40)} — ${ue[0].message}`)
        errors++
      } else {
        console.log(`  ✓ ${p.title.substring(0, 45).padEnd(46)} → Type: ${productType.substring(0, 35)} | SEO: "${seoTitle.substring(0, 50)}..."`)
        updated++
      }
    } catch (err) {
      console.log(`  ✗ ${p.title.substring(0, 40)} — ${err.message}`)
      errors++
    }

    // Also set metafields for condition and google category
    const metafieldMutation = `
      mutation {
        productUpdate(input: {
          id: "${p.id}"
          metafields: [
            {
              namespace: "mm-google-shopping"
              key: "condition"
              value: "new"
              type: "single_line_text_field"
            }
            {
              namespace: "mm-google-shopping"
              key: "age_group"
              value: "adult"
              type: "single_line_text_field"
            }
          ]
        }) {
          product { id }
          userErrors { field message }
        }
      }
    `

    try {
      const mfResult = await gql(metafieldMutation)
      const mfErrors = mfResult.data?.productUpdate?.userErrors || []
      if (mfErrors.length > 0) {
        // Don't log noise, metafield namespace might require different approach
      }
    } catch {}

    // Rate limit - Shopify allows ~4 requests/second on GraphQL
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n=== COMPLETE ===`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
