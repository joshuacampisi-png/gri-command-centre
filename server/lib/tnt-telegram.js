import { env } from './env.js';

// All chat IDs that receive TNT hire notifications
const TNT_CHAT_IDS = [
  env.telegram.joshChatId || '8040702286',  // Josh
  '5113119463',                               // Staff
];

/**
 * Send a Telegram notification about a TNT hire event to all recipients.
 * @param {'order_created'|'bond_paid'|'contract_signed'} event
 * @param {object} hire
 */
export async function notifyTNTEvent(event, hire) {
  if (!env.telegram.botToken) return;

  const aest = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' });
  let text = '';

  if (event === 'order_created') {
    text = [
      `\u{1F3AF} *NEW TNT HIRE ORDER*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Email: ${hire.customerEmail}`,
      `Phone: ${hire.customerPhone || 'N/A'}`,
      `Event Date: ${hire.eventDate || 'NOT SET'}`,
      ``,
      `Status: Auto-created \u2705`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  } else if (event === 'bond_paid') {
    const amount = (hire.kitQty || 1) >= 2 ? 400 : 200;
    text = [
      `\u{1F4B0} *BOND PAID*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Amount: $${amount.toFixed(2)} AUD`,
      ``,
      `Contract e-sign link auto-sent \u2709\uFE0F`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  } else if (event === 'contract_signed') {
    text = [
      `\u270D\uFE0F *CONTRACT SIGNED*`,
      ``,
      `Time: ${aest} AEST`,
      `Order: ${hire.orderNumber}`,
      `Customer: ${hire.customerName}`,
      `Signed by: ${hire.contractSignatureUrl ? hire.contractSignatureUrl.replace('typed:', '') : hire.customerName}`,
      ``,
      `Kit is READY for pickup \u2705`,
      `\u2014 Pablo Escobot`,
    ].join('\n');
  }

  if (!text) return;

  // Send to all recipients in parallel
  const results = await Promise.allSettled(
    TNT_CHAT_IDS.map(chatId =>
      fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`[tnt-telegram] ${event} notification for ${hire.orderNumber} — sent: ${sent}, failed: ${failed}`);
}
