/**
 * balloon-mailer.js
 * Email templates + sender for Helium Balloon Box hires.
 * Reuses the same Resend HTTP / Gmail SMTP / Telegram-fallback transport
 * pattern as hire-mailer.js but with balloon-box-specific copy.
 */
import nodemailer from 'nodemailer';
import { getHireDates } from './date-helpers.js';

let _transport = null;
let _provider = null;

function getTransport() {
  if (_transport) return _transport;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const resendKey = process.env.RESEND_API_KEY;
  if (gmailUser && gmailPass) {
    _provider = 'gmail';
    _transport = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
  } else if (resendKey) {
    _provider = 'resend';
    _transport = nodemailer.createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: resendKey } });
  } else {
    throw new Error('No email provider configured — set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY');
  }
  return _transport;
}

function getFromAddress() {
  const name = process.env.GMAIL_FROM_NAME || 'Gender Reveal Ideas';
  if (_provider === 'resend') {
    const email = process.env.RESEND_FROM_EMAIL || process.env.GMAIL_USER || 'hello@genderrevealideas.com.au';
    return `${name} <${email}>`;
  }
  const email = process.env.GMAIL_USER || 'hello@genderrevealideas.com.au';
  return `${name} <${email}>`;
}

async function telegramFallback(type, hire, subject, text, error) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_JOSH_CHAT_ID;
  if (!token || !chatId) return;
  const msg = `⚠️ BALLOON EMAIL FAILED\n\nType: ${type}\nTo: ${hire.customerEmail}\nSubject: ${subject}\nError: ${error}\n\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
  } catch (e) { console.error('[balloon-mailer] Telegram fallback failed:', e.message); }
}

function firstName(hire) { return (hire.customerName || 'there').split(' ')[0]; }

function bondAmount(hire) {
  // $200 × boxQty — bond scales with how many boxes the customer hires.
  const base = parseInt(process.env.BALLOON_BOND_AMOUNT || '200', 10);
  return base * (hire.boxQty || 1);
}

// Balloon-box uses SAME DAY pickup, NEXT DAY return (helium deflates ~24h).
function balloonHireDates(eventDate) {
  if (!eventDate) return { pickupFormatted: 'TBC', eventFormatted: 'TBC', returnFormatted: 'TBC' };
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ord = d => { if (d>=11 && d<=13) return d+'th'; switch (d%10){case 1:return d+'st';case 2:return d+'nd';case 3:return d+'rd';default:return d+'th'} };
  const parse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
  const fmt = s => { const dt=parse(s); return `${DAYS[dt.getDay()]}, ${ord(dt.getDate())} ${MONTHS[dt.getMonth()]}`; };
  const addD = (s,n) => { const dt=parse(s); dt.setDate(dt.getDate()+n); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; };
  return {
    pickupFormatted: fmt(eventDate),
    eventFormatted: fmt(eventDate),
    returnFormatted: fmt(addD(eventDate, 1)),
  };
}

function buildConfirmationEmail(hire) {
  const name = firstName(hire);
  const dates = balloonHireDates(hire.eventDate);
  const colorLine = hire.boxColor ? ` (${hire.boxColor.toUpperCase()} balloons)` : '';
  return {
    subject: `Helium Balloon Box Collection and Return Details — ${hire.orderNumber}`,
    text: `Hi ${name},

Thank you for hiring our Luxury Gender Reveal Helium Balloon Box${colorLine}.

IMPORTANT — same-day use only:
This box is built for same-day pickup and same-day reveal. Helium balloons naturally lose lift over time, so we can only guarantee performance on the day of pickup. If you choose to collect the day before, you do so at your own risk and we cannot be held responsible for deflated balloons or any performance issues.

Your box will be ready for pickup on the day you've selected — ${dates.pickupFormatted} — from 2 Monaco Street, Surfers Paradise. Collect any time during business hours.
Return: ${dates.returnFormatted} (the next day) to the same address — please bring back the box undamaged with the balloon weight inside.

Late return: $100 per day late fee deducted from your bond.

A $${bondAmount(hire)} refundable bond is held against the hire. You will receive a separate email shortly with a secure link to pay your bond.

Once our team has inspected the box on return and confirmed no damage or water damage, your bond is refunded. Funds normally appear in your account 4–7 days after the refund is processed.

