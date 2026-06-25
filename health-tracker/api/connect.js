import { setConfig, denyIfUnauthed } from './_lib/auth.js';
import { ouraGet } from './_lib/oura.js';

// POST  → verify + save the Oura Personal Access Token.
// DELETE → forget it.
export default async function handler(req, res) {
  if (await denyIfUnauthed(req, res)) return;

  if (req.method === 'DELETE') {
    await setConfig({ ouraToken: null });
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const info = await ouraGet(token.trim(), 'personal_info');
    await setConfig({ ouraToken: token.trim() });
    res.status(200).json({ ok: true, info });
  } catch (err) {
    const status = err.status || 500;
    const msg =
      status === 401 ? 'Invalid Oura token'
      : status === 426 ? 'This needs an active Oura membership'
      : `Could not verify token (${status})`;
    res.status(400).json({ error: msg });
  }
}
