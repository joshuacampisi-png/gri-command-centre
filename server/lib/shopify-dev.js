import { env } from './env.js'
import { assertPreviewWriteAllowed, shopifyPolicy } from './shopify-policy.js'
import { loadShopifyOAuthState } from './shopify-oauth-store.js'

function adminUrl(path = '') {
  return `https://${env.shopify.storeDomain}/admin/api/2025-01${path}`
}

async function getAccessToken() {
  // 1. Prefer the full-scope OAuth token stored after the install flow
  try {
    const state = await loadShopifyOAuthState()
    if (state.accessToken) {
      return state.accessToken
    }
  } catch {}

  // 2. Fallback to static token from .env
  return env.shopify.adminAccessToken
}

async function shopifyAdminFetch(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(adminUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!response.ok) {
    throw new Error(data?.errors ? JSON.stringify(data.errors) : data?.raw || `Shopify API error ${response.status}`)
  }
  return data
}

// Export for diagnostics
export async function getTokenInfo() {
  const token = await getAccessToken()
  return { token: token?.slice(0,12)+'…', expiresAt: new Date(_tokenCache.expiresAt).toISOString(), cached: !!_tokenCache.token }
}

export async function listThemeAssets(themeId = env.shopify.previewThemeId) {
  const id = String(themeId || '')
  if (!id) throw new Error('No themeId provided')
  const data = await shopifyAdminFetch(`/themes/${id}/assets.json?fields=key,public_url,updated_at,content_type,size,theme_id`) 
  return data.assets || []
}

export async function getThemeAsset(themeId = env.shopify.previewThemeId, key) {
  const id = String(themeId || '')
  if (!id || !key) throw new Error('themeId and key are required')
  const encoded = encodeURIComponent(key)
  const data = await shopifyAdminFetch(`/themes/${id}/assets.json?asset[key]=${encoded}`)
  return data.asset || null
}

export async function inspectPreviewTheme() {
  const policy = shopifyPolicy()
  const assets = await listThemeAssets(policy.previewThemeId)
  const interesting = [
    'layout/theme.liquid',
    'templates/index.json',
    'templates/product.json',
    'templates/collection.json',
    'sections/header.liquid',
    'sections/footer-group.json',
    'sections/main-product.liquid'
  ]
  const existing = assets.filter(asset => interesting.includes(asset.key))
  return {
    policy,
    assetCount: assets.length,
    interestingAssets: existing,
  }
}

function groupAssets(assets = []) {
  const groups = { layout: [], templates: [], sections: [], snippets: [], config: [], assets: [], locales: [], other: [] }
  for (const asset of assets) {
    const key = asset.key || ''
    if (key.startsWith('layout/')) groups.layout.push(asset)
    else if (key.startsWith('templates/')) groups.templates.push(asset)
    else if (key.startsWith('sections/')) groups.sections.push(asset)
    else if (key.startsWith('snippets/')) groups.snippets.push(asset)
    else if (key.startsWith('config/')) groups.config.push(asset)
    else if (key.startsWith('assets/')) groups.assets.push(asset)
    else if (key.startsWith('locales/')) groups.locales.push(asset)
    else groups.other.push(asset)
  }
  return groups
}

export async function previewThemeWorkpack(task = {}) {
  const policy = shopifyPolicy()
  const assets = await listThemeAssets(policy.previewThemeId)
  const lower = `${task.title || ''} ${task.description || ''}`.toLowerCase()
  const suggestions = []
  if (lower.includes('banner')) suggestions.push('sections/slideshow.liquid', 'sections/image-banner.liquid', 'templates/index.json')
  if (lower.includes('product') || lower.includes('pdp')) suggestions.push('sections/main-product.liquid', 'templates/product.json', 'snippets/product-*.liquid')
  if (lower.includes('collection')) suggestions.push('templates/collection.json', 'sections/main-collection-product-grid.liquid')
  if (lower.includes('header') || lower.includes('menu')) suggestions.push('sections/header.liquid')
  if (lower.includes('footer')) suggestions.push('sections/footer-group.json', 'sections/footer.liquid')
  if (lower.includes('homepage') || lower.includes('home page') || lower.includes('landing page')) suggestions.push('templates/index.json', 'sections/*.liquid')

  return {
    policy,
    taskTitle: task.title || '',
    suggestedTargets: [...new Set(suggestions)],
    totalAssets: assets.length,
  }
}

export async function backupThemeAsset(themeId = env.shopify.previewThemeId, key) {
  assertPreviewWriteAllowed(themeId)
  const asset = await getThemeAsset(themeId, key)
  return {
    key,
    capturedAt: new Date().toISOString(),
    value: asset?.value || '',
    checksum: asset?.checksum || '',
    content_type: asset?.content_type || ''
  }
}

