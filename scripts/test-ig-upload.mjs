
import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

// Mount the real router in-process
const router = (await import('../server/routes/instagram-scheduler.js')).default
const app = express()
app.use('/api/instagram', router)
const server = app.listen(0)
const port = server.address().port
const base = `http://127.0.0.1:${port}/api/instagram`
console.log('Test server on', base)

// Tiny valid 1x1 PNG (89 bytes)
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
// Tiny valid 1x1 JPEG (~635 bytes hardcoded)
const JPG_1x1 = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z', 'base64')
// Tiny GIF (43 bytes)
const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')

async function postFile(filename, buf, declaredMime) {
  const fd = new FormData()
  const blob = new Blob([buf], { type: declaredMime })
  fd.append('media', blob, filename)
  const res = await fetch(`${base}/upload`, { method: 'POST', body: fd })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { status: res.status, json }
}

const cases = [
  { name: 'classic-jpeg.jpg', buf: JPG_1x1, mime: 'image/jpeg' },
  { name: 'classic-png.png',  buf: PNG_1x1, mime: 'image/png' },
  { name: 'legacy-jpg-mime.jpg', buf: JPG_1x1, mime: 'image/jpg' },   // bad MIME, good ext
  { name: 'gif-image.gif', buf: GIF_1x1, mime: 'image/gif' },         // previously REJECTED
  { name: 'iphone-photo.heic', buf: JPG_1x1, mime: 'image/heic' },    // previously REJECTED
  { name: 'no-mime-just-ext.png', buf: PNG_1x1, mime: 'application/octet-stream' }, // previously REJECTED
  { name: 'truly-bad.txt', buf: Buffer.from('hello'), mime: 'text/plain' }, // SHOULD reject
]

const results = []
for (const c of cases) {
  const r = await postFile(c.name, c.buf, c.mime)
  const ok = r.status === 200 && r.json.ok && r.json.files?.length === 1
  const shouldAccept = !c.name.endsWith('.txt')
  const verdict = (ok === shouldAccept) ? 'PASS' : 'FAIL'
  console.log(`${verdict.padEnd(5)} ${c.name.padEnd(28)} declared:${c.mime.padEnd(28)} → HTTP ${r.status} ${ok ? '✓ accepted' : '✗ rejected'} ${ok ? '(' + r.json.files[0].type + ')' : '(' + (r.json.error || 'unknown') + ')'}`)
  results.push({ name: c.name, verdict, status: r.status })
  if (ok && r.json.files?.[0]?.filename) {
    // cleanup uploaded file
    const p = path.join(process.cwd(), 'data', 'instagram-media', r.json.files[0].filename)
    try { fs.unlinkSync(p) } catch {}
  }
}

server.close()
const failed = results.filter(r => r.verdict === 'FAIL')
if (failed.length) { console.log('\n', failed.length, 'FAILED'); process.exit(1) }
console.log('\nAll', results.length, 'cases passed.')
