// Local dev / self-hosted server. Wraps the SAME serverless handlers used on
// Vercel (api/*.js) behind Express, and serves the built PWA from dist/.
// On Vercel these handlers run directly as functions and this file is unused.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import state from './api/state.js';
import login from './api/login.js';
import logout from './api/logout.js';
import status from './api/status.js';
import connect from './api/connect.js';
import oura from './api/oura.js';
import bloodsIndex from './api/bloods/index.js';
import bloodsId from './api/bloods/[id].js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

const app = express();
app.use(express.json({ limit: '1mb' }));

// Adapt a Vercel-style handler to Express, catching async errors.
const h = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'server error' });
  });

app.all('/api/state', h(state));
app.post('/api/login', h(login));
app.post('/api/logout', h(logout));
app.get('/api/status', h(status));
app.post('/api/connect', h(connect));
app.delete('/api/connect', h(connect));
app.get('/api/oura', h(oura));
app.get('/api/bloods', h(bloodsIndex));
app.post('/api/bloods', h(bloodsIndex));
app.delete('/api/bloods/:id', (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return h(bloodsId)(req, res);
});

const DIST = path.join(__dirname, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Vitals server on http://localhost:${PORT}`));
