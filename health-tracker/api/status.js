import { getConfig, denyIfUnauthed } from './_lib/auth.js';
import { persistenceMode } from './_lib/store.js';

export default async function handler(req, res) {
  if (await denyIfUnauthed(req, res)) return;
  const cfg = await getConfig();
  res.status(200).json({ connected: !!cfg.ouraToken, persistence: persistenceMode });
}