export async function updateThemeAsset(themeId = env.shopify.previewThemeId, key, value) {
  assertPreviewWriteAllowed(themeId)
  if (!key) throw new Error('Asset key is required')
  const backup = await backupThemeAsset(themeId, key)
  const data = await shopifyAdminFetch(`/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key, value } })
  })
  return { asset: data.asset || null, backup }
}

// Direct write to ANY theme (bypasses preview-only lock — for approved live pushes)
export async function writeThemeAssetDirect(themeId, key, value) {
  if (!themeId || !key) throw new Error('themeId and key are required')
  const data = await shopifyAdminFetch(`/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key, value } })
  })
  return { asset: data.asset || null }
}

export async function createRedirect(path, target) {
  if (!path || !target) throw new Error('path and target are required')
  // Check if redirect already exists
  const existing = await shopifyAdminFetch(`/redirects.json?path=${encodeURIComponent(path)}&limit=1`)
  if (existing.redirects?.length > 0) {
    return { redirect: existing.redirects[0], alreadyExisted: true }
  }
  const data = await shopifyAdminFetch('/redirects.json', {
    method: 'POST',
    body: JSON.stringify({ redirect: { path, target } })
  })
  return { redirect: data.redirect, alreadyExisted: false }
}

export async function listCollections() {
  const data = await shopifyAdminFetch('/collections.json?limit=50')
  return data.collections || []
}

// Get collection by handle (checks custom then smart)
export async function getCollectionByHandle(handle) {
  const custom = await shopifyAdminFetch(`/custom_collections.json?handle=${encodeURIComponent(handle)}&limit=1`)
  if (custom.custom_collections?.length) return { type: 'custom_collection', collection: custom.custom_collections[0] }
  const smart = await shopifyAdminFetch(`/smart_collections.json?handle=${encodeURIComponent(handle)}&limit=1`)
  if (smart.smart_collections?.length) return { type: 'smart_collection', collection: smart.smart_collections[0] }
  return null
}

// Set SEO meta description on a collection via metafield
export async function setCollectionMetaDescription(handle, description) {
  const result = await getCollectionByHandle(handle)
  if (!result) throw new Error(`Collection not found: ${handle}`)
  const { type, collection } = result
  const data = await shopifyAdminFetch(`/${type}s/${collection.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({
      [type]: {
        id: collection.id,
        metafields: [{
          key: 'description_tag',
          namespace: 'global',
          value: description,
          type: 'single_line_text_field'
        }]
      }
    })
  })
  return { id: collection.id, handle, description, updated: !!data[type] }
}

// Get page by handle
export async function getPageByHandle(handle) {
  const data = await shopifyAdminFetch(`/pages.json?handle=${encodeURIComponent(handle)}&limit=1`)
  return data.pages?.[0] || null
}

// Resolve a page handle with common fallbacks (faq → faqs, about → about-us, etc.)
async function resolvePageHandle(handle) {
  let page = await getPageByHandle(handle)
  if (page) return page
  if (!handle.endsWith('s')) {
    page = await getPageByHandle(handle + 's')
    if (page) return page
  }
  page = await getPageByHandle(handle + '-us')
  if (page) return page
  return null
}

// Set SEO meta description on a page
export async function setPageMetaDescription(handle, description) {
  const page = await resolvePageHandle(handle)
  if (!page) throw new Error(`Page not found: ${handle}`)
  const data = await shopifyAdminFetch(`/pages/${page.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ page: { id: page.id, metafields: [{ key: 'description_tag', namespace: 'global', value: description, type: 'single_line_text_field' }] } })
  })
  return { id: page.id, handle: page.handle, description, updated: !!data.page }
}

// Set page title (which renders as H1 in default Shopify page templates)
export async function setPageTitle(handle, newTitle) {
  const page = await resolvePageHandle(handle)
  if (!page) throw new Error(`Page not found: ${handle}`)
  const data = await shopifyAdminFetch(`/pages/${page.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ page: { id: page.id, title: newTitle } })
  })
  return { id: page.id, handle: page.handle, title: newTitle, updated: !!data.page }
}

// List all products (for alt text work)
export async function listProducts(limit = 50) {
  const data = await shopifyAdminFetch(`/products.json?limit=${limit}&fields=id,title,handle,images`)
  return data.products || []
}

// Update image alt text on a product
export async function setProductImageAltText(productId, imageId, altText) {
  const data = await shopifyAdminFetch(`/products/${productId}/images/${imageId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ image: { id: imageId, alt: altText } })
  })
  return { imageId, altText, updated: !!data.image }
}
