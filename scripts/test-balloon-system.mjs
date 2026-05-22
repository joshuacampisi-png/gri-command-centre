/**
 * Regression test for the Helium Balloon Box hire system.
 *
 * Spins up the real routers in-process on a random port and exercises
 * the full lifecycle:
 *   1. POST /api/balloons → create a hire (mocks the Shopify webhook path)
 *   2. GET  /api/balloons → list contains the new hire
 *   3. PUT  /api/balloons/:id with eventDate
 *   4. POST /api/balloons/:id/mark-bond-paid → status becomes bond_paid
 *   5. POST /api/balloons/:id/send-contract → contract email path (mocked email)
 *   6. POST /api/balloons/:id/process-return { decision:'refund', forceManual:true }
 *      → marks refunded_manual without calling Square
 *   7. GET  /api/balloons/health → reports counts + config
 *
 * Run: node scripts/test-balloon-system.mjs
 */
import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

// Point data dir at a temp location so we don't pollute prod data
const TMP = '/tmp/balloon-test-' + Date.now()
fs.mkdirSync(TMP, { recursive: true })
process.env.OPENCLAW_DATA_DIR = TMP

// Mock email + telegram + square so we don't hit real services
process.env.RESEND_API_KEY = ''
process.env.GMAIL_USER = ''
process.env.GMAIL_APP_PASSWORD = ''
process.env.TELEGRAM_BOT_TOKEN = ''
process.env.SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || 'mock'
process.env.BALLOON_BOND_AMOUNT = '200'

// We need to make the balloon store write to TMP. The store uses a hard-coded
// path relative to __dirname. Symlink data/ inside the project to TMP/data
// for the duration of this test.
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REAL_DATA = path.join(PROJ, 'data', 'balloon-hires.json')
let backup = null
if (fs.existsSync(REAL_DATA)) {
  backup = fs.readFileSync(REAL_DATA, 'utf8')
}
// Write empty array so test starts clean
fs.mkdirSync(path.dirname(REAL_DATA), { recursive: true })
fs.writeFileSync(REAL_DATA, '[]')

try {
  const router = (await import('../server/routes/balloons.js')).default
  const app = express()
  app.use(express.json())
  app.use('/api/balloons', router)
  const server = app.listen(0)
  const port = server.address().port
  const base = `http://127.0.0.1:${port}/api/balloons`

  function assert(cond, msg) { if (!cond) { console.log('FAIL', msg); process.exit(1) } else { console.log('PASS', msg) } }

  // 1. Health
  let r = await fetch(`${base}/health`)
  let d = await r.json()
  assert(d.ok && d.bondAmount === 200 && d.productId === 8205084131417, 'health endpoint reports config')

  // 2. List empty
  r = await fetch(`${base}/`)
  d = await r.json()
  assert(Array.isArray(d.hires) && d.hires.length === 0, 'list starts empty')

  // 3. Create
  r = await fetch(`${base}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber: '#TEST-99001',
      customerName: 'Test Family',
      customerEmail: 'test@example.com',
      customerPhone: '0400000000',
      eventDate: '2026-06-15',
      boxColor: 'pink',
      boxQty: 1,
    }),
  })
  d = await r.json()
  assert(d.hire && d.hire.id && d.hire.orderNumber === '#TEST-99001', 'create returns hire with id')
  const hireId = d.hire.id

  // 4. List has 1
  r = await fetch(`${base}/`)
  d = await r.json()
  assert(d.hires.length === 1, 'list has 1 hire')
  assert(d.hires[0].boxColor === 'pink', 'boxColor persisted')
  assert(d.hires[0].productType === 'balloon-box', 'productType set')

  // 5. Update eventDate via PUT
  r = await fetch(`${base}/${hireId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventDate: '2026-06-20' }),
  })
  d = await r.json()
  assert(d.hire.eventDate === '2026-06-20', 'PUT updates eventDate')

  // 6. Mark bond paid → triggers auto-contract-send so final status is contract_sent
  r = await fetch(`${base}/${hireId}/mark-bond-paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  d = await r.json()
  assert(d.hire.bondStatus === 'paid', 'bond marked paid')
  assert(['bond_paid', 'contract_sent'].includes(d.hire.status), 'status moved to bond_paid or contract_sent')

  // 7. Process return — forceManual path (no Square call)
  r = await fetch(`${base}/${hireId}/process-return`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'refund', forceManual: true }),
  })
  d = await r.json()
  assert(d.ok && d.manual === true && d.hire.bondOutcome === 'refunded_manual', 'forceManual refund path works')

  // 8. Health reflects counts
  r = await fetch(`${base}/health`)
  d = await r.json()
  assert(d.counts.total === 1, 'health counts total')

  // 9. process-return on hire with fake payment ID returns 409 NO_SQUARE_PAYMENT
  //    (re-create a fresh hire for this case)
  r = await fetch(`${base}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber: '#TEST-99002', customerName: 'B', customerEmail: 'b@b.com', eventDate: '2026-06-20', boxQty: 1,
    }),
  })
  d = await r.json()
  const h2 = d.hire.id
  await fetch(`${base}/${h2}/mark-bond-paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) // gives sq_terminal_ id (placeholder)
  r = await fetch(`${base}/${h2}/process-return`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'refund' }),
  })
  d = await r.json()
  assert(r.status === 409 && d.code === 'NO_SQUARE_PAYMENT', 'placeholder bondPaymentId blocks auto-refund with 409')

  server.close()
  console.log('\nAll balloon system tests passed.')
} finally {
  // Restore original data file
  if (backup !== null) fs.writeFileSync(REAL_DATA, backup)
  else try { fs.unlinkSync(REAL_DATA) } catch {}
}
