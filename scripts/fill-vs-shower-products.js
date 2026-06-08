/**
 * Fill the empty "Products you actually need" section in the vs-baby-shower blog
 * with linked product mentions. This brings it to 2+ product links for SEO QA.
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const cur = await rest(`/blogs/${blog.id}/articles/566587818073.json`)
let body = cur.article.body_html

const BASE = 'https://genderrevealideas.com.au'

const REVEAL_LIST = `<ul>
  <li><a href="${BASE}/products/gender-reveal-cannons">Powder cannons</a> — the classic Aussie reveal moment, $35 each, biodegradable.</li>
  <li><a href="${BASE}/products/gender-reveal-extinguisher-australia">Mega Blaster Powder Extinguisher</a> — premium 30-second continuous spray for cinematic photo and video reveals.</li>
  <li><a href="${BASE}/products/gender-reveal-smoke-bombs">Smoke bombs</a> — perfect for outdoor reveals and photography.</li>
  <li><a href="${BASE}/products/tnt-gender-reveal-australia">TNT Self Hire detonator</a> — the wow-factor reveal for larger gatherings.</li>
</ul>`

const COMBO_LIST = `<ul>
  <li><a href="${BASE}/products/oh-baby-cake-topper">"Oh Baby" acrylic cake topper</a> — works for both events.</li>
  <li><a href="${BASE}/products/gender-reveal-burn-away-topper">Burn-away cake topper</a> — combines the cake-cutting tradition with a surprise reveal.</li>
  <li><a href="${BASE}/collections/gender-reveal-decorations">Gender reveal decorations</a> — balloons, banners and party styling.</li>
</ul>`

// Replace the two empty placeholders by inserting lists after the intro paragraphs.
body = body.replace(
  '<p>For a gender reveal:</p>',
  `<p>For a gender reveal:</p>\n${REVEAL_LIST}`
)
body = body.replace(
  '<p>For both a gender reveal AND a baby shower (decorations + cake):</p>',
  `<p>For both a gender reveal AND a baby shower (decorations + cake):</p>\n${COMBO_LIST}`
)

const upd = await rest(`/blogs/${blog.id}/articles/566587818073.json`, {
  method: 'PUT',
  body: JSON.stringify({ article: { id: 566587818073, body_html: body }})
})
if (upd.errors) { console.log('✗', JSON.stringify(upd.errors)); process.exit(1) }

const after = await rest(`/blogs/${blog.id}/articles/566587818073.json`)
const productLinks = (after.article.body_html.match(/href="https:\/\/genderrevealideas\.com\.au\/products\//g) || []).length
const collectionLinks = (after.article.body_html.match(/href="https:\/\/genderrevealideas\.com\.au\/collections\//g) || []).length
console.log(`✓ vs Baby Shower now has ${productLinks} product links + ${collectionLinks} collection links`)
process.exit(0)