Have a beautiful reveal — please reach out if you need anything.

Thank you,
Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildBondLinkEmail(hire, paymentUrl) {
  const name = firstName(hire);
  const bondStr = `$${bondAmount(hire)}`;
  return {
    subject: `Your ${bondStr} Balloon Box Bond Payment — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Please use the secure link below to pay your ${bondStr} refundable bond for your Helium Balloon Box hire:

${paymentUrl}

This bond is fully refundable once the box and all components are returned in good condition.

If you have any questions, reply to this email or call us on 0406 860 077.

Thank you,
Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildContractEmail(hire, signingUrl) {
  const name = firstName(hire);
  const dates = balloonHireDates(hire.eventDate);
  return {
    subject: `Balloon Box Hire Contract — Please Sign Before Collection — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Before collecting your Helium Balloon Box on ${dates.pickupFormatted} (same day as your event), please sign the hire contract using the link below:

${signingUrl}

The contract confirms you've read and accepted:
• Same-day pickup only — we are not responsible for deflated balloons if collected earlier
• Bring the box back undamaged with the balloon weight inside, the next day
• Any damage or water damage = bond forfeited
• Late return = $100 per day

It only takes a moment. The contract must be signed before your collection day.

Reply to this email or call us on 0406 860 077 if you need any help.

Thank you,
Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildRefundEmail(hire) {
  const name = firstName(hire);
  return {
    subject: `Your Balloon Box Bond Has Been Refunded — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Thank you for returning your Helium Balloon Box. Our team has inspected the box and confirmed no damage.

We have processed your $${bondAmount(hire)} bond refund. Funds normally appear back in your account 4–7 days after we process the refund, depending on your bank.

We hope your reveal was truly special. If you have a moment, we would love to hear how it went.

Thank you,
Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildWithheldEmail(hire) {
  const name = firstName(hire);
  return {
    subject: `Important: Your Balloon Box Bond Has Been Withheld — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Thank you for returning your Helium Balloon Box hire.

Following our inspection, we identified damage or a missing component. As per the hire terms and conditions, your $${bondAmount(hire)} bond has been withheld to cover the cost of repair or replacement.

If you would like to discuss this further, please reply to this email and our team will be in touch within 1 business day.

Thank you,
Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

const TEMPLATES = {
  confirmation: buildConfirmationEmail,
  bond_link: buildBondLinkEmail,
  refund: buildRefundEmail,
  withheld: buildWithheldEmail,
  contract: buildContractEmail,
};

async function sendViaResendHttp({ from, to, bcc, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, bcc, subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${body.message || body.error || JSON.stringify(body).slice(0, 200)}`);
  return { messageId: body.id || `resend-${Date.now()}` };
}

export async function sendBalloonEmail(type, hire, extraData) {
  const builder = TEMPLATES[type];
  if (!builder) throw new Error(`Unknown email type: ${type}`);
  const { subject, text } = builder(hire, extraData);
  const bcc = process.env.GMAIL_USER || process.env.RESEND_FROM_EMAIL || 'hello@genderrevealideas.com.au';

  if (process.env.RESEND_API_KEY) {
    try {
      const fromName = process.env.GMAIL_FROM_NAME || 'Gender Reveal Ideas';
      const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.GMAIL_USER || 'hello@genderrevealideas.com.au';
      const from = `${fromName} <${fromEmail}>`;
      const result = await sendViaResendHttp({ from, to: hire.customerEmail, bcc, subject, text });
      console.log(`[balloon-mailer] Sent ${type} via Resend HTTP to ${hire.customerEmail} — id: ${result.messageId}`);
      return result;
    } catch (err) {
      console.error(`[balloon-mailer] Resend HTTP failed for ${type}: ${err.message} — falling back to SMTP`);
    }
  }
  try {
    const transport = getTransport();
    const info = await transport.sendMail({ from: getFromAddress(), to: hire.customerEmail, bcc, subject, text });
    console.log(`[balloon-mailer] Sent ${type} via ${_provider} SMTP to ${hire.customerEmail} — id: ${info.messageId}`);
    return { messageId: info.messageId };
  } catch (err) {
    console.error(`[balloon-mailer] SMTP failed for ${type}:`, err.message);
    await telegramFallback(type, hire, subject, text, err.message);
    return { messageId: `telegram-fallback-${Date.now()}` };
  }
}
