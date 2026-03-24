import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const DATA_FILE = join(ROOT, 'data', 'calendar-entries.json')
const VIDEO_DIR = join(ROOT, 'public', 'calendar-videos')

mkdirSync(join(ROOT, 'data'), { recursive: true })

mkdirSync(VIDEO_DIR, { recursive: true })

function loadEntries() {
  if (!existsSync(DATA_FILE)) return []
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')) }
  catch { return [] }
}

function saveEntries(entries) {
  writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2))
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop().toLowerCase()
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
    }
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
    cb(null, allowed.includes(file.mimetype))
  },
  limits: { fileSize: 500 * 1024 * 1024 }
})

const router = Router()

// Get all entries
router.get('/entries', (_req, res) => {
  res.json(loadEntries())
})

// Create or update an entry
router.post('/entries', (req, res) => {
  const entry = req.body
  if (!entry || !entry.id) return res.status(400).json({ error: 'Missing entry id' })
  const entries = loadEntries()
  const idx = entries.findIndex(e => e.id === entry.id)
  if (idx >= 0) entries[idx] = entry
  else entries.push(entry)
  saveEntries(entries)
  res.json({ ok: true, entry })
})

// Delete an entry
router.delete('/entries/:id', (req, res) => {
  const entries = loadEntries()
  const entry = entries.find(e => e.id === req.params.id)
  if (entry?.videoUrl) {
    const filename = entry.videoUrl.split('/').pop()
    try { unlinkSync(join(VIDEO_DIR, filename)) } catch {}
  }
  saveEntries(entries.filter(e => e.id !== req.params.id))
  res.json({ ok: true })
})

// Bulk update status
router.post('/entries/bulk-status', (req, res) => {
  const { ids, status } = req.body
  if (!ids || !status) return res.status(400).json({ error: 'Missing ids or status' })
  const entries = loadEntries()
  entries.forEach(e => { if (ids.includes(e.id)) e.status = status })
  saveEntries(entries)
  res.json({ ok: true })
})

// Bulk delete
router.post('/entries/bulk-delete', (req, res) => {
  const { ids } = req.body
  if (!ids) return res.status(400).json({ error: 'Missing ids' })
  const entries = loadEntries()
  entries.filter(e => ids.includes(e.id) && e.videoUrl).forEach(e => {
    const filename = e.videoUrl.split('/').pop()
    try { unlinkSync(join(VIDEO_DIR, filename)) } catch {}
  })
  saveEntries(entries.filter(e => !ids.includes(e.id)))
  res.json({ ok: true })
})

// Upload media (video or image)
router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid media file' })
  const isImage = req.file.mimetype.startsWith('image/')
  res.json({ url: `/calendar-videos/${req.file.filename}`, filename: req.file.filename, size: req.file.size, type: isImage ? 'image' : 'video' })
})

// Delete video
router.delete('/video/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '')
  try { unlinkSync(join(VIDEO_DIR, filename)) } catch {}
  res.json({ ok: true })
})

// Export all entries as JSON
router.get('/export', (_req, res) => {
  const entries = loadEntries()
  res.setHeader('Content-Disposition', `attachment; filename=content-calendar-${new Date().toISOString().slice(0,10)}.json`)
  res.json(entries)
})

// Import entries from JSON
router.post('/import', (req, res) => {
  const entries = req.body
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'Expected array' })
  saveEntries(entries)
  res.json({ ok: true, count: entries.length })
})

export default router
