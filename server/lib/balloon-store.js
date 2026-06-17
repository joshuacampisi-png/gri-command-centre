import { readFileSync, writeFileSync, renameSync } from 'fs';
import { dataFile } from './data-dir.js';

/**
 * balloon-store.js
 * Persistence layer for Gender Reveal Helium Balloon Box hires.
 * Parallel to hire-store.js (TNT) — same shape, separate file.
 * Routes through dataFile() so hires survive Railway redeploys.
 */
const DATA_FILE = dataFile('balloon-hires.json');

function readHires() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeHires(hires) {
  // Atomic write: tmp → rename. Prevents partial-file corruption.
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(hires, null, 2));
  renameSync(tmp, DATA_FILE);
}

export function getAll() {
  return readHires();
}

export function getById(id) {
  return readHires().find(h => h.id === id) || null;
}

export function create(hire) {
  const hires = readHires();
  const id = 'B' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const record = {
    id,
    orderNumber: hire.orderNumber,
    customerName: hire.customerName,
    customerEmail: hire.customerEmail,
    customerPhone: hire.customerPhone || '',
    eventDate: hire.eventDate,
    status: 'confirmed',
    bondStatus: 'pending',
    bondPaymentId: null,
    bondPaymentLinkId: null,
    bondPaymentUrl: null,
    bondOrderId: null,
    bondOutcome: null,
    boxQty: hire.boxQty || 1,
    boxColor: hire.boxColor || null, // pink | blue | secret
    revenue: hire.revenue || 0,
    contractStatus: 'not_sent',
    contractSignedAt: null,
    contractSignatureUrl: null,
    emailSent: false,
    confirmationSentAt: null,
    bondPaidAt: null,
    contractSentAt: null,
    pickedUpAt: null,
    returnedAt: null,
    bondOutcomeAt: null,
    productType: 'balloon-box',
    createdAt: now,
    updatedAt: now,
  };
  hires.unshift(record);
  writeHires(hires);
  return record;
}

export function clearAll() {
  writeHires([]);
}

export function update(id, changes) {
  const hires = readHires();
  const idx = hires.findIndex(h => h.id === id);
  if (idx === -1) return null;
  hires[idx] = { ...hires[idx], ...changes, updatedAt: new Date().toISOString() };
  writeHires(hires);
  return hires[idx];
}
