/**
 * Shopify Blog Publisher
 * Publishes generated articles to the GRI Shopify blog as drafts.
 * Requires approval before going live.
 */

import { env } from './env.js'

const STORE_DOMAIN  = env.shopify.storeDomain || process.env.SHOPIFY_STORE_DOMAIN
const ACCESS_TOKEN  = env.shopify.adminAccessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const API_VERSION   = '2024-10'
const BLOG_HANDLE   = process.env.SHOPIFY_BLOG_HANDLE || 'news' // Shopify blog handle

function shopifyFetch(endpoint, method = 'GET', body = null) {
  const url = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}${endpoint}`
  const opts = {
    method,
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  }
  if (body) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async r => {
    const data = await r.json()
    if (!r.ok) throw new Error(`Shopify API ${r.status}: ${JSON.stringify(data.errors || data)}`)
    return data
  })
}

// ── Get or create the blog ─────────────────────────────────────────────────

let cachedBlogId = null

export async function getBlogId() {
  if (cachedBlogId) return cachedBlogId

  const data = await shopifyFetch('/blogs.json')
  const blogs = data.blogs || []

  // Find by handle
  let blog = blogs.find(b => b.handle === BLOG_HANDLE)

  // If no matching blog, use first one or create
  if (!blog && blogs.length > 0) blog = blogs[0]

  if (!blog) {
    // Create a new blog
    const created = await shopifyFetch('/blogs.json', 'POST', {
      blog: { title: 'Gender Reveal Tips & Ideas', handle: BLOG_HANDLE }
    })
    blog = created.blog
    console.log(`[Blog Publisher] Created new Shopify blog: "${blog.title}"`)
  }

  cachedBlogId = blog.id
  console.log(`[Blog Publisher] Using blog: "${blog.title}" (ID: ${blog.id})`)
  return blog.id
}

// ── Create draft article ───────────────────────────────────────────────────

export async function publishDraftArticle(article, drop) {
  if (!STORE_DOMAIN || !ACCESS_TOKEN) {
    throw new Error('Shopify credentials not configured (SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN)')
  }

  const blogId = await getBlogId()

  const articlePayload = {
    article: {
      title:          article.title,
      body_html:      article.bodyHtml,
      handle:         article.slug || slugify(article.title),
      summary_html:   `<p>${article.metaDescription}</p>`,
      tags:           ['SEO', 'Auto-Generated', 'Rank Recovery', drop.keyword].join(', '),
      published:      false, // DRAFT — requires manual approval
      metafields: [
        {
          namespace:  'seo',
          key:        'title',
          value:      article.metaTitle,
          type:       'single_line_text_field',
        },
        {
          namespace:  'seo',
          key:        'description',
          value:      article.metaDescription,
          type:       'single_line_text_field',
        },
      ],
    }
  }

  const data = await shopifyFetch(`/blogs/${blogId}/articles.json`, 'POST', articlePayload)
  const created = data.article

  const draftUrl = `https://${STORE_DOMAIN}/blogs/${BLOG_HANDLE}/${created.handle}`
  const adminUrl = `https://${STORE_DOMAIN.replace('.myshopify.com', '')}.myshopify.com/admin/articles/${created.id}`

  console.log(`[Blog Publisher] Draft created: "${article.title}" → ${adminUrl}`)
  return {
    shopifyArticleId: created.id,
    blogId,
    handle:    created.handle,
    draftUrl,
    adminUrl,
    title:     created.title,
    createdAt: created.created_at,
  }
}

// ── Publish (make live) ────────────────────────────────────────────────────

export async function publishArticle(shopifyArticleId, blogId) {
  const data = await shopifyFetch(`/blogs/${blogId}/articles/${shopifyArticleId}.json`, 'PUT', {
    article: { id: shopifyArticleId, published: true }
  })
  return data.article
}

// ── Delete article (reject) ────────────────────────────────────────────────

export async function deleteArticle(shopifyArticleId, blogId) {
  await shopifyFetch(`/blogs/${blogId}/articles/${shopifyArticleId}.json`, 'DELETE')
  return { deleted: true }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
