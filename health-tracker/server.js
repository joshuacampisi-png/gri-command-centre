// Vitals backend.
// - Serves the built PWA (dist/) in production.
// - Proxies the Oura Ring API v2 so her access token stays server-side.
// - Persists blood-test results to a local JSON file.
// - Gates everything behind a single PIN (this is private health data on a public URL).
//
// Single-user by design (her). No database — small JSON files on disk.

import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BLOOD_FILE = path.join(DATA_DIR, 'blood.json');
const PORT = process.env.PORT || 8787;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- tiny JSON store ----------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function getConfig() {
  return readJson(CONFIG_FILE, {});
}
function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  writeJson(CONFIG_FILE, next);
  return next;
}

// Ensure a server secret exists (used to sign the auth cookie).
(function ensureSecret() {
  const cfg = getConfig();
  if (!cfg.secret) setConfig({ secret: crypto.randomBytes(32).toString('hex') });
})();

// ---------- auth ----------
function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
function sessionToken() {
  const cfg = getConfig();
  // Token is bound to the pin hash, so changing the PIN invalidates old sessions.
  return crypto.createHmac('sha256', cfg.secret).update(cfg.pinHash || '').digest('hex');
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isAuthed(req) {
  const cfg = getConfig();
  if (!cfg.pinHash) return false;
  const token = parseCookies(req).vitals_auth;
  return token && token === sessionToken();
}
function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorised' });
  next();
}

// ---------- Oura API v2 ----------
const OURA_BASE = 'https://api.ouraring.com/v2/usercollection';

async function ouraGet(token, pathName, params = {}) {
  let out = [];
  let next = null;
  let guard = 0;
  do {
    const qs = new URLSearchParams(next ? { ...params, next_token: next } : params).toString();
    const res = await fetch(`${OURA_BASE}/${pathName}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = new Error(`Oura ${pathName} ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (Array.isArray(json.data)) {
      out = out.concat(json.data);
      next = json.next_token;
    } else {
      return json; // single object (e.g. personal_info)
    }
    guard += 1;
  } while (next && guard < 20);
  return out;
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function fetchAllOura(token, days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const s = isoDate(start);
  const e = isoDate(end);
  const range = { start_date: s, end_date: e };

  const safe = (p) => p.then((d) => d).catch((err) => ({ __error: err.status || err.message }));
  const list = (x) => (Array.isArray(x) ? x : []);

  const [
    sleepDaily,
    sleepDetail,
    readiness,
    activity,
    stress,
    spo2,
    resilience,
    cardioAge,
    vo2,
    workouts,
    info,
  ] = await Promise.all([
    safe(ouraGet(token, 'daily_sleep', range)),
    safe(ouraGet(token, 'sleep', range)),
    safe(ouraGet(token, 'daily_readiness', range)),
    safe(ouraGet(token, 'daily_activity', range)),
    safe(ouraGet(token, 'daily_stress', range)),
    safe(ouraGet(token, 'daily_spo2', range)),
    safe(ouraGet(token, 'daily_resilience', range)),
    safe(ouraGet(token, 'daily_cardiovascular_age', range)),
    safe(ouraGet(token, 'vO2_max', range)),
    safe(ouraGet(token, 'workout', range)),
    safe(ouraGet(token, 'personal_info')),
  ]);

  return {
    fetchedAt: Date.now(),
    window: { start: s, end: e, days },
    info: info && !info.__error ? info : null,
    sleepDaily: list(sleepDaily),
    sleepDetail: list(sleepDetail),
    readiness: list(readiness),
    activity: list(activity),
    stress: list(stress),
    spo2: list(spo2),
    resilience: list(resilience),
    cardioAge: list(cardioAge),
    vo2: list(vo2),
    workouts: list(workouts),
  };
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '1mb' }));

function setAuthCookie(res) {
  res.cookie('vitals_auth', sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
}

// Boot routing info — safe to call unauthenticated.
app.get('/api/state', (req, res) => {
  const cfg = getConfig();
  res.json({ hasPin: !!cfg.pinHash, authed: isAuthed(req) });
});

// Set PIN on first run, or verify it thereafter.
app.post('/api/login', (req, res) => {
  const { pin } = req.body || {};
  if (!pin || String(pin).length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  }
  const cfg = getConfig();
  if (!cfg.pinHash) {
    const salt = crypto.randomBytes(16).toString('hex');
    setConfig({ salt, pinHash: hashPin(pin, salt) });
  } else {
    if (hashPin(pin, cfg.salt) !== cfg.pinHash) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }
  }
  setAuthCookie(res);
  const c = getConfig();
  res.json({ ok: true, connected: !!c.ouraToken });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('vitals_auth');
  res.json({ ok: true });
});

app.get('/api/status', requireAuth, (req, res) => {
  const cfg = getConfig();
  res.json({ connected: !!cfg.ouraToken });
});

// Save (and verify) the Oura Personal Access Token.
app.post('/api/connect', requireAuth, async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const info = await ouraGet(token.trim(), 'personal_info');
    setConfig({ ouraToken: token.trim() });
    res.json({ ok: true, info });
  } catch (err) {
    const status = err.status || 500;
    const msg =
      status === 401
        ? 'Invalid Oura token'
        : status === 426
        ? 'This needs an active Oura membership'
        : `Could not verify token (${status})`;
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/connect', requireAuth, (req, res) => {
  setConfig({ ouraToken: null });
  res.json({ ok: true });
});

// Aggregated Oura data for the dashboard.
app.get('/api/oura', requireAuth, async (req, res) => {
  const cfg = getConfig();
  if (!cfg.ouraToken) return res.status(409).json({ error: 'not_connected' });
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
  try {
    const data = await fetchAllOura(cfg.ouraToken, days);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Oura fetch failed' });
  }
});

// ---------- blood results ----------
function getBloods() {
  return readJson(BLOOD_FILE, []);
}
function uid() {
  return crypto.randomBytes(8).toString('hex');
}

app.get('/api/bloods', requireAuth, (req, res) => {
  res.json(getBloods());
});

app.post('/api/bloods', requireAuth, (req, res) => {
  const incoming = Array.isArray(req.body?.results) ? req.body.results : null;
  if (!incoming) return res.status(400).json({ error: 'results array required' });
  const all = getBloods();
  const stamped = incoming
    .filter((r) => r && r.markerId && r.date && r.value != null && !isNaN(Number(r.value)))
    .map((r) => ({
      id: uid(),
      createdAt: Date.now(),
      markerId: r.markerId,
      value: Number(r.value),
      unit: r.unit || '',
      date: r.date,
      lab: r.lab || undefined,
      note: r.note || undefined,
    }));
  writeJson(BLOOD_FILE, all.concat(stamped));
  res.json({ ok: true, added: stamped.length });
});

app.delete('/api/bloods/:id', requireAuth, (req, res) => {
  const all = getBloods();
  writeJson(BLOOD_FILE, all.filter((r) => r.id !== req.params.id));
  res.json({ ok: true });
});

// ---------- static (prod) ----------
const DIST = path.join(__dirname, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback for client-side routes.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Vitals server on http://localhost:${PORT}`);
});
