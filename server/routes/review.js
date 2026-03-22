import { Router } from 'express'
import { buildReviewUrls } from '../lib/review-urls.js'
import { shopifyPolicy } from '../lib/shopify-policy.js'
import { captureReviewSet } from '../lib/review-capture.js'

const router = Router()

router.get('/urls', (req, res) => {
  const pathname = req.query.path || '/'
  res.json({ ok: true, path: pathname, urls: buildReviewUrls(pathname), policy: shopifyPolicy() })
})

router.post('/capture', async (req, res) => {
  try {
    const pathname = req.body?.path || '/'
    const result = await captureReviewSet(pathname)
    res.json({ ok: true, ...result, policy: shopifyPolicy() })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

export default router
