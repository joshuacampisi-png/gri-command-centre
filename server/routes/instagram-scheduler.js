/**
 * instagram-scheduler.js
 * CRUD routes for Instagram scheduled posts + AI caption generation + media upload.
 */
import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import multer from 'multer'
import { dataFile, dataDir } from '../lib/data-dir.js'
import { callClaude } from '../lib/claude-guard.js'
import { isInstagramConfigured, publishImage, publishCarousel, publishReel } from '../lib/instagram-publisher.js'

const router = Router()

const DATA_FILE = dataFile('instagram-posts.json')
const MEDIA_DIR = dataDir('instagram-media')

// ── Data helpers ────────────────────────────────────────────────────────────

function loadPosts() {
  if (!existsSync(DATA_FILE)) return []
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')) }
  catch { return [] }
}

function savePosts(posts) {
  writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2))
}

// ── Multer upload config ────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop().toLowerCase()
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
    }
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
    cb(null, allowed.includes(file.mimetype))
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB for Reels
})

// ── Routes ──────────────────────────────────────────────────────────────────

// Status check
router.get('/status', (_req, res) => {
  res.json({ configured: isInstagramConfigured() })
})

// List all posts
router.get('/entries', (req, res) => {
  let posts = loadPosts().filter(p => !p._archived)
  if (req.query.status) posts = posts.filter(p => p.status === req.query.status)
  res.json(posts)
})

// Create or update a post
router.post('/entries', (req, res) => {
  const post = req.body
  if (!post || !post.id) return res.status(400).json({ error: 'Missing post id' })

  const posts = loadPosts()
  const idx = posts.findIndex(p => p.id === post.id)

  // Defaults for new posts
  if (idx < 0) {
    post.status = post.status || 'DRAFT'
    post.attempts = 0
    post.igPostId = null
    post.igPermalink = null
    post.error = null
    post.publishedAt = null
    post.createdAt = post.createdAt || new Date().toISOString()
    posts.push(post)
  } else {
    // Update existing — preserve server-managed fields unless explicitly set
    const existing = posts[idx]
    posts[idx] = {
      ...existing,
      ...post,
      attempts: post.attempts ?? existing.attempts,
      igPostId: post.igPostId ?? existing.igPostId,
      igPermalink: post.igPermalink ?? existing.igPermalink,
    }
  }

  savePosts(posts)
  res.json({ ok: true, post: posts.find(p => p.id === post.id) })
})

// Delete a post (soft delete)
router.delete('/entries/:id', (req, res) => {
  const posts = loadPosts()
  const post = posts.find(p => p.id === req.params.id)
  if (!post) return res.json({ ok: true })
  post._archived = true
  post._archivedAt = new Date().toISOString()
  savePosts(posts)
  res.json({ ok: true })
})

