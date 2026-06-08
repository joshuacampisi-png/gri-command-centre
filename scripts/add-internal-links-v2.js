/**
 * v2: Use case-insensitive regex on actual common terms that appear in the body
 * First-occurrence-only via JS replace (not replaceAll)
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

// Helper: replace first occurrence of a regex-matched term but ONLY if it's not already inside an <a> tag
// Strategy: find all matches, pick first one NOT inside <a href>, and wrap.
function linkifyFirst(html, regex, urlOrFn) {
  let result = ''
  let i = 0
  let replaced = false
  while (i < html.length) {
    if (replaced) { result += html.slice(i); break }
    regex.lastIndex = i
    const m = regex.exec(html)
    if (!m) { result += html.slice(i); break }
    // Check if inside an <a> tag — look backwards for last '<a ' or '</a>'
    const beforeMatch = html.slice(0, m.index)
    const lastOpen = beforeMatch.lastIndexOf('<a ')
    const lastClose = beforeMatch.lastIndexOf('</a>')
    const insideA = lastOpen > lastClose
    // Also skip if inside an attribute (e.g. alt="...")
    const lastTagOpen = beforeMatch.lastIndexOf('<')
    const lastTagClose = beforeMatch.lastIndexOf('>')
    const insideTag = lastTagOpen > lastTagClose
    if (insideA || insideTag) {
      // skip past this match
      result += html.slice(i, m.index + m[0].length)
      i = m.index + m[0].length
      continue
    }
    // Build link
    const url = typeof urlOrFn === 'function' ? urlOrFn(m) : urlOrFn
    const linked = `<a href="${url}">${m[0]}</a>`
    result += html.slice(i, m.index) + linked
    i = m.index + m[0].length
    replaced = true
  }
  return { html: result, replaced }
}

// Per-blog link rules (regex, url, label)
const BLOGS = [
  {
    id: 566587752537, name: 'DIY',
    rules: [
      [/powder cannons?/i,                       `${BASE}/products/gender-reveal-cannons`,                          'powder cannon'],
      [/Mega Blaster Powder Extinguisher/i,      `${BASE}/products/gender-reveal-extinguisher-australia`,           'Mega Blaster'],
      [/TNT Self Hire/i,                          `${BASE}/products/tnt-gender-reveal-australia`,                    'TNT Self Hire'],
      [/Bio Cannons/i,                            `${BASE}/products/gender-reveal-cannons`,                          'Bio Cannons'],
      [/burn-away cake topper/i,                  `${BASE}/products/gender-reveal-burn-away-topper`,                 'burn-away topper'],
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`,                      'smoke bombs'],
      // Cross-blog
      [/gender reveal vs baby shower/i,           `${BASE}/blogs/news/${HANDLES.vsShower}`,                          'vs baby shower guide'],
      [/photo[- ]?shoot guide/i,                  `${BASE}/blogs/news/${HANDLES.photoshoot}`,                        'photoshoot guide'],
      [/first-time parents/i,                     `${BASE}/blogs/news/${HANDLES.whatIs}`,                            'first-time parents'],
    ],
  },
  {
    id: 566587785305, name: 'Photoshoot',
    rules: [
      [/Mega Blaster/i,                           `${BASE}/products/gender-reveal-extinguisher-australia`,           'Mega Blaster'],
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`,                      'smoke bombs'],
      [/TNT Self Hire/i,                          `${BASE}/products/tnt-gender-reveal-australia`,                    'TNT Self Hire'],
      [/Bio Cannons/i,                            `${BASE}/products/gender-reveal-cannons`,                          'Bio Cannons'],
      [/Kings Park/i,                             `https://www.bgpa.wa.gov.au`,                                     'Kings Park (BGPA)'],
      // Cross-blog
      [/DIY gender reveal/i,                      `${BASE}/blogs/news/${HANDLES.diy}`,                               'DIY guide'],
      [/Perth (gender reveal|families)/i,         `${BASE}/blogs/news/${HANDLES.perth}`,                             'Perth guide'],
      [/baby shower/i,                            `${BASE}/blogs/news/${HANDLES.vsShower}`,                          'baby shower comparison'],
    ],
  },
  {
    id: 566587818073, name: 'vs Baby Shower',
    rules: [
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`,                      'smoke bombs'],
      [/powder cannons?/i,                        `${BASE}/products/gender-reveal-cannons`,                          'cannons'],
      [/Oh Baby/i,                                `${BASE}/products/oh-baby-cake-topper`,                            'Oh Baby topper'],
      [/burn-away topper/i,                       `${BASE}/products/gender-reveal-burn-away-topper`,                 'burn-away topper'],
      [/(ABS|Australian Bureau of Statistics)/i,  `https://www.abs.gov.au/statistics/people/population/births-australia/latest-release`, 'ABS'],
      // Cross-blog
      [/DIY gender reveal/i,                      `${BASE}/blogs/news/${HANDLES.diy}`,                               'DIY'],
      [/photoshoot/i,                             `${BASE}/blogs/news/${HANDLES.photoshoot}`,                        'photoshoot guide'],
      [/what a gender reveal/i,                   `${BASE}/blogs/news/${HANDLES.whatIs}`,                            'what is a gender reveal'],
    ],
  },
  {
    id: 566587850841, name: 'What Is',
    rules: [
      [/powder cannons?/i,                        `${BASE}/products/gender-reveal-cannons`,                          'powder cannon'],
      [/smoke bombs/i,                            `${BASE}/products/gender-reveal-smoke-bombs`,                      'smoke bombs'],
      [/Mega Blaster/i,                           `${BASE}/products/gender-reveal-extinguisher-australia`,           'Mega Blaster'],
      [/TNT Self Hire/i,                          `${BASE}/products/tnt-gender-reveal-australia`,                    'TNT'],
      [/Bio Cannons/i,                            `${BASE}/products/gender-reveal-cannons`,                          'Bio Cannons'],
      [/ABS/,                                     `https://www.abs.gov.au/statistics/people/population/births-australia/latest-release`, 'ABS'],
      [/Jenna Karvunidis/i,                       `https://en.wikipedia.org/wiki/Gender_reveal_party`,               'Jenna Karvunidis (Wikipedia)'],
      // Cross-blog
      [/DIY gender reveal/i,                      `${BASE}/blogs/news/${HANDLES.diy}`,                               'DIY ideas'],
      [/photoshoot/i,                             `${BASE}/blogs/news/${HANDLES.photoshoot}`,                        'photoshoot guide'],
      [/baby shower/i,                            `${BASE}/blogs/news/${HANDLES.vsShower}`,                          'baby shower comparison'],
    ],
  },
]

console.log(`\n=== ADD INTERNAL/EXTERNAL LINKS v2 ===\n`)

for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  let body = cur.article.body_html
  const beforeLinks = (body.match(/<a /g) || []).length

  let applied = 0, missed = 0
  for (const [regex, url, label] of B.rules) {
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
  if (upd.errors) console.log(`  ✗ Save failed`)
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
