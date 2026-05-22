/**
 * balloon-contract-generator.js
 * Generates a branded PDF of the Helium Balloon Box Rental Agreement.
 * Mirrors the structure of contract-generator.js (TNT) but with the
 * balloon-specific clauses Josh wrote.
 */
import PDFDocument from 'pdfkit'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = join(__dirname, '..', '..', 'public', 'company-logos', 'gri.jpg')
const PINK = '#E91E8C'
const DARK = '#222222'
const GREY = '#555555'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function ord(d) { if (d>=11 && d<=13) return d+'th'; switch (d%10){case 1:return d+'st';case 2:return d+'nd';case 3:return d+'rd';default:return d+'th'} }
function parseD(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d) }
function fmtLong(s) { if (!s) return 'TBC'; const dt=parseD(s); return `${DAYS[dt.getDay()]}, ${ord(dt.getDate())} ${MONTHS[dt.getMonth()]}` }
function addD(s, n) { const dt=parseD(s); dt.setDate(dt.getDate()+n); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` }

function bondAmount(hire) {
  const base = parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10)
  const perBox = process.env.BALLOON_BOND_PER_BOX === 'true'
  return base * (perBox ? (hire.boxQty || 1) : 1)
}

/**
 * Generate the Helium Balloon Box Rental Agreement PDF.
 * Returns a Buffer.
 */
export async function generateBalloonContractPdf(hire) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks = []
      doc.on('data', c => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const hasLogo = existsSync(LOGO_PATH)
      const bond = bondAmount(hire)
      const variant = hire.boxColor ? hire.boxColor.toUpperCase() : 'UNSPECIFIED'
      const pickup = fmtLong(hire.eventDate)
      const eventF = fmtLong(hire.eventDate)
      const returnF = hire.eventDate ? fmtLong(addD(hire.eventDate, 1)) : 'TBC'
      const issued = hire.createdAt
        ? new Date(hire.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })
        : new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

      // ─── PAGE 1: COVER ───────────────────────────────────────
      if (hasLogo) doc.image(LOGO_PATH, 50, 50, { width: 160 })
      doc.moveDown(5)
      doc.fontSize(22).font('Helvetica-Bold').fillColor(DARK).text('HELIUM BALLOON BOX', 50, 200)
      doc.fontSize(44).font('Helvetica-Bold').fillColor(PINK).text('RENTAL', 50, 235).text('AGREEMENT', 50, 290)
      doc.moveTo(50, 360).lineTo(545, 360).lineWidth(3).strokeColor(PINK).stroke()

      // Prepared for + meta block
      doc.fontSize(12).font('Helvetica').fillColor(GREY)
        .text(`Prepared for`, 50, 380)
      doc.fontSize(18).font('Helvetica-Bold').fillColor(DARK)
        .text(hire.customerName, 50, 397)

      const metaY = 440
      const lineGap = 18
      const labelX = 50
      const valueX = 220
      function row(y, label, value) {
        doc.fontSize(10).font('Helvetica').fillColor(GREY).text(label, labelX, y)
        doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK).text(value || '—', valueX, y)
      }
      row(metaY + 0 * lineGap, 'Order number', hire.orderNumber)
      row(metaY + 1 * lineGap, 'Contract issued', issued)
      row(metaY + 2 * lineGap, 'Customer email', hire.customerEmail || '—')
      row(metaY + 3 * lineGap, 'Customer phone', hire.customerPhone || '—')
      row(metaY + 4 * lineGap, 'Variant', variant + (hire.boxQty > 1 ? ` × ${hire.boxQty}` : ''))
      row(metaY + 5 * lineGap, 'Pickup (SAME DAY)', pickup)
      row(metaY + 6 * lineGap, 'Event', eventF)
      row(metaY + 7 * lineGap, 'Return (next day)', returnF)
      row(metaY + 8 * lineGap, 'Refundable bond', `$${bond} AUD`)

      // Footer pink bar
      doc.rect(0, 780, 595, 12).fill(PINK)

      // ─── PAGE 2: TERMS ───────────────────────────────────────
      doc.addPage()
      doc.fontSize(20).font('Helvetica-Bold').fillColor(PINK).text('Terms & Conditions', 50, 50)
      doc.moveTo(50, 80).lineTo(545, 80).lineWidth(2).strokeColor(PINK).stroke()
      let y = 100

      function h2(text) {
        doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK).text(text, 50, y)
        y = doc.y + 6
      }
      function para(text) {
        doc.fontSize(10.5).font('Helvetica').fillColor(DARK).text(text, 50, y, { width: 495, align: 'left' })
        y = doc.y + 8
      }
      function bullet(text) {
        doc.fontSize(10.5).font('Helvetica').fillColor(DARK)
          .text('•  ' + text, 60, y, { width: 485, align: 'left' })
        y = doc.y + 4
      }

      h2('What you receive')
      para(`One Gender Reveal Helium Balloon Box for hire, pre-filled with helium balloons of the selected (organised) gender — ${variant} — together with the balloon weight inside the box.`)

      h2('Hire window — SAME-DAY use only')
      para(`Your box will be ready for pickup on the day you've selected: ${pickup}. Collect any time during business hours that day.`)
      para('This Helium Balloon Box hire is built for same-day pickup and same-day reveal. By signing this contract, you acknowledge and accept that the box is designed to be picked up on the day of your event and used the same day.')
      para('If you choose to arrange pickup the day before, you do so entirely at your own risk. Gender Reveal Ideas accepts no liability and no responsibility for deflated balloons or for the balloon box not performing as it should under those circumstances.')

      h2('Pickup & return')
      para(`Collect from 2 Monaco Street, Surfers Paradise on ${pickup}. Return the box with the balloon weight inside the box to the same address on ${returnF}. Late return: $100 per day deducted from the bond.`)

      h2('Your responsibilities')
      bullet('Bring the box back undamaged, with the balloon weight inside the box.')
      bullet(`Any damage to the box will result in full forfeit of your $${bond} bond.`)
      bullet(`Any water damage will result in full forfeit of your $${bond} bond.`)
      bullet('Return on time. Late return is $100 per day, deducted from the bond.')
      bullet('Same-day use only. The hirer accepts all risk for any deflation, performance issues, or non-performance arising from picking up the box earlier than the event day.')

      h2('Bond & refund')
      para(`A $${bond} refundable bond is held against the hire. Once our team has inspected the box on return and confirmed there is no damage or water damage, the bond is refunded. Funds normally appear in your account 4–7 days after the refund is processed.`)

      h2('Liability')
      para('Gender Reveal Ideas is not liable for any injury, loss, deflation, or non-performance arising from use of the helium balloon box outside its intended same-day purpose, or from failure to follow the responsibilities above. The hirer assumes full responsibility for the safe use of the hire equipment at their event.')

      // Signature block
      if (y > 680) { doc.addPage(); y = 50 }
      y += 20
      doc.moveTo(50, y).lineTo(545, y).lineWidth(0.5).strokeColor('#CCCCCC').stroke()
      y += 12
      h2('Signed by hirer')
      if (hire.contractStatus === 'signed' && hire.contractSignatureUrl) {
        const sig = hire.contractSignatureUrl.replace(/^typed:/, '')
        doc.fontSize(20).font('Helvetica-Oblique').fillColor(PINK).text(sig, 50, y)
        y = doc.y + 4
        const signedDate = hire.contractSignedAt
          ? new Date(hire.contractSignedAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'long', timeStyle: 'short' })
          : ''
        doc.fontSize(9).font('Helvetica').fillColor(GREY).text(`Typed signature accepted ${signedDate} AEST`, 50, y)
      } else {
        doc.fontSize(11).font('Helvetica-Oblique').fillColor(GREY).text('Not yet signed', 50, y)
      }

      // Footer
      doc.rect(0, 780, 595, 12).fill(PINK)

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}
