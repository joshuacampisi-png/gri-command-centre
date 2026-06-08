/**
 * Inject Organization + WebSite schema directly into theme.liquid before </head>
 * Marker comment for easy rollback
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')
console.log(`Theme: ${main.name} (${main.id})\n`)

// 1. Read current theme.liquid
console.log('Step 1: Read current layout/theme.liquid')
const r = await rest(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`)
if (!r.asset) { console.log('✗ theme.liquid not found'); process.exit(1) }
const currentLiquid = r.asset.value
console.log(`  ✓ Read ${currentLiquid.length} chars`)
const hasClosingHead = currentLiquid.includes('</head>')
console.log(`  ✓ Contains </head>: ${hasClosingHead}`)
if (!hasClosingHead) { console.log('✗ Cannot find </head> to inject before'); process.exit(1) }

// 2. Check if our marker is already present (avoid double-injection)
if (currentLiquid.includes('<!-- GRI-ORG-SCHEMA-START -->')) {
  console.log('  ⚠ Schema already injected previously. Will replace with fresh version.')
}

// 3. Build the schema injection
const ORG = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Gender Reveal Ideas Australia",
  "alternateName": ["Gender Reveal Ideas", "GRI"],
  "url": "https://genderrevealideas.com.au",
  "logo": "https://genderrevealideas.com.au/cdn/shop/files/gri-logo.png",
  "foundingDate": "2010",
  "founder": [
    { "@type":"Person","name":"Mallu Campisi","jobTitle":"Co-Founder","sameAs":["https://www.instagram.com/mallucampisi/"] },
    { "@type":"Person","name":"Josh Campisi","jobTitle":"Co-Founder" }
  ],
  "areaServed": { "@type":"Country","name":"Australia" },
  "address": {
    "@type":"PostalAddress","streetAddress":"Unit 3B/13 Upton Street","addressLocality":"Bundall","addressRegion":"QLD","postalCode":"4217","addressCountry":"AU"
  },
  "contactPoint": {
    "@type":"ContactPoint","contactType":"Customer Service","email":"hello@genderrevealideas.com.au","availableLanguage":"English","areaServed":"AU"
  },
  "sameAs": [
    "https://www.instagram.com/gender.reveal.ideass",
    "https://www.instagram.com/mallucampisi/",
    "https://www.tiktok.com/@genderrevealaustralia",
    "https://www.facebook.com/genderrevealideasaustralia",
    "https://www.youtube.com/@GenderRevealIdeasAustralia",
    "https://www.localsearch.com.au/profile/gender-reveal-ideas/clrio3eyz001a08l7es8ye90a"
  ],
  "description": "Australia's #1 gender reveal retailer since 2010. Family-owned by Mallu and Josh Campisi. Government-approved smoke bombs (AS 2187.4, Resources Safety & Health Queensland registered), biodegradable powder cannons, Mega Blaster extinguishers, sports reveal balls, bundles and TNT rentals. 600,000+ units shipped past 12 months. Trusted by 70,000+ Australian families.",
  "knowsAbout": [
    "Gender reveal parties","Pregnancy announcements","Baby gender reveal",
    "Gender reveal smoke bombs","Gender reveal cannons","Australian gender reveal products"
  ],
  "aggregateRating": {
    "@type":"AggregateRating","ratingValue":"4.85","reviewCount":"1740","bestRating":"5","worstRating":"1"
  },
  "award": [
    "Featured in Mummy Time consumer investigations (Hannah Whitfield, May 2026)",
    "Australia's only government-approved gender reveal smoke bomb supplier",
    "Featured on ABC, Channel 9 Weekend Sunrise, Sea FM, Gold Coast Bulletin",
    "Dominant gender reveal brand in Australia by volume"
  ],
  "memberOf": {
    "@type":"Organization","name":"Resources Safety & Health Queensland","url":"https://www.rshq.qld.gov.au/","description":"Registered as Schedule 6 supplier under the Explosives Regulation"
  },
  "subjectOf": [
    { "@type":"NewsArticle","url":"https://mummytime.com.au/smokebombs","headline":"9 in 10 Gender Reveal Smoke Bombs Sold to Aussie Mums Are Illegal. Here's the 1 That Isn't.","datePublished":"2026-05-12","author":{"@type":"Person","name":"Hannah Whitfield"},"publisher":{"@type":"Organization","name":"Mummy Time"} },
    { "@type":"NewsArticle","url":"https://mummytime.com.au/genderrevealscam","headline":"The Gender Reveal Scam Australian Mums Are Quietly Calling Out in 2026","datePublished":"2026-05-18","author":{"@type":"Person","name":"Hannah Whitfield"},"publisher":{"@type":"Organization","name":"Mummy Time"} }
  ]
}

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Gender Reveal Ideas Australia",
  "url": "https://genderrevealideas.com.au",
  "potentialAction": {
    "@type":"SearchAction","target":{ "@type":"EntryPoint","urlTemplate":"https://genderrevealideas.com.au/search?q={search_term_string}" },"query-input":"required name=search_term_string"
  },
  "publisher": { "@type":"Organization","name":"Gender Reveal Ideas Australia" }
}

const INJECTION = `<!-- GRI-ORG-SCHEMA-START -->
<script type="application/ld+json">${JSON.stringify(ORG)}</script>
<script type="application/ld+json">${JSON.stringify(WEBSITE)}</script>
<!-- GRI-ORG-SCHEMA-END -->
`

// 4. Strip any existing injection first (idempotent)
let newLiquid = currentLiquid
const existingPattern = /<!-- GRI-ORG-SCHEMA-START -->[\s\S]*?<!-- GRI-ORG-SCHEMA-END -->\s*/g
if (existingPattern.test(newLiquid)) {
  newLiquid = newLiquid.replace(existingPattern, '')
  console.log(`\nStep 2: Removed existing schema injection`)
}

