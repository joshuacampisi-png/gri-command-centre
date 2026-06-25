import { denyIfUnauthed } from '../_lib/auth.js';
import { getKey, setKey } from '../_lib/store.js';

const KEY = 'bloods';

// DELETE /api/bloods/:id → remove one result.
export default async function handler(req, res) {
  if (await denyIfUnauthed(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'method not allowed' });
  const id = req.query.id;
  const all = (await getKey(KEY, [])) || [];
  await setKey(KEY, all.filter((r) => r.id !== id));
  res.status(200).json({ ok: true });
}
