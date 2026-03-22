import { env } from './env.js'

export function shopifyPolicy() {
  return {
    storeDomain: env.shopify.storeDomain,
    liveThemeId: String(env.shopify.liveThemeId || ''),
    previewThemeId: String(env.shopify.previewThemeId || ''),
    mode: 'preview-only',
    publishAllowed: false,
    writeTargetThemeId: String(env.shopify.previewThemeId || ''),
  }
}

export function assertPreviewWriteAllowed(themeId) {
  const policy = shopifyPolicy()
  if (!policy.writeTargetThemeId) {
    throw new Error('No Shopify preview theme configured')
  }
  if (String(themeId) !== String(policy.writeTargetThemeId)) {
    throw new Error(`Writes are restricted to preview theme ${policy.writeTargetThemeId}`)
  }
  return policy
}
