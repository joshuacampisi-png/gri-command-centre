/**
 * routes/balloon-contract.js
 * Standalone contract page + signing endpoint for the Helium Balloon Box hire.
 * Renders a self-contained HTML page (no React) with balloon-specific T&Cs.
 *
 * URL surface (mounted at /api/balloon-contract in server/index.js):
 *   GET  /:hireId/sign      → renders the contract HTML
 *   POST /:hireId/sign      → records signature, marks contract signed
 *
 * Customer-facing URL is /sign-balloon/:orderNumber/:token (HMAC-signed,
 * lives outside /api/ so basic-auth realm caching doesn't trigger
 * password prompts).
 */
import { Router } from 'express'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getAll, getById, update } from '../lib/balloon-store.js'
import { notifyBalloonEvent } from '../lib/balloon-telegram.js'
import { getGriLogoDataUri } from '../lib/gri-logo-data-uri.js'
import { generateBalloonContractPdf } from '../lib/balloon-contract-generator.js'
import { dataDir } from '../lib/data-dir.js'

// Signed PDFs on the Railway volume so they survive redeploys (legal records).
const CONTRACTS_DIR = dataDir('balloon-contracts')

// Balloon-box hire dates: SAME DAY pickup, NEXT DAY return.
// Helium balloons deflate within ~24h, so the box is built for same-day use.
// Picking up the day before is NOT supported — see contract clause #1.
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function _ord(d) { if (d>=11 && d<=13) return d+'th'; switch (d%10){case 1:return d+'st';case 2:return d+'nd';case 3:return d+'rd';default:return d+'th'} }
function _parse(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d) }
function _fmt(s) { const dt=_parse(s); return `${DAYS[dt.getDay()]}, ${_ord(dt.getDate())} ${MONTHS[dt.getMonth()]}` }
function _add(s, n) { const dt=_parse(s); dt.setDate(dt.getDate()+n); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` }
function getBalloonHireDates(eventDate) {
  if (!eventDate) return { pickupFormatted: 'TBC', eventFormatted: 'TBC', returnFormatted: 'TBC' }
  return {
    pickupFormatted: _fmt(eventDate),            // SAME DAY
    eventFormatted:  _fmt(eventDate),
    returnFormatted: _fmt(_add(eventDate, 1)),   // NEXT DAY
  }
}

const router = Router()

function findHire(idOrOrder) {
  let hire = getById(idOrOrder)
  if (hire) return hire
  const normalised = idOrOrder.replace(/^#/, '')
  return getAll().find(h => h.orderNumber === `#${normalised}` || h.orderNumber === normalised || h.id === idOrOrder) || null
}

function bondAmount(hire) {
  const base = parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10)
  return base * (hire.boxQty || 1)
}

