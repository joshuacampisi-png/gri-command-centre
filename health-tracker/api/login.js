import crypto from 'node:crypto';
import { getConfig, setConfig, ensureSecret, hashPin, cookieHeader } from './_lib/auth.js';

// Set the PIN on first run, or verify it thereafter; issues the auth cookie.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { pin } = req.body || {};
  if (!pin || String(pin).length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  }
  await ensureSecret();
  let cfg = await getConfig();
  if (!cfg.pinHash) {
    const salt = crypto.randomBytes(16).toString('hex');
    cfg = await setConfig({ salt, pinHash: hashPin(pin, salt) });
  } else if (hashPin(pin, cfg.salt) !== cfg.pinHash) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  res.setHeader('Set-Cookie', cookieHeader(cfg));
  res.status(200).json({ ok: true, connected: !!cfg.ouraToken });
}
