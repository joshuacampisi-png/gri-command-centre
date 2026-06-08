/**
 * v3: Fix infinite loop. Use String.replace(regex_without_g, fn) — naturally first-occurrence.
 * Skip matches inside existing <a>...</a> by post-checking position.
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

const BASE = 'https://genderrevealideas.com.au'
const HANDLES = {
  diy: 'diy-gender-reveal-australia-18-ideas',
  photoshoot: 'gender-reveal-photoshoot-australia-guide',
  vsShower: 'gender-reveal-vs-baby-shower-australian-guide',
  whatIs: 'what-is-a-gender-reveal-party-australian-guide',
  perth: 'gender-reveal-perth-ultimate-guide-2026',
}

// Walk all matches via global regex, pick first one not inside an <a> or tag attribute.
function linkifyFirst(html, baseRegex, url) {
  // Force-global copy so exec advances lastIndex properly
  const flags = baseRegex.flags.includes('g') ? baseRegex.flags : baseRegex.flags + 'g'
  const re = new RegExp(baseRegex.source, flags)
  let m
  while ((m = re.exec(html)) !== null) {
    const before = html.slice(0, m.index)
    const lastOpen = before.lastIndexOf('<a ')
    const lastClose = before.lastIndexOf('</a>')
    if (lastOpen > lastClose) continue // inside an <a> tag
    const lastTagOpen = before.lastIndexOf('<')
    const lastTagClose = before.lastIndexOf('>')
    if (lastTagOpen > lastTagClose) continue // inside a tag attribute
    const linked = `<a href="${url}">${m[0]}</a>`
    return { html: html.slice(0, m.index) + linked + html.slice(m.index + m[0].length), replaced: true }
  }
  return { html, replaced: false }
}

const BLOGS = [
  {
    id: 566587752537, name: 'DIY',
    rules: [
      [/powder cannons?/i,                       `${BASE}/products/gender-reveal-cannons`],
      [/Mega Blaster Powder Extinguisher/i,      `${BASE}/products/gender-reveal-extinguisher-australia`],
      [/TNT Self Hire/i,                          `${BASE}/products/tnt-gender-reveal-australia`],
      [/Bio Cannons/i,                            `${BASE}/products/gender-reveal-cannons`],
      [/burn-away cake topper/i,                  `${BASE}/products/gender-reveal-burn-away-topper`],
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`],
      [/gender reveal vs baby shower/i,           `${BASE}/blogs/news/${HANDLES.vsShower}`],
      [/photo[- ]?shoot guide/i,                  `${BASE}/blogs/news/${HANDLES.photoshoot}`],
      [/first-time parents/i,                     `${BASE}/blogs/news/${HANDLES.whatIs}`],
    ],
  },
  {
    id: 566587785305, name: 'Photoshoot',
    rules: [
      [/Mega Blaster/i,                           `${BASE}/products/gender-reveal-extinguisher-australia`],
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`],
      [/TNT Self Hire/i,                          `${BASE}/products/tnt-gender-reveal-australia`],
      [/Bio Cannons/i,                            `${BASE}/products/gender-reveal-cannons`],
      [/Kings Park/i,                             `https://www.bgpa.wa.gov.au`],
      [/DIY gender reveal/i,                      `${BASE}/blogs/news/${HANDLES.diy}`],
      [/Perth (gender reveal|families)/i,         `${BASE}/blogs/news/${HANDLES.perth}`],
      [/baby shower/i,                            `${BASE}/blogs/news/${HANDLES.vsShower}`],
    ],
  },
  {
    id: 566587818073, name: 'vs Baby Shower',
    rules: [
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`],
      [/powder cannons?/i,                        `${BASE}/products/gender-reveal-cannons`],
      [/Oh Baby/i,                                `${BASE}/products/oh-baby-cake-topper`],
      [/burn-away topper/i,                       `${BASE}/products/gender-reveal-burn-away-topper`],
      [/(ABS|Australian Bureau of Statistics)/i,  `https://www.abs.gov.au/statistics/people/population/births-australia/latest-release`],
      [/DIY gender reveal/i,                      `${BASE}/blogs/news/${HANDLES.diy}`],
      [/photoshoot/i,                             `${BASE}/blogs/news/${HANDLES.photoshoot}`],
      [/what a gender reveal/i,                   `${BASE}/blogs/news/${HANDLES.whatIs}`],
    ],
  },
  {
    id: 566587850841, name: 'What Is',
    rules: [
      [/powder cannons?/i,                        `${BASE}/products/gender-reveal-cannons`],
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`],
      [/Mega Blaster/i,                           `${BASE}/products/gender-reveal-extinguisher-australia`],
      [/TNT Self Hire/i,                          `${BASE}/products/tnt-gender-reveal-australia`],
      [/Bio Cannons/i,                            `${BASE}/products/gender-reveal-cannons`],
      [/ABS/,                                     `https://www.abs.gov.au/statistics/people/population/births-australia/latest-release`],
      [/Jenna Karvunidis/i,                       `https://en.wikipedia.org/wiki/Gender_reveal_party`],
      [/DIY gender reveal/i,                      `${BASE}/blogs/news/${HANDLES.diy}`],
      [/photoshoot/i,                             `${BASE}/blogs/news/${HANDLES.photoshoot}`],
      [/baby shower/i,                            `${BASE}/blogs/news/${HANDLES.vsShower}`],
    ],
  },
]

console.log(`\n=== ADD INTERNAL/EXTERNAL LINKS v3 ===\n`)

for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  let body = cur.article.body_html
  const beforeLinks = (body.match(/<a /g) || []).length

  let applied = 0, missed = 0
  for (const [regex, url] of B.rules) {
    const { html, replaced } = linkifyFirst(body, regex, url)
    if (replaced) { body = html; applied++ }
    else missed++
  }

  const afterLinks = (body.match(/<a /g) || []).length
  console.log(`${B.name}: ${beforeLinks} → ${afterLinks} links (+${afterLinks-beforeLinks}). Applied ${applied}/${B.rules.length}, missed ${missed}.`)

  const upd = await rest(`/blogs/${blog.id}/articles/${B.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: B.id, body_html: body }})
  })
  if (upd.errors) console.log(`  ✗ Save failed: ${JSON.stringify(upd.errors)}`)
}

console.log(`\n=== FINAL VERIFY ===`)
for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  const body = cur.article.body_html
  const productLinks = (body.match(/href="https:\/\/genderrevealideas\.com\.au\/products\//g) || []).length
  const blogLinks = (body.match(/href="https:\/\/genderrevealideas\.com\.au\/blogs\//g) || []).length
  const collectionLinks = (body.match(/href="https:\/\/genderrevealideas\.com\.au\/collections\//g) || []).length
  const externalLinks = (body.match(/href="https?:\/\/(?!genderrevealideas)[^"]+"/g) || []).length
  console.log(`${B.name.padEnd(20)} | products: ${productLinks} | blogs: ${blogLinks} | collections: ${collectionLinks} | external: ${externalLinks}`)
}
process.exit(0)
