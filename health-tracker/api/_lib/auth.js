// PIN auth + config, shared by every serverless function and the local server.
import crypto from 'node:crypto';
import { getKey, setKey } from './store.js';

export async function getConfig() {
  return (await getKey('config', {})) || {};
}
export async function setConfig(patch) {
  const next = { ...(await getConfig()), ...patch };
  await setKey('config', next);
  return next;
}
export async function ensureSecret() {
  const cfg = await getConfig();
  if (cfg.secret) return cfg;
  return setConfig({ secret: crypto.randomBytes(32).toString('hex') });
}

export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
// Session token is bound to the pin hash, so changing the PIN invalidates sessions.
export function tokenFor(cfg) {
  return crypto.createHmac('sha256', cfg.secret || '').update(cfg.pinHash || '').digest('hex');
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers?.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function isAuthed(req) {
  const cfg = await getConfig();
  if (!cfg.pinHash) return false;
  const t = parseCookies(req).vitals_auth;
  return !!t && t === tokenFor(cfg);
}

export function cookieHeader(cfg) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  return `vitals_auth=${tokenFor(cfg)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`;
}
export const clearCookieHeader = 'vitals_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';

// Guard helper: returns true if the response was already ended with 401.
export async function denyIfUnauthed(req, res) {
  if (await isAuthed(req)) return false;
  res.status(401).json({ error: 'unauthorised' });
  return true;
}
