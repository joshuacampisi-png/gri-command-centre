import { env } from './env.js';

// Mirror of tnt-telegram.js — same recipients, balloon-specific copy.
const BALLOON_CHAT_IDS = [
  env.telegram.joshChatId || '8040702286',  // Josh
  '5113119463',                               // Staff
];

function bondAmount(hire) {
  const base = parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10);
  return base * (hire.boxQty || 1);
}

/**
 * Send a Telegram notification about a Helium Balloon Box hire event.
 * @param {'order_created'|'bond_paid'|'contract_signed'|'refund_failed'} event
 * @param {object} hire
 */
export async function notifyBalloonEvent(event, hire) {
  if (!env.telegram.botToken) return;

  const aest = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' });
  let text = '';

  if (event === 'order_created') {
    text = [
      `\u{1F388} *NEW BALLOON BOX HIRE*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Email: ${hire.customerEmail}`,
      `Phone: ${hire.customerPhone || 'N/A'}`,
      `Event Date: ${hire.eventDate || 'NOT SET'}`,
      `Color: ${(hire.boxColor || 'unspecified').toUpperCase()}`,
      `Boxes: ${hire.boxQty || 1}`,
      ``,
      `Status: Auto-created \u2705`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  } else if (event === 'bond_paid') {
    text = [
      `\u{1F4B0} *BALLOON BOND PAID*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Amount: $${bondAmount(hire).toFixed(2)} AUD`,
      ``,
      `Contract e-sign link auto-sent \u2709\uFE0F`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  } else if (event === 'contract_signed') {
    text = [
      `\u270D\uFE0F *BALLOON CONTRACT SIGNED*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Signed by: ${hire.contractSignatureUrl ? hire.contractSignatureUrl.replace('typed:', '') : hire.customerName}`,
      ``,
      `Box is READY for pickup \u2705`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  } else if (event === 'refund_failed') {
    text = [
      `\u{26A0}\uFE0F *BALLOON REFUND FAILED*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Refund ID: ${hire.refundId || 'n/a'}`,
      `Status: ${hire.refundStatus || 'unknown'}`,
      ``,
      `Action: process manually in Square dashboard.`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  }

  if (!text) return;

  const results = await Promise.allSettled(
    BALLOON_CHAT_IDS.map(chatId =>
      fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      })
    )
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[balloon-telegram] ${event} for ${hire.orderNumber} — sent: ${sent}/${results.length}`);
}
