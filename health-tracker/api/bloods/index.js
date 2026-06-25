import crypto from 'node:crypto';
import { denyIfUnauthed } from '../_lib/auth.js';
import { getKey, setKey } from '../_lib/store.js';

const KEY = 'bloods';

// GET  → all results.  POST { results: [...] } → append.
export default async function handler(req, res) {
  if (await denyIfUnauthed(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json((await getKey(KEY, [])) || []);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const incoming = Array.isArray(req.body?.results) ? req.body.results : null;
  if (!incoming) return res.status(400).json({ error: 'results array required' });

  const all = (await getKey(KEY, [])) || [];
  const stamped = incoming
    .filter((r) => r && r.markerId && r.date && r.value != null && !isNaN(Number(r.value)))
    .map((r) => ({
      id: crypto.randomBytes(8).toString('hex'),
      createdAt: Date.now(),
      markerId: r.markerId,
      value: Number(r.value),
      unit: r.unit || '',
      date: r.date,
      lab: r.lab || undefined,
      note: r.note || undefined,
    }));
  await setKey(KEY, all.concat(stamped));
  res.status(200).json({ ok: true, added: stamped.length });
}
