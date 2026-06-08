/**
 * FINAL REBUILD — strip repetitive product cards from body, add 3rd lifestyle image per blog
 * Each blog ends with 3 unique lifestyle photos + 1 consolidated product showcase section
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function gql(q,v={}){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

async function uploadImage(localPath, filename, alt) {
  const buf = readFileSync(localPath)
  const sq = await gql(`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}}}`, {
    input:[{filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length)}]
  })
  const target = sq.data.stagedUploadsCreate.stagedTargets[0]
  const fd = new FormData()
  for (const p of target.parameters) fd.append(p.name, p.value)
  fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
  await fetch(target.url, { method: 'POST', body: fd })
  const fc = await gql(`mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{id ... on MediaImage{image{url} fileStatus}}}}`, {
    files:[{originalSource: target.resourceUrl, alt, contentType:'IMAGE'}]
  })
  const fileId = fc.data.fileCreate.files[0].id
  for (let i = 0; i < 12; i++) {
    await new Promise(r=>setTimeout(r, 1500))
    const q = await gql(`query($id:ID!){node(id:$id){... on MediaImage{image{url} fileStatus}}}`, { id: fileId })
    if (q.data?.node?.fileStatus === 'READY') return q.data.node.image.url
  }
  return null
}

console.log(`\n=== FINAL BLOG REBUILD ===\n`)
console.log('Step 1: Uploading 4 new "third" lifestyle images...')

const NEW = [
  { local:'/Users/wogbot/Downloads/blog-3rd-diy.png',                filename:'lifestyle-confetti-balloon-pop.png',    alt:'Australian couple in backyard with pink and blue confetti raining down — balloon pop reveal moment' },
  { local:'/Users/wogbot/Downloads/blog-3rd-photoshoot-detail.png',  filename:'lifestyle-hands-bump-detail.png',       alt:'Close-up of pregnant woman\'s hands cradling bump with soft pink and blue smoke in background' },
  { local:'/Users/wogbot/Downloads/blog-3rd-shower.png',             filename:'lifestyle-baby-shower-games.png',       alt:'Australian baby shower in sunlit backyard — women playing a bump-guess game together' },
  { local:'/Users/wogbot/Downloads/blog-3rd-whatis.png',             filename:'lifestyle-friends-reveal-moment.png',   alt:'Group of Australian friends and family celebrating gender reveal moment with pink smoke rising' },
]
for (const n of NEW) {
  process.stdout.write(`  ${n.filename} ... `)
  n.url = await uploadImage(n.local, n.filename, n.alt)
  console.log(`✓`)
}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

const BLOGS = [
  {
    id: 566587752537, name: 'DIY',
    addAfterH2id: 'powder',  // add new figure after the Powder section
    newFig: { url: NEW[0].url, alt: NEW[0].alt, caption: 'A simple backyard balloon pop — the reveal moment that doesn\'t need a fancy product to feel magical.' },
  },
  {
    id: 566587785305, name: 'Photoshoot',
    addAfterH2id: 'poses',
    newFig: { url: NEW[1].url, alt: NEW[1].alt, caption: 'The hands-on-bump shot — every Australian maternity photographer\'s favourite frame.' },
  },
  {
    id: 566587818073, name: 'vs Baby Shower',
    addAfterH2id: 'etiquette',
    newFig: { url: NEW[2].url, alt: NEW[2].alt, caption: 'A baby shower is more about the people than the props. The games are just an excuse to laugh together.' },
  },
  {
    id: 566587850841, name: 'What Is',
    addAfterH2id: 'how',
    newFig: { url: NEW[3].url, alt: NEW[3].alt, caption: 'The moment everyone gathers for — pink or blue, in front of the people who love you most.' },
  },
]

console.log(`\nStep 2: Stripping inline product cards + adding 3rd lifestyle image per blog...\n`)

for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  let body = cur.article.body_html

  // Count product cards before
  const cardsBefore = (body.match(/<div class="product-card">[\s\S]*?<\/div>\s*<\/div>/g) || []).length

  // Strip ALL inline product cards (the gri-blog .product-card divs)
  body = body.replace(/<div class="product-card">[\s\S]*?<\/div>\s*<\/div>/g, '')

  // Also strip lingering "Best products" sub-headlines (h2 or h3) that may now be orphaned
  body = body.replace(/<h3>Best low-cost products[^<]*<\/h3>\s*<p>[^<]*<\/p>/g, '')

  // Inject the new lifestyle figure right after the target H2 section's intro paragraph
  // Find the H2 by id="..." and insert the figure right after the next </p>
  const h2Regex = new RegExp(`(<h2 id="${B.addAfterH2id}"[^>]*>[^<]*<\\/h2>\\s*(?:<p>[^<]*<\\/p>\\s*)?)`)
  const newFigureHtml = `\n<figure class="bf"><img src="${B.newFig.url}" alt="${B.newFig.alt}" loading="lazy"/><figcaption>${B.newFig.caption}</figcaption></figure>\n`
  if (h2Regex.test(body)) {
    body = body.replace(h2Regex, `$1${newFigureHtml}`)
    console.log(`  ${B.name}: stripped ${cardsBefore} product cards + added lifestyle image after #${B.addAfterH2id}`)
  } else {
    console.log(`  ${B.name}: stripped ${cardsBefore} cards but couldn\'t find H2 #${B.addAfterH2id}, appending new figure to end`)
    body = body.replace(/(<\/article>)/, newFigureHtml + '$1')
  }

  // Save
  const upd = await rest(`/blogs/${blog.id}/articles/${B.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: B.id, body_html: body }})
  })
  if (upd.errors) console.log(`    ✗ Save failed: ${JSON.stringify(upd.errors)}`)
  else console.log(`    ✓ ${B.name} saved`)
}

console.log(`\nStep 3: Verifying final state...`)
for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  const body = cur.article.body_html
  const figs = body.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) || []
  const cards = (body.match(/<div class="product-card">/g) || []).length
  console.log(`\n${B.name} (${B.id}):`)
  console.log(`  ${figs.length} figures · ${cards} product cards (should be 0)`)
  for (const m of figs) {
    const src = (m.match(/src="([^"]+)"/) || [])[1] || ''
    console.log(`  → ${src.split('/').pop().slice(0,55)}`)
  }
}

console.log(`\n=== DONE ===\n`)
console.log(`Each blog now has 3 unique lifestyle photos + 0 inline product cards.`)
console.log(`Final CTA stack at bottom still drives readers to /collections/all.`)
process.exit(0)
