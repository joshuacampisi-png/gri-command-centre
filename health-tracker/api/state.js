import { getConfig, isAuthed } from './_lib/auth.js';

// Boot routing info — safe to call unauthenticated.
export default async function handler(req, res) {
  const cfg = await getConfig();
  res.status(200).json({ hasPin: !!cfg.pinHash, authed: await isAuthed(req) });
}
