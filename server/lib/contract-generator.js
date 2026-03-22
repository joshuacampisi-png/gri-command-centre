import PDFDocument from 'pdfkit';
import { getHireDates } from './date-helpers.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, '..', '..', 'public', 'company-logos', 'gri.jpg');
const PINK = '#E91E8C';

/**
 * Generate a TNT Kit Rental Agreement PDF matching the branded design.
 * @param {object} hire - the hire record
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateContractPdf(hire) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const dates = getHireDates(hire.eventDate);
      const hasLogo = existsSync(LOGO_PATH);
      const qty = hire.kitQty || 1;
      const bondAmount = qty >= 2 ? 400 : 200;
      const kitPrice = qty >= 2 ? '699.98' : '349.99';
      const mul = (base) => qty >= 2 ? base * 2 : base;

      // ─── PAGE 1: COVER ───────────────────────────────────────
      // Logo top-left
      if (hasLogo) {
        doc.image(LOGO_PATH, 50, 50, { width: 160 });
      }

      doc.moveDown(5);

      // Title block
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#222222')
        .text('TNT KIT', 50, 200);

      doc.fontSize(48).font('Helvetica-Bold').fillColor(PINK)
        .text('RENTAL', 50, 235)
        .text('AGREEMENT', 50, 290);

      // Pink divider line
      doc.moveTo(50, 360).lineTo(545, 360).lineWidth(3).strokeColor(PINK).stroke();

      // Reset line width
      doc.lineWidth(1);

      // ─── Prepared by / Prepared for ───
      const detailsY = 400;
      doc.fillColor('#666666');

      // Left column - Prepared by
      doc.fontSize(11).font('Helvetica-Oblique')
        .text('Prepared by:', 50, detailsY);
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica').fillColor('#333333')
        .text('Business name', 50);
      doc.font('Helvetica-Bold')
        .text('GENDER REVEAL IDEAS PTY LTD', 50);
      doc.moveDown(0.3);
      doc.font('Helvetica').fillColor('#333333')
        .text('ABN', 50);
      doc.font('Helvetica-Bold')
        .text('32 684 332 929 7', 50);
      doc.moveDown(0.3);
      doc.font('Helvetica').fillColor('#333333')
        .text('Contact Email', 50);
      doc.font('Helvetica-Bold')
        .text('hello@genderrevealideas.com.au', 50);

      // Right column - Prepared for
      doc.fontSize(11).font('Helvetica-Oblique').fillColor('#666666')
        .text('Prepared for:', 320, detailsY);

      let rightY = detailsY + 20;
      doc.fontSize(11).font('Helvetica').fillColor('#333333')
        .text('Leaser Full Name', 320, rightY);
      rightY += 15;
      doc.font('Helvetica-Bold')
        .text(hire.customerName || 'N/A', 320, rightY);
      rightY += 22;
      doc.font('Helvetica').fillColor('#333333')
        .text('Phone number', 320, rightY);
      rightY += 15;
      doc.font('Helvetica-Bold')
        .text(hire.customerPhone || 'N/A', 320, rightY);
      rightY += 22;
      doc.font('Helvetica').fillColor('#333333')
        .text('Contact Email', 320, rightY);
      rightY += 15;
      doc.font('Helvetica-Bold')
        .text(hire.customerEmail || 'N/A', 320, rightY);

      // ─── PAGE 2: TERMS ───────────────────────────────────────
      doc.addPage();

      // Pink header
      doc.fontSize(16).font('Helvetica-Bold').fillColor(PINK)
        .text('TNT GENDER REVEAL IDEAS KIT \u2013 RENTAL AGREEMENT', 50, 50);
      doc.moveDown(0.8);

      // Two-column: Rental Items + Rental Term
      const col1X = 50;
      const col2X = 320;
      let sectionY = doc.y;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
        .text('Rental Item(s):', col1X, sectionY);
      doc.font('Helvetica').moveDown(0.2);
      const items = [
        `${mul(1)} x TNT Box`,
        `${mul(3)} x Extension Leads`,
        `${mul(3)} x Pressure Cannons`,
        `${mul(3)} x Pressure Cannon Power Cables`,
      ];
      items.forEach(item => {
        doc.text(`\u2022 ${item}`, col1X, doc.y, { width: 250 });
      });

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
        .text('Rental Term:', col2X, sectionY);
      doc.font('Helvetica');
      doc.text(`\u2022 Pick Up Date: ${dates.pickupFormatted}`, col2X, doc.y + 3, { width: 220 });
      doc.moveDown(0.3);
      doc.text(`\u2022 Return Date: ${dates.returnFormatted}`, col2X, doc.y, { width: 220 });
      doc.text('to: 2 Monaco St \u2013 Surfers Paradise', col2X, doc.y, { width: 220 });

      doc.moveDown(1.2);

      // ─── Rental Fee ───
      sectionHeading(doc, 'Rental Fee:');
      const fees = [
        `TNT Gender Reveal Kit${qty >= 2 ? ' (x2)' : ''}: $${kitPrice}`,
        `Bond/Security Deposit: $${bondAmount.toFixed(2)} and a valid credit card to keep on file until returned in safe conditions (refundable upon safe return of the product in original condition)`,
        'Every day after the due date of return will incur a $100.00 per day late fee.',
        'Standard hire duration: The item must be returned to the same location it was picked up from on the business day following the gender reveal. Late returns may incur additional fees.',
      ];
      fees.forEach(f => bullet(doc, f));
      doc.moveDown(0.5);

      // ─── Bond Terms ───
      sectionHeading(doc, 'Bond Terms:');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('The bond will be refunded within 10 business days of return, subject to inspection.', col1X, doc.y, { width: 495 });
      doc.text('Deductions may apply for damage, uncleaned items, missing parts, or late returns. We kindly ask that all items are returned ', col1X, doc.y, { width: 495, continued: true });
      doc.font('Helvetica-Bold').text('clean', { continued: true });
      doc.font('Helvetica').text(' and in the same condition as received.', { width: 495 });
      doc.moveDown(0.5);

      // ─── Renter Responsibilities ───
      sectionHeading(doc, 'Renter Responsibilities:');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('Ensure the TNT unit is used in a safe, secure, and appropriate outdoor location. Do not attempt to disassemble, modify or tamper with any equipment. Do not leave the unit unattended.', col1X, doc.y, { width: 495 });
      doc.text('Return all components clean and in working condition.', col1X, doc.y, { width: 495 });
      doc.moveDown(0.5);

      // ─── Damage, Loss or Theft ───
      sectionHeading(doc, 'Damage, Loss or Theft:');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('The Renter is fully responsible for the equipment during the rental period. Any damage, loss, or theft will result in full or partial forfeiture of the bond and/or additional charges.', col1X, doc.y, { width: 495 });
      doc.moveDown(0.5);

      // ─── Important Notice ───
      sectionHeading(doc, 'Important Notice');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('This is self\u2011hire equipment. We do not accept any liability for assembly, set\u2011up, or any malfunctions that may occur during use. All equipment is tested and confirmed to be in full working order prior to collection. Any performance issues on the day of your event are not our responsibility. Please ensure you watch the provided instructional videos carefully and contact us with any questions before use.', col1X, doc.y, { width: 495 });
      doc.text('The Renter acknowledges that they are using the equipment at their own risk and will take all safety precautions. By signing below, the Renter acknowledges and agrees to all the terms above.', col1X, doc.y, { width: 495 });
      doc.moveDown(0.5);

      // ─── Liability ───
      sectionHeading(doc, 'Liability:');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('The Company is not liable for any injury, damage, or claims resulting from the misuse of the TNT kit.', col1X, doc.y, { width: 495 });
      doc.moveDown(0.5);

      // ─── Cancellations & Refunds ───
      sectionHeading(doc, 'Cancellations & Refunds:');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('Any cancellations will not be refundable.', col1X, doc.y, { width: 495 });
      doc.moveDown(0.5);

      // ─── Cleaning & Return Condition ───
      sectionHeading(doc, 'Cleaning & Return Condition');
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text('All TNT equipment must be returned in the same clean condition it was provided. This means free from powder, residue, or debris of any kind. It is the client\u2019s responsibility to ensure the equipment is thoroughly cleaned before return.', col1X, doc.y, { width: 495 });
      doc.text('If equipment is returned dirty, marked, or with powder still on or inside it, the cleaning costs will be deducted from the bond, and the bond may be fully retained at our discretion.', col1X, doc.y, { width: 495 });
      doc.text('By hiring our TNT equipment, the client accepts full responsibility for returning it in a clean and proper condition.', col1X, doc.y, { width: 495 });
      doc.moveDown(1);

      // ─── Signature blocks ───
      const sigY = doc.y;

      // Left - Renter signature
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333');
      doc.text('Signature', col1X, sigY);
      doc.text('(Renter)', col1X, doc.y);
      doc.moveDown(0.5);

      if (hire.contractSignatureUrl && hire.contractSignatureUrl.startsWith('typed:')) {
        const signedName = hire.contractSignatureUrl.replace('typed:', '');
        doc.font('Helvetica').fontSize(10);
        doc.text(signedName, col1X, doc.y);
      } else {
        doc.moveTo(col1X, sigY + 50).lineTo(col1X + 200, sigY + 50).strokeColor('#333333').stroke();
      }

      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Date:', col1X, sigY + 60);
      if (hire.contractSignedAt) {
        doc.font('Helvetica').text(new Date(hire.contractSignedAt).toLocaleDateString('en-AU'), col1X + 40, sigY + 60);
      }

      // Right - Company signature
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Signature', col2X, sigY);
      doc.text('(Company Representative)', col2X, doc.y);
      doc.moveDown(0.5);

      const companyDate = hire.contractSignedAt
        ? new Date(hire.contractSignedAt).toLocaleDateString('en-AU')
        : new Date().toLocaleDateString('en-AU');
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text(`Date: ${companyDate}`, col2X, sigY + 60);

      // Footer logo
      if (hasLogo) {
        doc.image(LOGO_PATH, 50, 740, { width: 120 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Print a bold section heading */
function sectionHeading(doc, text) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333')
    .text(text, 50, doc.y);
  doc.moveDown(0.2);
}

/** Print a bullet point */
function bullet(doc, text) {
  doc.font('Helvetica').fontSize(10).fillColor('#333333')
    .text(`\u2022 ${text}`, 50, doc.y, { width: 495 });
}
