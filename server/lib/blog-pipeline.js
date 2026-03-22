/**
 * Blog Pipeline — Orchestrates rank drop → article generation → Shopify draft
 *
 * Rules:
 * - Crawls existing GRI blog posts to capture brand tone & style
 * - Always includes "Gender Reveal Ideas" brand name prominently
 * - Always includes "gender reveal" as an anchor phrase even if the dropped keyword is different
 * - Publishes as DRAFT to Shopify blogs section (/blogs/news)
 * - Logs task in drops queue for dashboard approval
 */

import { generateBlogArticle } from './blog-generator.js'
import { publishDraftArticle } from './shopify-blog-publisher.js'
import { updateDrop, loadDrops, saveDrops } from './rank-drop-detector.js'

const STORE_DOMAIN = 'https://genderrevealideas.com.au'
const EXISTING_BLOGS_TO_SAMPLE = [
  '/blogs/news',
  '/blogs/news/gender-reveal-ideas',
  '/blogs/news/how-to-do-a-gender-reveal',
]

// ── Crawl existing blogs for tone/style ───────────────────────────────────

let cachedBrandVoice = null

export async function getBrandVoice() {
  if (cachedBrandVoice) return cachedBrandVoice

  const samples = []
  for (const path of EXISTING_BLOGS_TO_SAMPLE) {
    try {
      const res = await fetch(`${STORE_DOMAIN}${path}`, {
        headers: { 'User-Agent': 'PabloEscobot-SEO/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const html = await res.text()

      // Extract text content from article/main tags
      const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      const mainMatch    = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
      const raw = (articleMatch?.[1] || mainMatch?.[1] || html)
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1500)

      if (raw.length > 200) samples.push(raw)
    } catch { /* skip failed pages */ }
  }

  if (samples.length === 0) {
    cachedBrandVoice = 'Exciting, celebratory, Australian. Direct and helpful. Short paragraphs. Focus on making moments magical and memorable. Always mention fast Australian shipping and quality products.'
    return cachedBrandVoice
  }

  cachedBrandVoice = samples.join('\n\n---\n\n').slice(0, 3000)
  console.log(`[Blog Pipeline] Brand voice sampled from ${samples.length} existing blog posts`)
  return cachedBrandVoice
}

// ── Generate + queue articles for detected drops ──────────────────────────

export async function generateAndQueueArticles(drops) {
  console.log(`[Blog Pipeline] Processing ${drops.length} rank drop(s)...`)

  // Get brand voice once (shared across all articles)
  const brandVoice = await getBrandVoice()

  for (const drop of drops) {
    try {
      // Mark as generating
      updateDrop(drop.id, { status: 'generating', startedAt: new Date().toISOString() })

      console.log(`[Blog Pipeline] Generating article for: "${drop.keyword}" (dropped ${drop.drop} positions)`)

      // Generate article with brand context
      const article = await generateBlogArticle(drop, brandVoice)

      // Publish to Shopify as DRAFT
      let shopifyResult = null
      try {
        shopifyResult = await publishDraftArticle(article, drop)
        console.log(`[Blog Pipeline] Draft published to Shopify: ${shopifyResult.adminUrl}`)
      } catch (shopifyErr) {
        console.error(`[Blog Pipeline] Shopify publish failed: ${shopifyErr.message}`)
        // Continue — save article locally even if Shopify fails
      }

      updateDrop(drop.id, {
        status:    shopifyResult ? 'draft' : 'generated',
        article,
        shopify:   shopifyResult,
        completedAt: new Date().toISOString(),
      })

    } catch (e) {
      console.error(`[Blog Pipeline] Article generation failed for "${drop.keyword}": ${e.message}`)
      updateDrop(drop.id, { status: 'failed', error: e.message })
    }
  }

  console.log(`[Blog Pipeline] Done processing ${drops.length} drops`)
}

// ── Manual trigger — generate article for a specific drop ─────────────────

export async function regenerateArticle(dropId) {
  const drops = loadDrops()
  const drop = drops.find(d => d.id === dropId)
  if (!drop) throw new Error(`Drop not found: ${dropId}`)

  updateDrop(dropId, { status: 'generating', startedAt: new Date().toISOString(), error: null })
  const brandVoice = await getBrandVoice()
  const article = await generateBlogArticle(drop, brandVoice)

  let shopifyResult = null
  try {
    shopifyResult = await publishDraftArticle(article, drop)
  } catch (e) {
    console.error(`[Blog Pipeline] Shopify publish failed on regen: ${e.message}`)
  }

  updateDrop(dropId, {
    status:      shopifyResult ? 'draft' : 'generated',
    article,
    shopify:     shopifyResult,
    completedAt: new Date().toISOString(),
    error:       null,
  })

  return { article, shopify: shopifyResult }
}
