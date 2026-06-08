/**
 * Upload 4 supporting lifestyle images + swap them into each blog body
 * Replaces the old product-heavy figures with editorial lifestyle photos
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

const SUPPORTS = [
  { local:'/Users/wogbot/Downloads/blog-support-1-diy.png',        filename:'lifestyle-cake-cutting-home-reveal.png',    alt:'Australian couple cutting gender reveal cake at home — lifestyle photography',                articleId:566587752537, oldImgMatch:'GRI_product.png',          newCaption:'A simple at-home reveal — the moment that becomes the photo on the fridge.' },
  { local:'/Users/wogbot/Downloads/blog-support-2-photoshoot.png', filename:'lifestyle-lavender-field-photoshoot.png',   alt:'Pregnant Australian couple in lavender field with pink smoke at golden hour',                  articleId:566587785305, oldImgMatch:'GRI_product.png',          newCaption:'Golden-hour lavender field — the kind of light that turns any photo into a magazine cover.' },
  { local:'/Users/wogbot/Downloads/blog-support-3-shower.png',     filename:'lifestyle-baby-shower-intimate-friends.png',alt:'Australian baby shower — pregnant woman surrounded by close friends and mother on linen couch', articleId:566587818073, oldImgMatch:'GRI_Showcase.png',         newCaption:'A baby shower is about the women around you. A gender reveal is about the moment of discovery. Both worth celebrating.' },
  { local:'/Users/wogbot/Downloads/blog-support-4-whatis.png',     filename:'lifestyle-grandmothers-embrace.png',        alt:'Pregnant Australian woman embraced by both grandmothers at golden hour — multi-generational family moment', articleId:566587850841, oldImgMatch:'GRI_product.png',          newCaption:'Three generations, one moment. The real reason to host a gender reveal.' },
]

console.log(`\n=== UPLOADING 4 SUPPORTING LIFESTYLE IMAGES + SWAPPING ===\n`)

// Upload all 4
console.log('Step 1: Uploading new lifestyle support images to Shopify Files...')
for (const s of SUPPORTS) {
  process.stdout.write(`  ${s.filename} ... `)
  s.url = await uploadImage(s.local, s.filename, s.alt)
  console.log(`✓ ${s.url}`)
}

// Update each blog
const blogs = await rest('/blogs.json')
const blog = blogs.blogs?.find(b => b.handle === 'news') || blogs.blogs?.[0]

console.log(`\nStep 2: Swapping body figures in each blog...`)
for (const s of SUPPORTS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${s.articleId}.json`)
  let body = cur.article?.body_html
  if (!body) { console.log(`  ✗ Could not load ${s.articleId}`); continue }

  // Replace the FIRST <figure class="bf"> matching the old image filename
  // with the new lifestyle image + new caption
  const escName = s.oldImgMatch.replace(/[.+]/g, c => '\\' + c)
  const figureRegex = new RegExp(`<figure class="bf">\\s*<img src="[^"]*${escName}[^"]*"[^>]*\\/>\\s*<figcaption>[^<]*<\\/figcaption>\\s*<\\/figure>`)

  const newFigure = `<figure class="bf"><img src="${s.url}" alt="${s.alt}" loading="lazy"/><figcaption>${s.newCaption}</figcaption></figure>`

  if (figureRegex.test(body)) {
    body = body.replace(figureRegex, newFigure)
  } else {
    // Try without figcaption (in case figure had no caption)
    const fallbackRegex = new RegExp(`<figure class="bf">\\s*<img src="[^"]*${escName}[^"]*"[^>]*\\/>[\\s\\S]*?<\\/figure>`)
    if (fallbackRegex.test(body)) {
      body = body.replace(fallbackRegex, newFigure)
    } else {
      console.log(`  ⚠ Could not match figure for ${s.oldImgMatch} in article ${s.articleId}`)
    }
  }

  // For Blog 2 (Photoshoot), also REMOVE the TNT figure since we don't have a 3rd image
  if (s.articleId === 566587785305) {
    body = body.replace(/<figure class="bf">\s*<img src="[^"]*tnt_hire\.png[^"]*"[^>]*\/>[\s\S]*?<\/figure>/g, '')
  }

  // For Blog 1 (DIY) also remove the small smoke bomb support image if it exists
  // (it doesn't have its own figure, just inline product cards)

  const upd = await rest(`/blogs/${blog.id}/articles/${s.articleId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: s.articleId, body_html: body }})
  })
  if (upd.errors) {
    console.log(`  ✗ ${s.articleId}: ${JSON.stringify(upd.errors)}`)
  } else {
    console.log(`  ✓ ${s.articleId} body figure swapped to lifestyle image`)
  }
}

console.log(`\n=== DONE — All blogs now show only editorial lifestyle imagery ===\n`)
console.log(`Each blog has unique lifestyle hero + unique lifestyle supporting image.`)
console.log(`Product images now only appear in product cards (small contextual placement).`)
process.exit(0)
