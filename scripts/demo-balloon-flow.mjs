/**
 * Live end-to-end demo of the Helium Balloon Box hire flow.
 *
 * Generates:
 *   1. A REAL Square payment link ($200 bond, with "Helium Balloon Box" in
 *      note so Josh can click it and verify the checkout page).
 *   2. A REAL HMAC-signed contract URL (/sign-balloon/...) that resolves
 *      against the production server.
 *   3. The rendered contract HTML written to /tmp so Josh can open it
 *      locally to see exactly what the customer signs.
 *
 * Reads SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, CONTRACT_SIGNING_SECRET,
 * BASE_URL from .env so the outputs are production-equivalent.
 */
import 'dotenv/config'
import fs from 'fs'
import express from 'express'
import { createBalloonBondPaymentLink } from '../server/lib/balloon-square.js'
import { buildSigningUrl } from '../server/lib/contract-signing-token.js'

// Fake hire — Josh's name so the Square page is clearly identifiable
const SAMPLE_HIRE = {
  id: 'DEMO-' + Date.now().toString(36).toUpperCase(),
  orderNumber: '#DEMO-' + Math.floor(Math.random() * 9999),
  customerName: 'Josh Demo',
  customerEmail: 'joshuacampisi@gmail.com',
  customerPhone: '0406860077',
  eventDate: '2026-06-15',
  boxQty: 1,
  boxColor: 'pink',
  revenue: 299.99,
  contractStatus: 'not_sent',
  productType: 'balloon-box',
  createdAt: new Date().toISOString(),
}

console.log('━'.repeat(72))
console.log('LIVE BALLOON BOX HIRE FLOW DEMO')
console.log('━'.repeat(72))
console.log()
console.log('Sample hire:')
console.log('  Order:    ' + SAMPLE_HIRE.orderNumber)
console.log('  Customer: ' + SAMPLE_HIRE.customerName + ' <' + SAMPLE_HIRE.customerEmail + '>')
console.log('  Event:    ' + SAMPLE_HIRE.eventDate + '  (pickup SAME DAY, return next day)')
console.log('  Variant:  ' + SAMPLE_HIRE.boxColor.toUpperCase())
console.log('  Bond:     $200')
console.log()

// 1. REAL Square payment link
console.log('━'.repeat(72))
console.log('1️⃣  SQUARE BOND PAYMENT LINK (live API call)')
console.log('━'.repeat(72))
try {
  const link = await createBalloonBondPaymentLink(SAMPLE_HIRE)
  console.log('✅ Square accepted the payment link request.')
  console.log()
  console.log('  Payment URL: ' + link.url)
  console.log('  Square link ID: ' + link.paymentLinkId)
  console.log('  Square order ID: ' + (link.orderId || 'n/a'))
  console.log()
  console.log('  Open the URL above in a browser — you will see Square Checkout for')
  console.log('  "Helium Balloon Box Bond — ' + SAMPLE_HIRE.orderNumber + '" at $200 AUD.')
  console.log()
  console.log('  When a customer pays this link, the Square webhook receives a')
  console.log('  payment.completed event whose note contains "Helium Balloon Box".')
  console.log('  Our square-webhook.js routes that event to balloon-store FIRST,')
  console.log('  marks the hire bond_paid, then auto-sends the contract email.')
  SAMPLE_HIRE.bondPaymentUrl = link.url
  SAMPLE_HIRE.bondPaymentLinkId = link.paymentLinkId
} catch (e) {
  console.log('❌ Square payment link failed: ' + e.message)
  process.exit(1)
}

// 2. REAL HMAC-signed contract URL
console.log()
console.log('━'.repeat(72))
console.log('2️⃣  SIGNED CONTRACT URL (production HMAC)')
console.log('━'.repeat(72))
const orderNum = SAMPLE_HIRE.orderNumber.replace('#', '')
const tntStyleUrl = buildSigningUrl(orderNum)
const balloonSigningUrl = tntStyleUrl.replace('/sign/', '/sign-balloon/')
console.log()
console.log('  Customer-facing URL: ' + balloonSigningUrl)
console.log()
console.log('  This URL is HMAC-signed with CONTRACT_SIGNING_SECRET. The token')
console.log('  expires in 60 days and cannot be guessed or replayed.')
console.log()
console.log('  When the customer clicks it:')
console.log('    a. server/index.js verifies the HMAC token')
console.log('    b. Resolves the order number to the balloon hire')
console.log('    c. Rewrites the request to /api/balloon-contract/:id/sign')
console.log('    d. balloon-contract.js renders the HTML contract page')
console.log('    e. Customer types their name → POST signs it')
console.log('    f. Hire flips to contract_signed, Telegram fires to Josh + staff')
console.log()

// 3. Render the actual contract HTML and save it
console.log('━'.repeat(72))
console.log('3️⃣  RENDERED CONTRACT PAGE (what the customer signs)')
console.log('━'.repeat(72))

// Spin up the balloon-contract router in-process and call the GET endpoint
const contractRouter = (await import('../server/routes/balloon-contract.js')).default
const balloonStore = await import('../server/lib/balloon-store.js')

// Inject the sample hire into the store so the route can find it
const all = balloonStore.getAll()
const exists = all.find(h => h.id === SAMPLE_HIRE.id)
if (!exists) {
  // Use create() and patch the returned id
  const created = balloonStore.create(SAMPLE_HIRE)
  SAMPLE_HIRE._actualId = created.id
}
const lookupId = SAMPLE_HIRE._actualId || SAMPLE_HIRE.id

const app = express()
app.use(express.json())
app.use('/api/balloon-contract', contractRouter)
const server = app.listen(0)
const port = server.address().port

const contractRes = await fetch(`http://127.0.0.1:${port}/api/balloon-contract/${lookupId}/sign`)
const contractHtml = await contractRes.text()
const outPath = '/tmp/balloon-contract-preview.html'
fs.writeFileSync(outPath, contractHtml)
console.log()
console.log('  Saved to: ' + outPath)
console.log('  Open in your browser to see exactly what the customer sees.')
console.log()
console.log('  Try: open ' + outPath)
console.log()
console.log('  Or POST a signature to test the signing flow:')
console.log('  curl -X POST -H "Content-Type: application/json" \\')
console.log(`       -d '{"signature":"Josh Test"}' \\`)
console.log(`       ${balloonSigningUrl}`)
console.log()

// Cleanup demo hire from balloon-hires.json so it doesn't pollute prod
const cleaned = balloonStore.getAll().filter(h => h.id !== lookupId)
fs.writeFileSync('data/balloon-hires.json', JSON.stringify(cleaned, null, 2))
console.log('🧹 Removed demo hire from data/balloon-hires.json (was id=' + lookupId + ')')

server.close()
console.log()
console.log('━'.repeat(72))
console.log('DEMO COMPLETE — all three deliverables generated.')
console.log('━'.repeat(72))
