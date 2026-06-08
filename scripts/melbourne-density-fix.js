/**
 * MELBOURNE OVER-OPTIMISATION FIX
 *
 * Current state: 153 "Melbourne" mentions in the page = ~5% keyword density.
 * Google over-optimization threshold ~3%. This rewrites the
 * looking_to_buy_location_text rich text metafield with the same content
 * structure but ~30-40 Melbourne mentions (natural density).
 *
 * Snapshot saved → mutation → verify. Rollback: --rollback restores snapshot.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const SNAPSHOT_DIR = 'data/snapshots/melbourne-density-fix'
mkdirSync(SNAPSHOT_DIR, { recursive: true })

const ROLLBACK = process.argv.includes('--rollback')
const DRY_RUN = !process.argv.includes('--ship') && !ROLLBACK

async function gql(q, v) {
  const r = await fetch(URL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query:q,variables:v}) })
  return r.json()
}

// 1. Fetch current Melbourne page state
console.log(`\n=== ${ROLLBACK?'ROLLBACK':DRY_RUN?'DRY RUN':'SHIP'} — Melbourne keyword density fix ===\n`)
const fetchQ = `{
  collectionByHandle(handle:"gender-reveal-ideas-melbourne") {
    id
    metafield(namespace:"custom", key:"looking_to_buy_location_text") { id type value }
  }
}`
const r = await gql(fetchQ)
const col = r.data?.collectionByHandle
const mf = col?.metafield
if (!col || !mf) { console.error('Melbourne collection or metafield not found'); process.exit(1) }

const current = JSON.parse(mf.value)
const currentText = JSON.stringify(current)
const currentMentions = (currentText.match(/Melbourne/g)||[]).length
console.log(`Current rich text: ${currentText.length} chars, ${currentMentions} "Melbourne" mentions`)

// 2. Rollback path
if (ROLLBACK) {
  const snapPath = `${SNAPSHOT_DIR}/before.json`
  if (!existsSync(snapPath)) { console.error('No snapshot to rollback'); process.exit(1) }
  const before = JSON.parse(readFileSync(snapPath,'utf8'))
  const restoreQ = `mutation($metafields:[MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields){ userErrors{ message } } }`
  const u = await gql(restoreQ, { metafields:[{ ownerId: col.id, namespace:'custom', key:'looking_to_buy_location_text', type:'rich_text_field', value: JSON.stringify(before.previousValue) }] })
  console.log('Rollback:', u.data?.metafieldsSet?.userErrors || 'OK')
  process.exit(0)
}

// 3. Snapshot
writeFileSync(`${SNAPSHOT_DIR}/before.json`, JSON.stringify({ takenAt:new Date().toISOString(), previousValue: current, previousMentions: currentMentions }, null, 2))

// 4. Build new rich text with natural density (~30 Melbourne mentions)
const newRichText = {
  type:'root',
  children:[
    { type:'paragraph', children:[{ type:'text', value:`Planning a gender reveal in Melbourne? You're in the right place. Gender Reveal Ideas is Australia's #1 gender reveal store with the largest range in Victoria. From intimate backyard celebrations to grand venue parties, we ship every reveal product to Melbourne with 1-2 day delivery.` }] },
    { type:'paragraph', children:[{ type:'text', value:`Melbourne weather is famously unpredictable — spring (Sep-Nov) gives you the best chance of sunshine for an outdoor reveal. Always have a backup indoor venue planned. Our 4.85★ rating from 1,360+ verified reviews comes from families across the country, with hundreds of orders shipped to Melbourne addresses since 2020.` }] },

    { type:'heading', level:2, children:[{ type:'text', value:`Best Gender Reveal Locations in Melbourne` }] },
    { type:'paragraph', children:[{ type:'text', value:`Royal Botanic Gardens is one of the most photogenic spots for a reveal moment. Princes Park and the Yarra Trail give you stunning natural backdrops. For larger parties, Albert Park and Carlton Gardens work brilliantly. Brighton Beach and St Kilda Beach are go-to coastal venues, while Williamstown Beach offers quieter alternatives. The Dandenong Ranges suit reveal photography in autumn months.` }] },
    { type:'paragraph', children:[{ type:'text', value:`Whichever venue you choose, our products are fully biodegradable, Australian-safety-tested, and designed to leave no trace.` }] },

    { type:'heading', level:2, children:[{ type:'text', value:`Most Popular Gender Reveal Products in Melbourne` }] },
    { type:'paragraph', children:[{ type:'text', value:`Our bestsellers are gender reveal smoke bombs (4.6★ from 100+ reviews), powder cannons, bio-cannons, and the Mega Powder Blaster Extinguisher. Dads love our exploding sports balls — soccer, rugby, AFL, basketball, golf — for high-impact reveal moments. Mums tend to prefer the pink/blue balloon boxes for elegant indoor reveals, or smoke bomb 4-packs for outdoor photo shoots. Every product ships 1-2 days from our Gold Coast warehouse, with free express shipping on orders over $150.` }] },

    { type:'heading', level:2, children:[{ type:'text', value:`Melbourne Delivery Coverage` }] },
    { type:'paragraph', children:[{ type:'text', value:`We deliver to every Melbourne suburb — Melbourne CBD, Fitzroy, Richmond, St Kilda, South Yarra, Carlton, Brunswick, Brighton, Doncaster, Camberwell, Frankston, Footscray, Geelong, Ringwood — plus all surrounding townships across Victoria. CBD orders arrive in 1-2 days, outer suburbs receive next-business-day delivery on most products.` }] },
    { type:'paragraph', children:[{ type:'text', value:`Every order is discreetly packaged so guests can't spoil the surprise. Signature-on-delivery and SMS tracking included so you know exactly when your kit arrives.` }] },

    { type:'heading', level:2, children:[{ type:'text', value:`Melbourne Gender Reveal FAQs` }] },
    { type:'paragraph', children:[{ type:'text', value:`How fast is delivery to Melbourne? Most orders arrive 1-2 days via express courier from our Gold Coast warehouse. We dispatch within 24 hours of payment.` }] },
    { type:'paragraph', children:[{ type:'text', value:`Are gender reveal smoke bombs legal in Victoria? Yes — our smoke bombs are fully compliant with Australian and Victorian safety standards. Biodegradable, non-toxic, and safe for outdoor use. Always check your specific venue's rules before lighting.` }] },
    { type:'paragraph', children:[{ type:'text', value:`Can I do a tyre burnout gender reveal in Melbourne? Burnouts on public roads are illegal across Victoria. We recommend our Mega Burnout Powder for use only on private property. Speak to your local council about permits for any public event.` }] },
    { type:'paragraph', children:[{ type:'text', value:`What's the best gender reveal idea for an indoor Melbourne party? For indoor reveals we recommend our balloon box (no smoke, no mess) or prank confetti cannons. Both work brilliantly in homes, function rooms and venues across Melbourne.` }] },
    { type:'paragraph', children:[{ type:'text', value:`Do you deliver to all of Melbourne including outer suburbs? Yes — every suburb across Victoria, including outer, regional and rural areas. Delivery is 1-2 days regardless of suburb.` }] },

    { type:'heading', level:2, children:[{ type:'text', value:`What Melbourne Customers Say` }] },
    { type:'paragraph', children:[{ type:'text', value:`"Best gender reveal I've ever seen — my family loved it!" — Sarah K, Fitzroy. "Fast delivery, products arrived perfect, smoke bombs lit on first try." — Jess M, Richmond. "We did our reveal at Royal Botanic Gardens and the photos are incredible. Highly recommend." — Marco T, St Kilda. Over 1,360 verified reviews from Australian families.` }] },

    { type:'heading', level:2, children:[{ type:'text', value:`Why Choose Gender Reveal Ideas` }] },
    { type:'paragraph', children:[{ type:'text', value:`(1) Australia's largest range — over 300 unique products in stock. (2) Fast delivery to Melbourne — 1-2 days via express courier, free over $150. (3) 4.85★ rating from 1,360+ reviews. (4) 100% eco-friendly biodegradable products safe for parks, beaches and venues. (5) Australian family-owned business based on the Gold Coast — proudly supporting families since 2020. (6) Same-day dispatch on orders received before 2pm AEST. (7) Discreet packaging so guests can't spoil the surprise.` }] },

    { type:'paragraph', children:[{ type:'text', value:`Ready to plan your Melbourne gender reveal? Browse our complete range below — every product ships 1-2 days. Free shipping on orders over $150.` }] },
  ],
}

const newText = JSON.stringify(newRichText)
const newMentions = (newText.match(/Melbourne/g)||[]).length
console.log(`New rich text: ${newText.length} chars, ${newMentions} "Melbourne" mentions`)
console.log(`Reduction: ${currentMentions} → ${newMentions} (${Math.round((currentMentions-newMentions)/currentMentions*100)}% lower)`)

if (DRY_RUN) {
  console.log(`\nDRY RUN — no changes saved. Re-run with --ship.`)
  writeFileSync(`${SNAPSHOT_DIR}/preview-new.json`, JSON.stringify(newRichText,null,2))
  console.log(`Preview saved to ${SNAPSHOT_DIR}/preview-new.json`)
  process.exit(0)
}

// 5. SHIP
const setQ = `mutation($metafields:[MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields){ metafields{id} userErrors{ field message } } }`
const u = await gql(setQ, { metafields:[{ ownerId: col.id, namespace:'custom', key:'looking_to_buy_location_text', type:'rich_text_field', value: newText }] })
const errs = u.data?.metafieldsSet?.userErrors || []
if (errs.length) { console.error('SHIP FAILED:', errs); process.exit(1) }
console.log(`\n✓ Melbourne rich text updated. Mentions: ${currentMentions} → ${newMentions}`)
console.log(`Snapshot: ${SNAPSHOT_DIR}/before.json`)
console.log(`Rollback: node scripts/melbourne-density-fix.js --rollback`)
console.log(`\nNext: open GSC and request re-indexing of /collections/gender-reveal-ideas-melbourne`)
process.exit(0)
