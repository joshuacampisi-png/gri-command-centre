import { Router } from 'express'
import { getShopifySnapshot } from '../connectors/shopify.js'
import { inspectPreviewTheme, getThemeAsset, listThemeAssets, previewThemeWorkpack, updateThemeAsset } from '../lib/shopify-dev.js'
import { shopifyPolicy } from '../lib/shopify-policy.js'

const router = Router()

router.get('/policy', (_req, res) => {
  res.json({ ok: true, policy: shopifyPolicy() })
})

router.get('/status', async (_req, res) => {
  const snapshot = await getShopifySnapshot()
  res.json({ ok: true, connected: snapshot.connected, error: snapshot.error || null, policy: shopifyPolicy(), store: snapshot.shop || null, themes: snapshot.themes || [] })
})

router.get('/target-theme', async (_req, res) => {
  const snapshot = await getShopifySnapshot()
  const policy = shopifyPolicy()
  const themes = snapshot.themes || []
  const previewTheme = themes.find(theme => String(theme.id) === String(policy.previewThemeId)) || null
  const liveTheme = themes.find(theme => String(theme.id) === String(policy.liveThemeId)) || null
  res.json({ ok: true, policy, previewTheme, liveTheme })
})

router.get('/inspect', async (_req, res) => {
  try {
    res.json({ ok: true, ...(await inspectPreviewTheme()) })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.get('/assets', async (req, res) => {
  try {
    const assets = await listThemeAssets(req.query.themeId)
    res.json({ ok: true, count: assets.length, assets })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.get('/asset', async (req, res) => {
  try {
    const asset = await getThemeAsset(req.query.themeId, req.query.key)
    res.json({ ok: true, asset, code: asset?.value || asset?.attachment || '' })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/workpack', async (req, res) => {
  try {
    res.json({ ok: true, ...(await previewThemeWorkpack(req.body || {})) })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/asset', async (req, res) => {
  try {
    const result = await updateThemeAsset(req.body?.themeId, req.body?.key, req.body?.value)
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

export default router
