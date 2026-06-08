/**
 * Full audit of 3 confetti cannon products: single, 2-pack, 4-pack
 * Plus check if we appear in paid search for "confetti cannon" queries
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

const TARGETS = [
  { handle: 'gender-reveal-confetti-cannons',            label: 'SINGLE Confetti Cannon' },
  { handle: 'gender-reveal-confetti-cannons-australia',  label: '2-PACK Confetti Cannon' },
  { handle: 'gender-reveal-confetti-cannon-australia',   label: '4-PACK Confetti Cannon BIO' },
]

console.log(`\n=== CONFETTI CANNON FULL AUDIT — 3 products + paid search ===\n`)

// PART 1: Product detail audit
console.log('━━━ PART 1: Product page state ━━━')
const productData = []
for (const T of TARGETS) {
  const r = await gql(`{
    productByHandle(handle:"${T.handle}") {
      id title handle status descriptionHtml vendor productType tags
      seo { title description }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
      descTag: metafield(namespace:"global", key:"description_tag") { value }
      images(first: 5) { edges { node { url altText } } }
      variants(first: 10) { edges { node { id title price } } }
      collections(first: 10) { edges { node { handle title } } }
    }
  }`)
  const p = r.data?.productByHandle
  productData.push({ ...T, ...p })

  console.log(`\n[${T.label}] /${T.handle}`)
  if (!p) { console.log('  ✗ NOT FOUND'); continue }
  console.log(`  status:           ${p.status}`)
  console.log(`  product.title:    ${p.title}`)
  console.log(`  seo.title:        ${p.seo?.title || '(none)'}`)
  console.log(`  title_tag MF:     ${p.titleTag?.value || '(none)'}`)
  console.log(`  seo.description:  ${p.seo?.description?.slice(0,90) || '(none)'}`)
  console.log(`  desc_tag MF:      ${p.descTag?.value?.slice(0,90) || '(none)'}`)
  const bodyText = (p.descriptionHtml||'').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim()
  console.log(`  body words:       ${bodyText.split(/\s+/).filter(w=>w.length>2).length}`)
  console.log(`  body preview:     "${bodyText.slice(0,140)}..."`)
  console.log(`  variants:         ${p.variants?.edges?.length||0}`)
  console.log(`  images:           ${p.images?.edges?.length||0}  alt-text on first: "${p.images?.edges?.[0]?.node?.altText?.slice(0,60)||'(EMPTY)'}"`)
  console.log(`  collections:      ${p.collections?.edges?.map(e=>e.node.handle).join(', ')}`)
}

// Live page fetch — check rendered title + schema
console.log('\n━━━ Live page check ━━━')
for (const T of TARGETS) {
  const liveURL = `https://genderrevealideas.com.au/products/${T.handle}`
  try {
    const r = await fetch(liveURL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const html = await r.text()
    const title = (html.match(/<title>([^<]+)<\/title>/i)||[])[1]
    const metaDesc = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)||[])[1]
    const wc = html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(w=>w.length>2).length
    const schemas = (html.match(/application\/ld\+json/g)||[]).length
    const hasProductSchema = /\"@type\"\s*:\s*\"Product\"/.test(html)
    const hasFAQ = /FAQPage/.test(html)
    console.log(`\n[${T.label}]`)
    console.log(`  <title>:        ${title?.slice(0,90)}`)
    console.log(`  <meta desc>:    ${metaDesc?.slice(0,120) || '(none)'}`)
    console.log(`  Page words:     ${wc}`)
    console.log(`  JSON-LD count:  ${schemas}  (Product: ${hasProductSchema?'✓':'✗'}, FAQ: ${hasFAQ?'✓':'✗'})`)
  } catch(e) { console.log(`  fetch error: ${e.message}`) }
}

// PART 2: Paid search appearance for "confetti cannon" queries
console.log('\n\n━━━ PART 2: Paid search appearance for confetti cannon queries (last 30d) ━━━\n')
const c = getGadsCustomer()

// Search terms triggering YOUR ads that contain "confetti" or "cannon"
const st = await c.query(`
  SELECT campaign.name, search_term_view.search_term,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date DURING LAST_30_DAYS
    AND metrics.impressions > 0
`)
const filtered = st.filter(r => {
  const term = (r.search_term_view?.search_term||'').toLowerCase()
  return /confetti\s*cannon/i.test(term)
})

console.log(`Total search terms with "confetti cannon" triggering your Search ads: ${filtered.length}\n`)
if (filtered.length) {
  console.log('Campaign | Term | Imp | Clk | Spend | Conv | Rev')
  for (const r of filtered.sort((a,b)=>Number(b.metrics?.impressions||0)-Number(a.metrics?.impressions||0))) {
    console.log(`  [${r.campaign?.name?.slice(0,25).padEnd(25)}] "${r.search_term_view?.search_term?.slice(0,40).padEnd(40)}" imp:${String(Number(r.metrics?.impressions||0)).padStart(4)} clk:${Number(r.metrics?.clicks||0)} spend:$${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(0)} conv:${Number(r.metrics?.conversions||0).toFixed(1)} rev:$${Number(r.metrics?.conversions_value||0).toFixed(0)}`)
  }
}

// PMAX search-term insight for the same
console.log('\n--- PMAX search-term insight for confetti cannon (last 30d) ---')
try {
  const pmax = await c.query(`
    SELECT campaign.name, campaign_search_term_insight.category_label,
           metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM campaign_search_term_insight
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
  `)
  const pmaxFilt = pmax.filter(r => {
    const lbl = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
    return /confetti\s*cannon/i.test(lbl)
  })
  console.log(`PMAX category labels matching "confetti cannon": ${pmaxFilt.length}`)
  for (const r of pmaxFilt.sort((a,b)=>Number(b.metrics?.impressions||0)-Number(a.metrics?.impressions||0)).slice(0,15)) {
    console.log(`  [${r.campaign?.name?.slice(0,25).padEnd(25)}] "${r.campaign_search_term_insight?.category_label?.slice(0,40).padEnd(40)}" imp:${String(Number(r.metrics?.impressions||0)).padStart(5)} clk:${Number(r.metrics?.clicks||0)} conv:${Number(r.metrics?.conversions||0).toFixed(1)} rev:$${Number(r.metrics?.conversions_value||0).toFixed(0)}`)
  }
} catch(e) { console.log('  PMAX err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// Check Cannons campaign positive keywords — is "confetti cannon" already a keyword?
console.log('\n--- Cannons campaign — positive keywords containing "confetti cannon" ---')
const kw = await c.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.negative = FALSE
`)
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
const confettiKw = kw.filter(r => /confetti\s*cannon/i.test(r.ad_group_criterion?.keyword?.text||''))
console.log(`Confetti cannon positive keywords in Cannons campaign: ${confettiKw.length}`)
for (const r of confettiKw) {
  console.log(`  [${MT[r.ad_group_criterion?.keyword?.match_type]||'?'}] "${r.ad_group_criterion?.keyword?.text}" status:${r.ad_group_criterion?.status}`)
}

// Save
mkdirSync('data/snapshots/confetti-cannon-full', { recursive: true })
writeFileSync('data/snapshots/confetti-cannon-full/audit.json', JSON.stringify({
  productData,
  paidSearchTerms: filtered,
  cannonsCampaignConfettiKeywords: confettiKw,
}, null, 2))
console.log(`\nFull data: data/snapshots/confetti-cannon-full/audit.json`)
process.exit(0)
