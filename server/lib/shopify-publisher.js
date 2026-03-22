/**
 * Shopify Blog Publisher
 * ─────────────────────────────────────────────────────────────
 * Publishes generated articles to Shopify via GraphQL Admin API.
 * Two-step: articleCreate then metafieldsSet for SEO tags.
 * ─────────────────────────────────────────────────────────────
 */

import { env } from './env.js'

function getShopifyConfig() {
  const domain = env.shopify?.storeDomain || process.env.SHOPIFY_STORE_DOMAIN || ''
  const token  = env.shopify?.adminAccessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ''
  const blogId = process.env.SHOPIFY_BLOG_ID || ''
  return { domain, token, blogId }
}

export function hasShopifyPublishConfig() {
  const { domain, token, blogId } = getShopifyConfig()
  return Boolean(domain && token && blogId)
}

const GQL_VERSION = '2026-01'

function gqlEndpoint(domain) {
  return `https://${domain}/admin/api/${GQL_VERSION}/graphql.json`
}

// ── Sanitise body HTML before sending to Shopify ──────────────

export function sanitiseBodyHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .trim()
}

// ── Step 1: Create article ─────────────────────────────────────

async function createArticle(domain, token, blogId, payload) {
  const mutation = `
    mutation CreateArticle($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article {
          id
          title
          handle
          publishedAt
          blog {
            handle
          }
        }
        userErrors {
          code
          field
          message
        }
      }
    }
  `

  const variables = {
    article: {
      blogId:      `gid://shopify/Blog/${blogId}`,
      title:       payload.title,
      handle:      payload.handle,
      body:        sanitiseBodyHtml(payload.body_html),
      summary:     payload.summary_html,
      author:      { name: payload.author || 'Gender Reveal Ideas Team' },
      tags:        payload.tags || [],
      isPublished: true,
    },
  }

  const res = await fetch(gqlEndpoint(domain), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: mutation, variables }),
  })

  const data = await res.json()

  if (data.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`)
  }

  const userErrors = data.data?.articleCreate?.userErrors || []
  if (userErrors.length) {
    throw new Error(`Shopify article create failed: ${userErrors.map(e => e.message).join(', ')}`)
  }

  return data.data.articleCreate.article
}

// ── Step 2: Set SEO metafields ─────────────────────────────────

async function setArticleSEOMetafields(domain, token, articleGlobalId, seoTitle, seoDesc) {
  const mutation = `
    mutation SetSEOMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `

  const variables = {
    metafields: [
      {
        ownerId:   articleGlobalId,
        namespace: 'global',
        key:       'title_tag',
        value:     seoTitle,
        type:      'single_line_text_field',
      },
      {
        ownerId:   articleGlobalId,
        namespace: 'global',
        key:       'description_tag',
        value:     seoDesc,
        type:      'single_line_text_field',
      },
    ],
  }

  const res = await fetch(gqlEndpoint(domain), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: mutation, variables }),
  })

  const data = await res.json()

  const userErrors = data.data?.metafieldsSet?.userErrors || []
  if (userErrors.length) {
    console.warn('[ShopifyPublisher] SEO metafield warnings:', userErrors.map(e => e.message).join(', '))
  }
}

// ── Main publish function ──────────────────────────────────────

export async function publishToShopify(payload) {
  const { domain, token, blogId } = getShopifyConfig()

  if (!domain || !token || !blogId) {
    throw new Error('Shopify publish config incomplete. Ensure SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, and SHOPIFY_BLOG_ID are set in .env')
  }

  console.log(`[ShopifyPublisher] Publishing "${payload.title}" to ${domain}...`)

  // Step 1: Create article (published immediately)
  const article = await createArticle(domain, token, blogId, payload)

  // Construct live URL from blog handle + article handle
  const blogHandle = article.blog?.handle || 'news'
  const customDomain = 'genderrevealideas.com.au'
  const liveUrl = `https://${customDomain}/blogs/${blogHandle}/${article.handle}`
  article._liveUrl = liveUrl

  console.log(`[ShopifyPublisher] ✅ Article created: ${article.handle} — ${liveUrl}`)

  // Step 2: Set SEO metafields
  if (payload.seo_title || payload.seo_description) {
    await setArticleSEOMetafields(
      domain,
      token,
      article.id,
      payload.seo_title  || payload.title,
      payload.seo_description || '',
    )
    console.log(`[ShopifyPublisher] ✅ SEO metafields set`)
  }

  return {
    shopifyId:   article.id,
    title:       article.title,
    handle:      article.handle,      // use returned handle (may differ if conflict)
    liveUrl:     article._liveUrl,    // constructed from blog + article handle
    publishedAt: article.publishedAt,
  }
}
