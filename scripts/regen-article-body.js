/**
 * One-shot: regenerate article body with the new blog-writer structure,
 * reuse the 4 existing fal.media image URLs as single <img> tags,
 * push the updated body to Shopify.
 *
 * Article: gid://shopify/Article/566281535577
 * Keyword: best gender reveal ideas 2026 (listicle)
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env'), override: true })

const { generateBlogArticle } = await import('../server/lib/blog-writer.js')

const ARTICLE_ID = 'gid://shopify/Article/566281535577'
const KEYWORD = 'gender reveal cannon'
const ARTICLE_TYPE = 'buying_guide'

// CSS block injected at the top of the article body so callouts render beautifully
// without requiring any theme changes. Uses GRI brand colours.
const CALLOUT_CSS = `<style>
.gri-author-block{color:#6b7280;font-size:0.9rem;margin:0 0 1.25rem 0;}
.gri-callout{border-radius:12px;padding:1.25rem 1.5rem;margin:1.75rem 0;border-left:5px solid #2dd4bf;background:#f0fdfa;}
.gri-callout-title{font-weight:700;font-size:1.05rem;margin:0 0 0.5rem 0;color:#0f766e;text-transform:uppercase;letter-spacing:0.03em;}
.gri-callout p{margin:0.5rem 0;line-height:1.6;}
.gri-callout ul{margin:0.5rem 0;padding-left:1.25rem;}
.gri-callout li{margin:0.4rem 0;line-height:1.55;}
.gri-callout--picks{background:#fef3f8;border-left-color:#ec4899;}
.gri-callout--picks .gri-callout-title{color:#be185d;}
.gri-callout--safe{background:#f0fdfa;border-left-color:#2dd4bf;}
.gri-callout--safe .gri-callout-title{color:#0f766e;}
.gri-callout--eco{background:#f0fdf4;border-left-color:#22c55e;}
.gri-callout--eco .gri-callout-title{color:#15803d;}
.gri-callout--tip{background:#fefce8;border-left-color:#eab308;}
.gri-callout--tip .gri-callout-title{color:#a16207;}
.gri-callout--stat{background:#eff6ff;border-left-color:#3b82f6;}
.gri-callout--stat .gri-callout-title{color:#1d4ed8;}
.gri-post-body table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:0.95rem;}
article table, .article-body table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:0.95rem;}
article table th, article table td, .article-body table th, .article-body table td{padding:0.75rem 1rem;border:1px solid #e5e7eb;text-align:left;vertical-align:top;}
article table thead, .article-body table thead{background:#0f766e;color:#fff;}
article table thead th, .article-body table thead th{color:#fff;font-weight:600;}
article table tbody tr:nth-child(even), .article-body table tbody tr:nth-child(even){background:#f9fafb;}
article hr, .article-body hr{border:0;border-top:1px solid #e5e7eb;margin:2rem 0;}
article h2, .article-body h2{margin-top:2rem;}
article h3, .article-body h3{margin-top:1.5rem;}
</style>
`

// Existing images already uploaded to fal.media, in order
// (hero, inline-1, inline-2, inline-3)
const EXISTING_IMAGES = [
  {
    url: 'https://v3b.fal.media/files/b/0a963603/0hy-5n40Fltn2EI69iicD_u942DiMU.jpg',
    alt: 'Australian couple celebrating gender reveal with pink powder explosion in backyard party setting',
  },
  {
    url: 'https://v3b.fal.media/files/b/0a963604/v4I0CWQHjTgZGTVgziGtC_W1vg7wKr.jpg',
    alt: 'Australian family using bio-cannon confetti cannons for gender reveal in park setting',
  },
  {
    url: 'https://v3b.fal.media/files/b/0a963600/GrEl-17N2hQzOCP4QA1vm_l2Iw05CM.jpg',
    alt: 'Elegant balloon box gender reveal setup in Australian backyard with decorative party styling',
  },
  {
    url: 'https://v3b.fal.media/files/b/0a9635f8/A8MS0eSpk2-AA1qbERdLn_0CbSB4bc.jpg',
    alt: 'Australian family group photo after successful gender reveal celebration with pink powder residue',
  },
]

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bdd19a-3.myshopify.com'
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN
if (!SHOPIFY_TOKEN) {
  console.error('Missing SHOPIFY_ADMIN_TOKEN in env (.env file)')
  process.exit(1)
}

async function main() {
  console.log(`Regenerating article body for keyword: "${KEYWORD}"`)
  const article = await generateBlogArticle(KEYWORD, { articleType: ARTICLE_TYPE })

  console.log(`Generated: "${article.title}" — ${article.wordCount} words, SEO ${article.checklistScore}/${article.checklistTotal}`)

  let body = article.body_html

  // Find IMAGE_DESKTOP tags in order of appearance and replace with real <img>
  const desktopRegex = /\[IMAGE_DESKTOP:[^\]]*\]/g
  const mobileRegex = /\[IMAGE_MOBILE:[^\]]*\]/g

  const desktopMatches = body.match(desktopRegex) || []
  console.log(`Found ${desktopMatches.length} IMAGE_DESKTOP tags`)

  // Replace each IMAGE_DESKTOP in order with the corresponding existing image
  let idx = 0
  body = body.replace(desktopRegex, (match) => {
    const img = EXISTING_IMAGES[idx % EXISTING_IMAGES.length]
    const isHero = idx === 0
    const loading = isHero ? 'eager' : 'lazy'
    const fetchPriority = isHero ? ' fetchpriority="high"' : ''
    idx++
    const alt = img.alt.replace(/"/g, '&quot;')
    return `<img src="${img.url}" alt="${alt}" width="1200" height="675" loading="${loading}"${fetchPriority} style="width:100%;height:auto;border-radius:8px;margin:1rem 0;">`
  })

  // Strip ALL IMAGE_MOBILE tags (Josh wants single img per placement)
  body = body.replace(mobileRegex, '')

  // Collapse any resulting double blank lines
  body = body.replace(/\n{3,}/g, '\n\n')

  // Prepend callout CSS so styles render in Shopify without theme changes
  body = CALLOUT_CSS + body

  console.log(`Body after image injection: ${body.length} chars, ${(body.match(/<img /g) || []).length} <img>, ${(body.match(/gri-callout/g) || []).length} callouts, ${(body.match(/<table/g) || []).length} tables, ${(body.match(/<hr/g) || []).length} <hr>, ${body.includes('Short Answer') ? 'HAS' : 'MISSING'} Short Answer, ${body.includes('FAQPage') ? 'HAS' : 'MISSING'} FAQPage schema`)

  // Push to Shopify
  const mutation = `
    mutation articleUpdate($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id title handle image { url altText } }
        userErrors { field message code }
      }
    }
  `

  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        id: ARTICLE_ID,
        article: {
          title: article.title,
          handle: article.handle || undefined,
          body,
          summary: article.excerpt || undefined,
          image: {
            url: EXISTING_IMAGES[0].url,
            altText: EXISTING_IMAGES[0].alt,
          },
        },
      },
    }),
  })

  const json = await res.json()
  console.log(JSON.stringify(json, null, 2))

  if (json.data?.articleUpdate?.userErrors?.length > 0) {
    console.error('Shopify errors:', json.data.articleUpdate.userErrors)
    process.exit(1)
  }
  console.log('✅ Article updated successfully')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
