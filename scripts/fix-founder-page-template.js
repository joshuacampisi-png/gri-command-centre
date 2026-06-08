import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
console.log('Current state:')
console.log(`  template_suffix: ${hub.template_suffix || '(null/default)'}`)
console.log(`  body length: ${hub.body_html.length}`)

// Check what templates are available - look at theme files
console.log('\nFetching themes to inspect page templates...')
const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')
console.log(`Main theme: ${main.name} (id ${main.id})`)

// List all page-related templates
const assets = await rest(`/themes/${main.id}/assets.json`)
const pageTemplates = assets.assets.filter(a => /^templates\/page/.test(a.key))
console.log('\nAvailable page templates:')
pageTemplates.forEach(a => console.log(`  ${a.key}`))

// Look for what the default page template might be
console.log('\nLet me check what suffix the contact page uses (working page)...')
const contact = all.pages.find(p => p.handle === 'contact')
console.log(`  /pages/contact template_suffix: ${contact?.template_suffix || '(null)'}`)
const faqs = all.pages.find(p => p.handle === 'faqs')
console.log(`  /pages/faqs template_suffix: ${faqs?.template_suffix || '(null)'}`)
const shipping = all.pages.find(p => p.handle === 'shipping')
console.log(`  /pages/shipping template_suffix: ${shipping?.template_suffix || '(null)'}`)
const cannonsAU = all.pages.find(p => p.handle === 'gender-reveal-cannons-australia')
console.log(`  /pages/gender-reveal-cannons-australia template_suffix: ${cannonsAU?.template_suffix || '(null)'}`)
const cityPage = all.pages.find(p => p.handle === 'best-gender-reveal-ideas-sydney')
console.log(`  /pages/best-gender-reveal-ideas-sydney template_suffix: ${cityPage?.template_suffix || '(null)'}`)

process.exit(0)
