# Vitals — health tracker (installable PWA)

A mobile-first, installable web app (Add to Home Screen) that pulls **live Oura Ring
data** and tracks **historic blood tests**, then surfaces plain-language insights across
both. Built on the same stack as the rest of the repo: **Vite + React** frontend, a small
**Node/Express** backend, deployable on Railway.

## Why a PWA + tiny backend

- **Installs like an app** — open the URL on her iPhone/Android, *Add to Home Screen*, and
  it runs full-screen with its own icon. No App Store needed.
- **Her Oura token stays server-side.** The Oura API doesn't allow direct browser calls
  (CORS), and a token shouldn't live in the browser anyway. The Express backend holds it
  and proxies requests.
- **Private by default.** All data (Oura token, blood results) lives in small JSON files
  on the server, behind a **PIN** she sets on first launch.

## Features

- **Today** — readiness / sleep / activity rings, last night's HRV, resting HR, temperature
  deviation, SpO₂, respiratory rate, today's stress load, and the top insights.
- **Sleep** — sleep stages (deep/REM/light/awake), efficiency, latency, overnight HRV & HR,
  plus trends.
- **Body** — HRV, resting HR, temperature deviation, SpO₂, steps, resilience, VO₂ max and
  cardiovascular age, each trended.
- **Bloods** — enter results against a built-in reference library (~45 markers, Australian
  units). Out-of-range values are flagged; every marker is tracked over time.
- **Insights** — correlates Oura trends with blood markers (e.g. low ferritin alongside an
  elevated resting heart rate; low vitamin D vs sleep quality).

> Not a medical device. Reference ranges are general adult guides and vary by lab, age and
> cycle phase — always defer to the ranges on her actual report.

## Run it locally

```bash
cd health-tracker
npm install
npm run dev        # Vite UI on :5173, API on :8787 (Vite proxies /api → :8787)
```

Open <http://localhost:5173>. First launch: set a PIN, then paste her Oura **Personal
Access Token** (from <https://cloud.ouraring.com/personal-access-tokens>).

## Build & serve (production)

```bash
npm run build      # emits dist/
npm start          # Express serves dist/ + the API on $PORT (default 8787)
```

### Deploy on Vercel (gives the shareable link)

The backend ships as Vercel **serverless functions** (`api/*.js`) — the same handlers the
local server wraps — so it deploys on Vercel with no separate service.

1. **Import the repo** in Vercel → set **Root Directory** to `health-tracker`. Vercel
   auto-detects Vite (build `npm run build`, output `dist`) and deploys `api/` as functions.
2. **Add persistent storage** (important). Vercel's filesystem is ephemeral, so add a KV
   store: project → **Storage → Create → KV** (free tier) and connect it. That injects
   `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the store layer picks up automatically.
   *Without KV the app still runs, but her PIN, token and blood results reset on cold
   starts* (`/api/status` reports `persistence: "ephemeral"` in that case, `"kv"` when set).
3. **Redeploy**, then open the Vercel URL on her phone → *Add to Home Screen*.

First launch: set a PIN, then paste her Oura Personal Access Token.

### Deploy on Railway (alternative)

1. New service from this repo, **root directory** `health-tracker`.
2. Build command `npm install && npm run build`, start command `npm start`.
3. Set `NODE_ENV=production` (so the auth cookie is Secure). Railway provides `PORT`.
4. Attach a volume at `health-tracker/data/` so the JSON store survives redeploys.

## Notes / next steps

- Blood results are entered manually today. Natural next step: **photo/PDF import** of
  pathology reports with OCR to auto-fill markers.
- The insights engine (`src/lib/insights.js`) is deterministic and easy to extend; an
  optional AI layer could be added later.
- Single-user by design (her). The PIN protects the deployed URL.

## Project layout

```
health-tracker/
  api/                   Vercel serverless functions (also wrapped by server.js locally)
    _lib/                store (KV/file), auth (PIN), oura (API v2) — shared core
    state|login|logout|status|connect|oura.js
    bloods/index.js      GET list + POST add
    bloods/[id].js       DELETE one
  vercel.json            framework + SPA rewrite
  server.js              Express adapter over api/* for local dev + self-host; serves dist/
  index.html             PWA shell (manifest + iOS meta)
  public/                manifest.webmanifest, service worker, icons
  src/
    lib/                 api client, Oura selectors, blood markers, insights, stats, dates
    components/          Ring, TrendChart, shared UI, TabBar
    pages/               Login, Connect, Today, Sleep, Body, Bloods, BloodDetail, BloodEntry, Insights, Settings
    state/useOura.js     backend-backed Oura loader with localStorage cache
    App.jsx              auth/connect gate + tab routing
```
