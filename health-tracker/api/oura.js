import { getConfig, denyIfUnauthed } from './_lib/auth.js';
import { fetchAllOura } from './_lib/oura.js';

// Aggregated Oura data for the dashboard.
export default async function handler(req, res) {
  if (await denyIfUnauthed(req, res)) return;
  const cfg = await getConfig();
  if (!cfg.ouraToken) return res.status(409).json({ error: 'not_connected' });
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
  try {
    res.status(200).json(await fetchAllOura(cfg.ouraToken, days));
  } catch (err) {
    res.status(502).json({ error: err.message || 'Oura fetch failed' });
  }
}