// Publish a post immediately
router.post('/entries/:id/publish-now', async (req, res) => {
  if (!isInstagramConfigured()) {
    return res.status(400).json({ error: 'Instagram not configured. Set INSTAGRAM_BUSINESS_ACCOUNT_ID and META_PAGE_ACCESS_TOKEN in .env' })
  }

  const posts = loadPosts()
  const post = posts.find(p => p.id === req.params.id)
  if (!post) return res.status(404).json({ error: 'Post not found' })
  if (post.status === 'PUBLISHED') return res.status(400).json({ error: 'Already published' })

  post.status = 'PUBLISHING'
  savePosts(posts)

  try {
    const appUrl = process.env.APP_URL || process.env.RAILWAY_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`
    const fullUrls = (post.mediaUrls || []).map(u => u.startsWith('http') ? u : `${appUrl}${u}`)

    let result
    if (post.type === 'carousel') {
      result = await publishCarousel(fullUrls, post.caption || '')
    } else if (post.type === 'reel') {
      result = await publishReel(fullUrls[0], post.caption || '')
    } else {
      result = await publishImage(fullUrls[0], post.caption || '')
    }

    post.status = 'PUBLISHED'
    post.publishedAt = new Date().toISOString()
    post.igPostId = result.igPostId
    post.igPermalink = result.permalink
    post.error = null
    savePosts(posts)

    res.json({ ok: true, post })
  } catch (err) {
    post.status = 'FAILED'
    post.error = err.message
    post.attempts = (post.attempts || 0) + 1
    savePosts(posts)
    res.status(500).json({ error: err.message, post })
  }
})

// Upload media files (images or video)
router.post('/upload', upload.array('media', 10), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No valid media files' })
  const files = req.files.map(f => ({
    url: `/instagram-media/${f.filename}`,
    filename: f.filename,
    size: f.size,
    type: f.mimetype.startsWith('image/') ? 'image' : 'video',
    originalName: f.originalname,
  }))
  res.json({ ok: true, files })
})

// Delete a media file
router.delete('/media/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '')
  try { unlinkSync(join(MEDIA_DIR, filename)) } catch {}
  res.json({ ok: true })
})

// AI caption generation
router.post('/generate-caption', async (req, res) => {
  const { productContext, postType, mediaDescription, tone } = req.body

  const systemPrompt = `You are the social media copywriter for Gender Reveal Ideas (@gender.reveal.ideass), Australia's leading gender reveal party supplies brand based on the Gold Coast.

BRAND VOICE:
- Fun, excited, celebratory tone. Like a best friend who's thrilled about your gender reveal party.
- Australian English (colour, organised, favourite). Never American spelling.
- Family-friendly, inclusive. All families welcome.
- Casual but professional. Use emojis naturally, not excessively.
- Key phrases: "the big reveal", "boy or girl", "party time", "reveal moment"

PRODUCTS:
- Mega Blaster: White fire extinguisher-style powder cannon (blue/pink). 10m spray, 15 second blast. Non-toxic, biodegradable.
- Mini Blaster: Smaller powder spray with black twist-top.
- Bio-Cannon: Long pink/blue confetti tube cannon. Biodegradable confetti.
- Gender Reveal Basketball: Breaks open on impact releasing coloured powder.
- Smoke Bombs: Grey/silver canisters with pull-ring. Thick coloured smoke for dramatic reveals.

INSTAGRAM BEST PRACTICES:
- Hook in the first line (question, bold statement, or emoji opener)
- 3-5 short paragraphs with line breaks
- Strong CTA (shop link in bio, tag a friend, save for later)
- 15-25 hashtags at the end, mix of high-volume and niche
- Must include: #genderreveal #genderrevealideas #boyorgirl
- Good hashtags: #genderrevealparty #genderrevealaustralia #babyreveal #pregnancyannouncement #mumtobe #dadtobe #itsaboy #itsagirl #revealparty #babygender #genderrevealidea #australianbaby #goldcoast #partyideas

OUTPUT FORMAT:
Return exactly 3 caption variants as a JSON array. Each variant is an object with:
- "hook": the opening line (max 15 words)
- "body": the main caption text (2-4 short paragraphs separated by \\n\\n)
- "cta": call to action line
- "hashtags": string of 15-25 hashtags
- "style": one of "playful", "emotional", "hype"

Return ONLY the JSON array, no markdown fences, no extra text.`

  const userMessage = `Generate 3 Instagram caption variants for a ${postType || 'image'} post.
${productContext ? `Product focus: ${productContext}` : 'General gender reveal content.'}
${mediaDescription ? `Media shows: ${mediaDescription}` : ''}
${tone ? `Preferred tone: ${tone}` : ''}
Post type: ${postType || 'image'} (${postType === 'reel' ? 'short punchy captions work best' : postType === 'carousel' ? 'can be slightly longer, storytelling format' : 'medium length, visual-first'})`

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }, 'instagram-caption')

    const text = response.content[0]?.text || '[]'

    // Parse the JSON response
    let variants
    try {
      // Handle potential markdown fences
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      variants = JSON.parse(cleaned)
    } catch {
      variants = [{ hook: 'Caption generation failed', body: text, cta: '', hashtags: '', style: 'playful' }]
    }

    res.json({ ok: true, variants })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