router.get('/:hireId/sign', (req, res) => {
  const hire = findHire(req.params.hireId)
  if (!hire) return res.status(404).send('Hire not found')

  const dates = getBalloonHireDates(hire.eventDate)
  const alreadySigned = hire.contractStatus === 'signed'
  const qty = hire.boxQty || 1
  const bond = bondAmount(hire)
  const variant = hire.boxColor ? hire.boxColor.toUpperCase() : 'UNSPECIFIED'
  const logo = getGriLogoDataUri()
  // Contract date = order/hire creation date (the day the booking was made).
  // Customer name is rendered in the H1 sub-heading so the doc is clearly
  // "prepared for {Customer}". Both auto-populate from the hire record.
  const issuedDate = hire.createdAt
    ? new Date(hire.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })
    : new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  const eventDateFormatted = hire.eventDate
    ? new Date(hire.eventDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBC'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gender Reveal Ideas Contract — ${hire.customerName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F8F6F4; color: #2D3A4A; line-height: 1.6; padding: 14px; }
    .container { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 14px rgba(0,0,0,0.08); padding: 28px; }
    .brand { text-align: center; margin-bottom: 8px; }
    .brand img { max-width: 160px; height: auto; }
    h1 { font-size: 22px; font-weight: 800; text-align: center; color: #E43F7B; margin: 8px 0 4px; }
    .sub { text-align: center; color: #6B7280; font-size: 12px; margin-bottom: 20px; }
    .meta { background: #F0FDFA; border: 1px solid #A7F3D0; border-radius: 8px; padding: 14px; margin-bottom: 18px; font-size: 14px; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .meta-row strong { color: #047857; }
    h2 { font-size: 14px; font-weight: 700; color: #181A1D; text-transform: uppercase; letter-spacing: .04em; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #FCE7F3; }
    p, li { font-size: 14px; margin-bottom: 8px; }
    ol { padding-left: 22px; }
    li { margin-bottom: 6px; }
    .signed { background: #DCFCE7; border: 1px solid #10B981; border-radius: 8px; padding: 14px; text-align: center; color: #047857; font-weight: 600; }
    .sig-block { margin-top: 26px; padding-top: 18px; border-top: 2px solid #E43F7B; }
    .sig-block label { display: block; font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
    .sig-block input { width: 100%; padding: 10px 12px; font-size: 16px; border: 1px solid #CBD5E1; border-radius: 8px; font-family: 'Brush Script MT', cursive; color: #2D3A4A; }
    .sig-block button { width: 100%; margin-top: 12px; padding: 14px; font-size: 16px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #E43F7B, #d1356b); border: none; border-radius: 10px; cursor: pointer; transition: opacity .15s; }
    .sig-block button:hover { opacity: .92; }
    .sig-block button:disabled { opacity: .5; cursor: not-allowed; }
    .ack { color: #475569; font-size: 12px; line-height: 1.5; margin-bottom: 14px; }
    .err { color: #DC2626; font-size: 13px; margin-top: 8px; }
    .ok { color: #047857; font-size: 13px; margin-top: 8px; }
    .footer { text-align: center; color: #94A3B8; font-size: 11px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #E2E8F0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand"><img src="${logo}" alt="Gender Reveal Ideas"></div>
    <h1>Helium Balloon Box Rental Agreement</h1>
    <div class="sub">Prepared for <strong>${hire.customerName}</strong></div>
    <div class="sub" style="margin-top:2px">Order ${hire.orderNumber} · Issued ${issuedDate}</div>

    <div class="meta">
      <div class="meta-row"><span>Hirer</span><strong>${hire.customerName}</strong></div>
      <div class="meta-row"><span>Contact</span><strong>${hire.customerEmail || ''}${hire.customerPhone ? ' · ' + hire.customerPhone : ''}</strong></div>
      <div class="meta-row"><span>Order number</span><strong>${hire.orderNumber}</strong></div>
      <div class="meta-row"><span>Contract issued</span><strong>${issuedDate}</strong></div>
      <div class="meta-row"><span>Variant</span><strong>${variant}${qty > 1 ? ` × ${qty}` : ''}</strong></div>
      <div class="meta-row"><span>Pickup (SAME DAY as event)</span><strong>${dates.pickupFormatted}</strong></div>
      <div class="meta-row"><span>Event date</span><strong>${dates.eventFormatted}</strong></div>
      <div class="meta-row"><span>Return (next day)</span><strong>${dates.returnFormatted}</strong></div>
      <div class="meta-row"><span>Refundable bond</span><strong>$${bond}</strong></div>
    </div>

    <h2>What you receive</h2>
    <p>One Gender Reveal Helium Balloon Box for hire, pre-filled with helium balloons of the selected (organised) gender — ${variant} — together with the balloon weight inside the box.</p>

    <h2>Hire window — SAME-DAY use only</h2>
    <p><strong>Your box will be ready for pickup on the day you've selected: ${dates.pickupFormatted}.</strong> Collect any time during business hours that day.</p>
    <p><strong>This Helium Balloon Box hire is built for same-day pickup and same-day reveal. By signing this contract, you acknowledge and accept that the box is designed to be picked up on the day of your event and used the same day.</strong></p>
    <p>If you choose to arrange pickup the day before, you do so entirely at your own risk. Gender Reveal Ideas accepts <strong>no liability and no responsibility</strong> for deflated balloons or for the balloon box not performing as it should under those circumstances. Helium balloons naturally lose lift over time — same-day use is the only way we can guarantee performance.</p>

    <h2>Pickup &amp; return</h2>
    <p>Collect from <strong>2 Monaco Street, Surfers Paradise</strong> on the pickup date above (same day as your event). Return the box, with the balloon weight inside, to the same address the next day.</p>
    <p><strong>Late return: $100 per day</strong> is deducted from the bond for every day the box is returned late.</p>

    <h2>Your responsibilities</h2>
    <ol>
      <li><strong>Bring the box back undamaged</strong>, with the balloon weight inside the box.</li>
      <li><strong>Any damage to the box</strong> will result in <strong>full forfeit of your $${bond} bond</strong> — it will not be returned.</li>
      <li><strong>Any water damage</strong> will result in <strong>full forfeit of your $${bond} bond</strong>.</li>
      <li><strong>Return on time.</strong> Late return is $100 per day, deducted from the bond.</li>
      <li><strong>Same-day use only.</strong> The hirer accepts all risk for any deflation, performance issues, or non-performance arising from picking up the box earlier than the event day.</li>
    </ol>

    <h2>Bond &amp; refund</h2>
    <p>A $${bond} refundable bond is held against the hire. Once our team has inspected the box on return and confirmed there is no damage or water damage, the bond is refunded. Funds normally appear in your account <strong>4–7 days</strong> after the refund is processed.</p>

    <h2>Liability</h2>
    <p>Gender Reveal Ideas is not liable for any injury, loss, deflation, or non-performance arising from use of the helium balloon box outside its intended same-day purpose, or from failure to follow the responsibilities above. The hirer assumes full responsibility for the safe use of the hire equipment at their event.</p>

    ${alreadySigned ? `
      <div class="signed">
        ✓ This contract was signed on ${new Date(hire.contractSignedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Brisbane' })} AEST
      </div>
    ` : `
      <div class="sig-block">
        <p class="ack">By typing your full name below, you agree to all of the terms in this Helium Balloon Box Rental Agreement.</p>
        <label>Your full name</label>
        <input id="sig" type="text" placeholder="Type your full name as your signature" autocomplete="name">
        <button id="submit" type="button">Sign &amp; submit</button>
        <div id="msg"></div>
      </div>

      <script>
        const btn = document.getElementById('submit')
        const input = document.getElementById('sig')
        const msg = document.getElementById('msg')

        async function submitSig() {
          const sig = (input.value || '').trim()
          if (sig.length < 2) { msg.className = 'err'; msg.textContent = 'Please type your full name.'; return }
          btn.disabled = true; msg.className = ''; msg.textContent = 'Submitting...'
          try {
            const path = location.pathname
            const res = await fetch(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signature: sig }),
            })
            const data = await res.json()
            if (!res.ok || !data.ok) throw new Error(data.error || 'Sign failed')
            msg.className = 'ok'; msg.textContent = '✓ Contract signed — thank you!'
            setTimeout(() => location.reload(), 800)
          } catch (e) {
            btn.disabled = false; msg.className = 'err'; msg.textContent = e.message
          }
        }
        btn.addEventListener('click', submitSig)
        input.addEventListener('keypress', e => { if (e.key === 'Enter') submitSig() })
      </script>
    `}

    <div class="footer">Gender Reveal Ideas · 0406 860 077 · genderrevealideas.com.au</div>
  </div>
</body>
</html>`

  res.type('html').send(html)
})

router.post('/:hireId/sign', async (req, res) => {
  const hire = findHire(req.params.hireId)
  if (!hire) return res.status(404).json({ ok: false, error: 'Hire not found' })
  const { signature } = req.body
  if (!signature || signature.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'Signature is required (full name)' })
  }
  if (hire.contractStatus === 'signed') {
    return res.json({ ok: true, message: 'Contract already signed' })
  }
  const updated = update(hire.id, {
    contractStatus: 'signed',
    contractSignedAt: new Date().toISOString(),
    contractSignatureUrl: `typed:${signature.trim()}`,
    status: hire.status === 'contract_sent' ? 'contract_signed' : hire.status,
  })
  console.log(`[balloon-contract] Signed by ${signature.trim()} for hire ${hire.id}`)

  // Save signed PDF to disk so the dashboard's "Download PDF" link resolves.
  try {
    const pdfBuffer = await generateBalloonContractPdf(updated)
    const safeOrder = (hire.orderNumber || hire.id).replace(/[^a-zA-Z0-9_-]/g, '_')
    const filename = `Balloon-Contract-${safeOrder}-${hire.id}.pdf`
    writeFileSync(join(CONTRACTS_DIR, filename), pdfBuffer)
    update(hire.id, { contractPdfPath: filename })
    console.log(`[balloon-contract] Signed PDF saved: data/balloon-contracts/${filename}`)
  } catch (pdfErr) {
    console.error('[balloon-contract] Failed to save signed PDF:', pdfErr.message)
  }

  notifyBalloonEvent('contract_signed', getById(hire.id)).catch(() => {})
  res.json({ ok: true, hire: getById(hire.id) })
})

// Download the signed/draft balloon contract PDF
router.get('/:hireId/pdf', async (req, res) => {
  try {
    const hire = findHire(req.params.hireId)
    if (!hire) return res.status(404).json({ error: 'Hire not found' })

    // Serve cached PDF if it exists
    if (hire.contractPdfPath && existsSync(join(CONTRACTS_DIR, hire.contractPdfPath))) {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${hire.contractPdfPath}"`,
      })
      return res.sendFile(join(CONTRACTS_DIR, hire.contractPdfPath))
    }
    // Otherwise generate fresh on-the-fly
    const pdfBuffer = await generateBalloonContractPdf(hire)
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Balloon-Contract-${hire.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    })
    res.send(pdfBuffer)
  } catch (e) {
    console.error('[balloon-contract] PDF error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default router
