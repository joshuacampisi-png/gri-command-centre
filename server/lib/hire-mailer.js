import nodemailer from 'nodemailer';
import dns from 'dns';
import { getHireDates } from './date-helpers.js';

// Force IPv4 to avoid IPv6 ENETUNREACH on some hosts
dns.setDefaultResultOrder('ipv4first');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    // Try explicit SMTP config with multiple fallback approaches
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 30000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
      // Force IPv4
      family: 4,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
}

function getFromAddress() {
  const name = process.env.GMAIL_FROM_NAME || 'Gender Reveal Ideas';
  const email = process.env.GMAIL_USER || 'hello@genderrevealideas.com.au';
  return `"${name}" <${email}>`;
}

/**
 * Fallback: send email content to Josh via Telegram when SMTP fails.
 */
async function telegramFallback(type, hire, subject, text, error) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_JOSH_CHAT_ID;
  if (!token || !chatId) return;

  const msg = `⚠️ EMAIL FAILED — sent via Telegram instead\n\nType: ${type}\nTo: ${hire.customerEmail}\nSubject: ${subject}\nError: ${error}\n\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    });
  } catch (e) {
    console.error('[hire-mailer] Telegram fallback failed:', e.message);
  }
}

function firstName(hire) {
  return hire.customerName.split(' ')[0];
}

function buildConfirmationEmail(hire) {
  const name = firstName(hire);
  const dates = getHireDates(hire.eventDate);

  return {
    subject: `TNT Kit Collection and Return Details — ${hire.orderNumber}`,
    text: `Hi ${name},

Thank you for renting our TNT KIT.

The TNT kit must be collected ${dates.pickupFormatted} from our local store at 2 Monaco Street, Surfers Paradise between 7 a.m. and 2 p.m.

Please follow the link below to watch the YouTube setup video, which provides clear, step by step instructions on how to set up the TNT kit:

https://www.youtube.com/shorts/Uuzvdlf_13M

The TNT kit must be returned on ${dates.returnFormatted} at 2 Monaco Street, Surfers Paradise before 2:00 pm, in the same condition it was provided. All items should be clean, fully functional, and free from scratches.

Please note: A $${(hire.kitQty || 1) >= 2 ? '400' : '200'} bond is held on a credit card during purchase. You will receive a separate email shortly with a secure link to submit your bond payment.

Once the kit is returned in the correct condition, the bond will be refunded to the card on file.

We hope you have an amazing gender reveal party, it is designed to make your moment truly unforgettable.

Have a lovely day, and please do not hesitate to reach out if you need anything else.

Thank you.`,
  };
}

function buildBondLinkEmail(hire, extraData) {
  const name = firstName(hire);
  const paymentUrl = extraData;
  const bondStr = (hire.kitQty || 1) >= 2 ? '$400' : '$200';

  return {
    subject: `Your ${bondStr} TNT Bond Payment — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Please use the secure link below to pay your ${bondStr} refundable bond for your TNT kit hire:

${paymentUrl}

This bond is fully refundable once the kit is returned in good condition.

If you have any questions, reply to this email or call us on 0406860077.

Thank you.

Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildRefundEmail(hire) {
  const name = firstName(hire);

  return {
    subject: `Your TNT Bond Has Been Refunded — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Thank you for returning your TNT kit in great condition.

We have processed your $${(hire.kitQty || 1) >= 2 ? '400' : '200'} bond refund. Please allow 3 to 5 business days for the amount to appear back on your card, depending on your bank.

We hope your gender reveal was truly special. If you have a moment, we would love to hear how it went.

Thank you.

Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildWithheldEmail(hire) {
  const name = firstName(hire);

  return {
    subject: `Important: Your TNT Bond Has Been Withheld — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Thank you for returning your TNT kit.

Following our inspection, we have identified damage or an issue with the returned equipment. As per the hire terms and conditions, your $${(hire.kitQty || 1) >= 2 ? '400' : '200'} bond has been withheld to cover the cost of repair or replacement.

If you would like to discuss this further, please reply to this email and our team will be in touch within 1 business day.

Thank you.

Gender Reveal Ideas Team
genderrevealideas.com.au`,
  };
}

function buildContractEmail(hire, extraData) {
  const name = firstName(hire);
  const dates = getHireDates(hire.eventDate);
  const signingUrl = extraData;

  return {
    subject: `TNT Hire Contract — Please Sign Before Collection — Order ${hire.orderNumber}`,
    text: `Hi ${name},

Before collecting the TNT kit on ${dates.pickupFormatted}, you must sign the hire contract.

Please use the link below to review and sign the agreement online:

${signingUrl}

This only takes a moment. The contract must be signed before your collection day.

If you have any questions, reply to this email or call us on 0406860077.

Thank you.

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

/**
 * Send an email to a hire customer via Gmail SMTP.
 * Falls back to Telegram notification if SMTP fails.
 * @param {string} type - confirmation | bond_link | refund | withheld | contract
 * @param {object} hire - the hire record
 * @param {*} [extraData] - payment URL for bond_link, signing URL for contract
 * @returns {{ messageId: string }}
 */
export async function sendHireEmail(type, hire, extraData) {
  const builder = TEMPLATES[type];
  if (!builder) throw new Error(`Unknown email type: ${type}`);

  const { subject, text } = builder(hire, extraData);

  try {
    const info = await getTransporter().sendMail({
      from: getFromAddress(),
      to: hire.customerEmail,
      subject,
      text,
    });

    console.log(`[hire-mailer] Sent ${type} email to ${hire.customerEmail} — messageId: ${info.messageId}`);
    return { messageId: info.messageId };
  } catch (smtpErr) {
    console.error(`[hire-mailer] SMTP failed for ${type} to ${hire.customerEmail}:`, smtpErr.message);

    // Reset transporter so next attempt creates a fresh connection
    transporter = null;

    // Telegram fallback — notify Josh with the email content
    await telegramFallback(type, hire, subject, text, smtpErr.message);
    return { messageId: `telegram-fallback-${Date.now()}` };
  }
}
