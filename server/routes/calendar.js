import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import multer from 'multer'
import { dataFile, dataDir } from '../lib/data-dir.js'

const router = Router()

// Allow cross-origin requests from marketing calendar site
router.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (_req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

const DATA_FILE = dataFile('calendar-entries.json')
const VIDEO_DIR = dataDir('calendar-videos')
const MAX_BACKUPS = 20

function getBackupDir() {
  try { return dataDir('calendar-backups') }
  catch { return null }
}

function loadEntries() {
  if (!existsSync(DATA_FILE)) return []
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')) }
  catch { return [] }
}

function backupEntries() {
  if (!existsSync(DATA_FILE)) return
  const dir = getBackupDir()
  if (!dir) return
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(DATA_FILE, `${dir}/calendar-${ts}.json`)
    const files = readdirSync(dir).filter(f => f.startsWith('calendar-') && f.endsWith('.json')).sort()
    while (files.length > MAX_BACKUPS) {
      try { unlinkSync(`${dir}/${files.shift()}`) } catch {}
    }
  } catch (e) {
    console.error('[Calendar] Backup failed:', e.message)
  }
}

function saveEntries(entries) {
  backupEntries()
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

// Get all active entries (excludes archived)
router.get('/entries', (_req, res) => {
  const entries = loadEntries().filter(e => !e._archived)
  res.json(entries)
})

// Get archived entries
router.get('/entries/archived', (_req, res) => {
  const entries = loadEntries().filter(e => e._archived)
  res.json(entries)
})

// Restore an archived entry
router.post('/entries/:id/restore', (req, res) => {
  const entries = loadEntries()
  const entry = entries.find(e => e.id === req.params.id)
  if (!entry) return res.status(404).json({ error: 'Entry not found' })
  delete entry._archived
  delete entry._archivedAt
  saveEntries(entries)
  res.json({ ok: true, entry })
})

// List available backups
router.get('/backups', (_req, res) => {
  const dir = getBackupDir()
  if (!dir) return res.json({ ok: true, backups: [] })
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
    res.json({ ok: true, backups: files.map(f => ({ file: f })) })
  } catch { res.json({ ok: true, backups: [] }) }
})

// Restore from a specific backup
router.post('/backups/:file/restore', (req, res) => {
  const dir = getBackupDir()
  if (!dir) return res.status(404).json({ error: 'No backup directory' })
  const file = req.params.file.replace(/[^a-zA-Z0-9._-]/g, '')
  const backupPath = `${dir}/${file}`
  if (!existsSync(backupPath)) return res.status(404).json({ error: 'Backup not found' })
  try {
    const backupData = JSON.parse(readFileSync(backupPath, 'utf8'))
    backupEntries()
    writeFileSync(DATA_FILE, JSON.stringify(backupData, null, 2))
    res.json({ ok: true, restored: backupData.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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

// Soft-delete an entry (marks as archived, never truly deleted)
router.delete('/entries/:id', (req, res) => {
  const entries = loadEntries()
  const entry = entries.find(e => e.id === req.params.id)
  if (!entry) return res.json({ ok: true })
  entry._archived = true
  entry._archivedAt = new Date().toISOString()
  saveEntries(entries)
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

// Bulk soft-delete (archive, never truly deleted)
router.post('/entries/bulk-delete', (req, res) => {
  const { ids } = req.body
  if (!ids) return res.status(400).json({ error: 'Missing ids' })
  const entries = loadEntries()
  const now = new Date().toISOString()
  entries.forEach(e => {
    if (ids.includes(e.id)) {
      e._archived = true
      e._archivedAt = now
    }
  })
  saveEntries(entries)
  res.json({ ok: true })
})

// Upload media (video or image)
router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid media file' })
  const isImage = req.file.mimetype.startsWith('image/')
  res.json({ url: `/calendar-videos/${req.file.filename}`, filename: req.file.filename, size: req.file.size, type: isImage ? 'image' : 'video' })
})

// Download media file (serves from data volume so SPA catch-all doesn't intercept)
router.get('/download/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '')
  const filePath = join(VIDEO_DIR, filename)
  // Also check public/calendar-videos fallback
  const fallbackPath = join(process.cwd(), 'public', 'calendar-videos', filename)
  if (existsSync(filePath)) {
    return res.download(filePath, filename)
  }
  if (existsSync(fallbackPath)) {
    return res.download(fallbackPath, filename)
  }
  res.status(404).json({ error: 'File not found', checked: [VIDEO_DIR, join(process.cwd(), 'public', 'calendar-videos')] })
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

// Import entries from JSON (merges, never overwrites)
router.post('/import', (req, res) => {
  const incoming = req.body
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'Expected array' })
  const existing = loadEntries()
  const existingIds = new Set(existing.map(e => e.id))
  let added = 0
  for (const entry of incoming) {
    if (!entry.id) continue
    if (existingIds.has(entry.id)) {
      const idx = existing.findIndex(e => e.id === entry.id)
      existing[idx] = entry
    } else {
      existing.push(entry)
      added++
    }
  }
  saveEntries(existing)
  res.json({ ok: true, total: existing.length, added })
})

export default router