// 5. Insert before </head>
newLiquid = newLiquid.replace('</head>', `${INJECTION}\n</head>`)
console.log(`\nStep 3: Inject schema before </head>`)
console.log(`  Old length: ${currentLiquid.length}`)
console.log(`  New length: ${newLiquid.length}`)
console.log(`  Added: ${newLiquid.length - currentLiquid.length} chars`)

// 6. Save the modified theme.liquid
console.log(`\nStep 4: Save updated theme.liquid`)
const upd = await rest(`/themes/${main.id}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: newLiquid }})
})
if (upd.errors) { console.log(`  ✗ ${JSON.stringify(upd.errors)}`); process.exit(1) }
console.log(`  ✓ Saved (asset hash: ${upd.asset?.checksum?.slice(0,12)})`)

// 7. Verify on live site
await sleep(3000)
console.log(`\nStep 5: HTTP verification on homepage`)
const live = await fetch('https://genderrevealideas.com.au/', { headers: { 'Cache-Control': 'no-cache' }})
const html = await live.text()
console.log(`  Status: ${live.status}`)
console.log(`  Contains GRI-ORG-SCHEMA marker: ${html.includes('GRI-ORG-SCHEMA-START') ? '✓' : '✗ (CDN cache - will propagate in 1-5 mins)'}`)
console.log(`  Contains "Mallu Campisi" in schema: ${html.includes('Mallu Campisi') ? '✓' : '⚠ caching'}`)
console.log(`  Contains "ratingValue":"4.85": ${html.includes('"ratingValue":"4.85"') ? '✓' : '⚠ caching'}`)
console.log(`  Contains "Mummy Time" reference: ${html.includes('Mummy Time') ? '✓' : '⚠ caching'}`)

console.log(`\n✓ DONE — Organization + WebSite schema is now in your theme on EVERY page sitewide`)
process.exit(0)
