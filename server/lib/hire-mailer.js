import { Resend } from 'resend';
import { getHireDates } from './date-helpers.js';

let resendClient = null;

function getClient() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function getFromAddress() {
  const name = process.env.GMAIL_FROM_NAME || 'Gender Reveal Ideas';
  // Use verified domain sender, or fall back to Resend test sender
  const email = process.env.RESEND_FROM_EMAIL || process.env.GMAIL_USER || 'onboarding@resend.dev';
  return `${name} <${email}>`;
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
 * Send an email to a hire customer via Resend HTTP API.
 * @param {string} type - confirmation | bond_link | refund | withheld | contract
 * @param {object} hire - the hire record
 * @param {*} [extraData] - payment URL for bond_link, signing URL for contract
 * @returns {{ messageId: string }}
 */
export async function sendHireEmail(type, hire, extraData) {
  const builder = TEMPLATES[type];
  if (!builder) throw new Error(`Unknown email type: ${type}`);

  const { subject, text } = builder(hire, extraData);

  const { data, error } = await getClient().emails.send({
    from: getFromAddress(),
    to: hire.customerEmail,
    subject,
    text,
  });

  if (error) {
    console.error(`[hire-mailer] Resend error for ${type} to ${hire.customerEmail}:`, error);
    throw new Error(error.message || 'Resend email failed');
  }

  console.log(`[hire-mailer] Sent ${type} email to ${hire.customerEmail} — messageId: ${data.id}`);

  return { messageId: data.id };
}
