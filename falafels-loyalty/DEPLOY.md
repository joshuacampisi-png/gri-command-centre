# Deploying Falafels Loyalty + connecting falafelsloyalty.com.au

Two phases: **(1)** put the app live on Railway, **(2)** point the GoDaddy domain at it.
You do the clicking — these are the exact values to use.

---

## Phase 1 — Deploy to Railway

1. Go to https://railway.app and sign in (same account as the command-centre).
2. **New Project → Deploy from GitHub repo** → pick `joshuacampisi-png/gri-command-centre`.
3. Open the new service → **Settings**:
   - **Source → Branch:** `claude/code-identification-j0j9o7` (or `main` once merged).
   - **Root Directory:** `falafels-loyalty`  ← important, this is a sub-folder app.
4. **Add a Volume** (so the database survives restarts):
   - Service → **Variables/Volumes → New Volume**.
   - **Mount path:** `/data`
5. **Variables** (Service → Variables → add these):
   - `FALAFELS_DATA_DIR` = `/data`
   - `FALAFELS_JWT_SECRET` = a long random string (e.g. run `openssl rand -hex 32`)
   - `NODE_ENV` = `production`
6. Railway builds and deploys automatically. When it's green, open
   **Settings → Networking → Generate Domain** to get a test URL like
   `falafels-loyalty-production.up.railway.app`. Open it and create a card to
   confirm it works.

---

## Phase 2 — Custom domain (Railway side first, then GoDaddy)

### 2a. Tell Railway about the domain
1. Service → **Settings → Networking → Custom Domain**.
2. Add **`www.falafelsloyalty.com.au`**.
3. Railway shows a **CNAME target** — a value ending in `.up.railway.app`
   (e.g. `abcd1234.up.railway.app`). **Copy it.** This is the only value that
   comes from Railway; everything below uses it.

### 2b. Add the DNS records in GoDaddy
GoDaddy: **My Products → Domain `falafelsloyalty.com.au` → DNS / Manage DNS.**

Add / edit these records:

| Type  | Name  | Value / Points to                     | TTL    |
|-------|-------|---------------------------------------|--------|
| CNAME | `www` | *(paste Railway's `xxxx.up.railway.app` target)* | 1 hour |

> **Apex/root note:** GoDaddy cannot put a CNAME on the bare
> `falafelsloyalty.com.au` (apex). So make **www** the real address (above) and
> redirect the bare domain to it:
>
> GoDaddy → Domain → **Forwarding → Add Forwarding**:
> - Forward **`falafelsloyalty.com.au` → `https://www.falafelsloyalty.com.au`**
> - Type: **Permanent (301)**, Settings: **Forward only**.
>
> (If you'd rather the bare domain be primary, Railway also accepts the apex —
> add `falafelsloyalty.com.au` as a second custom domain in step 2a and it will
> give you an A record IP to put in GoDaddy as an `A` record on name `@`.)

### 2c. Wait + verify
- DNS changes take anywhere from a few minutes to a couple of hours.
- Back in Railway, the custom domain shows a green tick once it sees the record.
- Railway issues the HTTPS certificate automatically — no extra step.
- Visit **https://www.falafelsloyalty.com.au** → the app should load.

---

## Notes
- The free Railway tier sleeps/limits usage; a Hobby plan (~US$5/mo) keeps it
  always-on, which you want for a real cafe.
- Back up the database occasionally by downloading `/data/falafels.db` from the
  Railway volume (Service → Volume → ... ), or we can add an automated backup.
- To push updates: merge to `main` (or keep the branch as the deploy source) and
  Railway redeploys on push.
