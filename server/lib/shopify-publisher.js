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

// ── Step 3: Upload featured image via staged upload ──────────

async function uploadFeaturedImage(domain, token, imageUrl) {
  if (!imageUrl) return null

  console.log(`[ShopifyPublisher] Uploading featured image: ${imageUrl.slice(0, 80)}...`)

  // Step 3a: Create staged upload target
  const stagedMutation = `
    mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const stagedRes = await fetch(gqlEndpoint(domain), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: stagedMutation,
      variables: {
        input: [{
          resource: 'IMAGE',
          filename: `blog-featured-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          httpMethod: 'PUT',
        }],
      },
    }),
  })

  const stagedData = await stagedRes.json()
  const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0]
  if (!target) {
    console.warn('[ShopifyPublisher] Failed to create staged upload target')
    return null
  }

  // Step 3b: Download the image from fal.ai URL
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
  if (!imgRes.ok) {
    console.warn(`[ShopifyPublisher] Failed to download image: ${imgRes.status}`)
    return null
  }
  const imgBuffer = await imgRes.arrayBuffer()

  // Step 3c: Upload to Shopify's staged URL
  const uploadUrl = target.url
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: imgBuffer,
  })

  if (!uploadRes.ok) {
    console.warn(`[ShopifyPublisher] Staged upload failed: ${uploadRes.status}`)
    return null
  }

  // Step 3d: Create the file in Shopify
  const fileCreateMutation = `
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const fileRes = await fetch(gqlEndpoint(domain), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: fileCreateMutation,
      variables: {
        files: [{
          originalSource: target.resourceUrl,
          contentType: 'IMAGE',
        }],
      },
    }),
  })

  const fileData = await fileRes.json()
  const file = fileData.data?.fileCreate?.files?.[0]
  if (!file) {
    console.warn('[ShopifyPublisher] fileCreate failed:', fileData.data?.fileCreate?.userErrors)
    return null
  }

  console.log(`[ShopifyPublisher] File created: ${file.id}`)

  // Step 3e: Poll until file is READY (max 30s)
  const fileId = file.id
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000))

    const pollQuery = `
      query FileStatus($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            id
            fileStatus
            image {
              url
            }
          }
        }
      }
    `

    const pollRes = await fetch(gqlEndpoint(domain), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: pollQuery, variables: { id: fileId } }),
    })

    const pollData = await pollRes.json()
    const status = pollData.data?.node?.fileStatus
    const imageNodeUrl = pollData.data?.node?.image?.url

    if (status === 'READY' && imageNodeUrl) {
      console.log(`[ShopifyPublisher] Featured image READY: ${imageNodeUrl.slice(0, 80)}...`)
      return { fileId, imageUrl: imageNodeUrl }
    }

    if (status === 'FAILED') {
      console.warn('[ShopifyPublisher] File processing FAILED')
      return null
    }
  }

  console.warn('[ShopifyPublisher] File processing timed out')
  return null
}

// ── Step 4: Set featured image on article ──────────────────────

async function setArticleFeaturedImage(domain, token, articleGlobalId, imageUrl) {
  const mutation = `
    mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article {
          id
          image {
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const res = await fetch(gqlEndpoint(domain), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: mutation,
      variables: {
        id: articleGlobalId,
        article: {
          image: {
            src: imageUrl,
          },
        },
      },
    }),
  })

  const data = await res.json()
  const errors = data.data?.articleUpdate?.userErrors || []
  if (errors.length) {
    console.warn('[ShopifyPublisher] Set featured image warnings:', errors.map(e => e.message).join(', '))
    return false
  }

  console.log(`[ShopifyPublisher] ✅ Featured image set on article`)
  return true
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

  // Step 3+4: Upload and set featured image (if provided)
  if (payload.featuredImageUrl) {
    try {
      const uploaded = await uploadFeaturedImage(domain, token, payload.featuredImageUrl)
      if (uploaded) {
        await setArticleFeaturedImage(domain, token, article.id, uploaded.imageUrl)
      }
    } catch (err) {
      console.warn(`[ShopifyPublisher] Featured image failed (non-fatal): ${err.message}`)
    }
  }

  return {
    shopifyId:   article.id,
    title:       article.title,
    handle:      article.handle,
    liveUrl:     article._liveUrl,
    publishedAt: article.publishedAt,
  }
}
