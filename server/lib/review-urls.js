import { env } from './env.js'
import { shopifyPolicy } from './shopify-policy.js'

export function liveHomepageUrl() {
  return `https://${env.shopify.storeDomain}`
}

export function previewHomepageUrl() {
  const policy = shopifyPolicy()
  if (!policy.previewThemeId) return ''
  return `https://${env.shopify.storeDomain}?preview_theme_id=${policy.previewThemeId}`
}

export function buildReviewUrls(pathname = '/') {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const live = new URL(liveHomepageUrl())
  live.pathname = cleanPath
  const preview = new URL(previewHomepageUrl() || liveHomepageUrl())
  preview.pathname = cleanPath
  return { live: live.toString(), preview: preview.toString() }
}
