import { readFileSync, writeFileSync, renameSync } from 'fs';
import { dataFile } from './data-dir.js';

// Routes through dataFile() so writes hit Railway's persistent volume.
// Without this, staff-entered hires die on every redeploy (the Docker
// image's /app/data/ is shadowed by the volume mount at runtime).
const DATA_FILE = dataFile('tnt-hires.json');

function readHires() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeHires(hires) {
  // Atomic write: tmp → rename. Prevents partial-file corruption if a
  // concurrent request lands mid-write.
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
  const id = 'H' + Date.now().toString(36).toUpperCase();
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
    kitQty: hire.kitQty || 1,
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
