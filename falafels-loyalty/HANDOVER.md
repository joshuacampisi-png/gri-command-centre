# Falafels Loyalty — Project Handover

A complete brief so a new session (or developer) can pick this up with zero prior
context. Read this top to bottom before touching anything.

---

## 1. What this is

A digital loyalty card for **Fala Fels**, a cafe in Mermaid Waters, QLD. It
replaces the paper hole-punch card. Customers make a quick account, get their own
digital stamp card, build daily streaks, and earn "Falafel Coins" that convert to
cash discounts.

- **Brand:** bright blue (`#149be0`), black "Fala Fels" logo box, white outlined
  coffee cups. Instagram: `@fala_fels`.
- **Physical card it digitises:** "Purchase 8 coffees & get your 9th FREE!"
  Address: Shop 2c, 51-73 The Lanes Blv, Mermaid Waters, QLD 4218.
- **Owner context:** being built by Josh (owner of the surrounding
  `gri-command-centre` repo) for a mate who runs the cafe.

---

## 2. Where the code lives

- Repo: `joshuacampisi-png/gri-command-centre`
- Branch: **`claude/code-identification-j0j9o7`**
- All code is in the sub-folder: **`falafels-loyalty/`** (self-contained, its own
  `package.json`, independent of the parent command-centre app).

Everything described below is committed and pushed to that branch.

---

## 3. Confirmed decisions (do not re-litigate)

| Decision | Choice | Notes |
|---|---|---|
| Storage | **Shared backend with real DB** | User chose this over device-only. |
| DB engine | **SQLite** via `better-sqlite3` | Keep it; do not move to Postgres unless multi-venue. |
| Location | **Sub-folder in this repo** | Not a separate repo. |
| Hosting target | **Railway** | Parent repo already uses Railway. |
| Staff control of stamping | **Deferred / OFF for now** | Currently the customer taps "I bought a coffee" themselves (trust-based). Staff PIN/QR was explicitly parked "to organise later". This is the main open product question before real customers use it. |

---

## 4. Tech stack

- **Backend:** Node + Express, `better-sqlite3`, `bcryptjs` (password hashing),
  `jsonwebtoken` (60-day JWT auth).
- **Frontend:** React 18 + Vite. Mobile-first, single-page.
- **No CSS framework** — hand-written CSS in `src/styles.css`. Animations are pure
  CSS + a tiny DOM confetti component (no animation libraries).
- **Standalone preview:** `demo.html` — a single self-contained file (vanilla JS +
  localStorage, no server) that mirrors the full UI and logic. This is what gets
  sent to the user to "see it live", since the cloud sandbox isn't reachable from
  their browser.

---

## 5. The economy (current, authoritative)

All tunable numbers live in **`server/economy.js`** (and are mirrored in the `ECO`
object at the top of `demo.html` — keep both in sync).

### Stamp card → free coffees
- Every coffee = 1 stamp. **8 stamps banks a free coffee**, then the card resets
  to 0 so the customer keeps stacking.
- Free coffees **accumulate** (☕ ×1, ×2, ×3…) and are **claimed on demand** via a
  separate "Claim" button. They are NOT auto-redeemed.

### Falafel Coins (the currency)
Coins come from the **signup bonus + streaks only** — NOT per coffee
(`COINS_PER_COFFEE = 0`).

| Source | Coins |
|---|---|
| Signup welcome bonus | **+50** (once) |
| 3-day streak | **+50** |
| 7-day streak | **+100** |

- Signup 50 + day-3 50 + day-7 100 = **200 coins = $5 off across the first week.**
- **200 coins = $5.00** voucher. Min spend $5.
- Streak milestones **repeat weekly**: cycle is `streak % 7`; `=== 3` → +50,
  `=== 0` (i.e. day 7, 14, 21…) → +100. So day 10 → +50, day 14 → +100, etc.
- **Coins stack** if unclaimed. Redeeming a $5 voucher **spends 200 coins; the
  remainder carries over** (it is NOT wiped to zero — this was changed from an
  earlier "reset to 0" version on user request).

### Streaks
- Based on **consecutive calendar days in `Australia/Brisbane`** (QLD, no DST).
- Same-day repeat purchases don't extend the streak (but still stamp). A gap of 2+
  days resets the streak to 1.

---

## 6. File map

```
falafels-loyalty/
  package.json            # deps + scripts (dev/server/build/start)
  vite.config.js          # Vite; dev proxies /api -> :8787
  index.html              # Vite entry
  demo.html               # STANDALONE preview (vanilla JS + localStorage)
  nixpacks.toml           # Railway build config
  railway.json            # Railway deploy config
  README.md               # how it works + run locally
  DEPLOY.md               # step-by-step Railway + GoDaddy DNS guide
  HANDOVER.md             # this file
  .gitignore              # ignores node_modules/, data/, dist/

  server/
    index.js              # Express app + all routes + serves built dist/
    db.js                 # SQLite setup, schema, migration, logEvent()
    auth.js               # bcrypt + JWT, requireAuth middleware
    economy.js            # ALL economy constants + streak maths

  src/
    main.jsx
    App.jsx               # session restore, routes auth <-> dashboard, toast host
    api.js                # fetch wrapper + endpoints + token storage
    styles.css            # all styling + animations
    components/
      AuthScreen.jsx      # splash "Falafels Loyalty" + signup/login
      Dashboard.jsx       # main screen: streak, card, buy, free-coffee, coins, vouchers, stats
      LoyaltyCard.jsx     # the blue 9-cup stamp card
      StreakTracker.jsx   # animated flame + 7-day reward track + count-up
      AnimatedNumber.jsx  # requestAnimationFrame count-up/down
      Confetti.jsx        # lightweight DOM confetti
      Toast.jsx           # transient messages
```

---

## 7. API reference (all under `/api`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | no | `{name, password}` → `{token, user, signupBonus}`. Name (lowercased) is the unique username. Grants +50 coins. |
| POST | `/auth/login` | no | `{name, password}` → `{token, user}`. |
| GET | `/me` | yes | Current user state. |
| POST | `/coffee` | yes | Add a stamp + streak coins. Banks a free coffee at 8 stamps. Returns `{user, result}` where result has `freeEarned`, `milestone`, `coinsEarned`, `streak`, etc. (drives animations). |
| POST | `/free-coffee/claim` | yes | Claim 1 banked free coffee (decrements `free_coffees`, increments `free_redeemed`). |
| POST | `/redeem` | yes | Spend 200 coins → a $5 voucher (remainder stacks). |
| POST | `/voucher/:id/use` | yes | Mark a voucher used at the till. |

Auth = `Authorization: Bearer <jwt>`. Secret from `FALAFELS_JWT_SECRET`
(falls back to a dev default — MUST be set in production).

### DB schema (`users` table key columns)
`coins, punches, free_coffees, free_redeemed, current_streak, longest_streak,
last_purchase_date, total_coffees`. Plus `vouchers` and `events` tables. There is
a guarded migration in `db.js` that adds `free_coffees` to older databases.

---

## 8. How to run / verify locally

```bash
cd falafels-loyalty
npm install

# Dev (two terminals):
npm run server    # API on :8787
npm run dev       # Vite UI on :5180 (proxies /api)

# Production-style (one server serves built UI + API):
npm run build
npm start         # http://localhost:8787
```

**Testing approach used so far** (no test framework wired up):
- Backend: start the server, hit endpoints with `curl`/`fetch`, and seed/inspect
  the SQLite DB directly with a throwaway `node --input-type=module` script that
  imports `./server/db.js`. (Inline `node -e` with arrow functions kept tripping
  on shell quoting — write a temp `.mjs` file in the project dir instead, and
  delete it after. Don't leave stray test files; one got committed and had to be
  removed.)
- Frontend / `demo.html`: validated by loading it in **jsdom** with
  `runScripts: 'dangerously'`, dispatching clicks, and asserting on the rendered
  HTML. This caught two real bugs (see below). `jsdom` was installed with
  `--no-save`.

All flows verified passing: signup +50, 8 stamps → bank free coffee, stacking to
2, claim decrements, redeem spends 200 with remainder stacking, streak milestones
at day 3 (+50) / 7 (+100) repeating weekly, streak reset on gap.

---

## 9. Gotchas already discovered

1. **`demo.html` white screen on `file://`:** opening the file directly is an
   "opaque origin" where `localStorage` throws a `SecurityError`. Fixed with a
   try/guarded storage layer that falls back to in-memory (`storeGet/Set/Del`),
   plus a visible fallback panel in `#app` and a `<noscript>` note, plus a
   top-level try/catch. **Keep these guards** if you regenerate the demo.
2. **In-app file viewers may block inline scripts** → tell the user to open the
   demo in Safari/Chrome (Share → Open in Browser), not the quick-look preview.
3. **Keep `economy.js` and the `ECO` object in `demo.html` in sync** — they're
   two implementations of the same rules.
4. `better-sqlite3` is native; installs fine on Node 22 via prebuilt binaries.
5. Parent repo conventions (`gri-command-centre/CLAUDE.md`): Australian English in
   copy, no emojis *in code comments*, keep outputs short. Note `dist/` is
   git-ignored **inside this sub-folder** (unlike the parent app which commits it)
   — Railway builds it.

---

## 10. Current state

**Done & pushed:**
- Full app (backend + frontend) with the economy in section 5.
- Animated, interactive streaks (flame flare/grow, 7-day reward track, count-up).
- Banked/stacking free coffees with claim flow.
- `demo.html` standalone preview (fixed, verified in jsdom).
- Railway deploy config (`nixpacks.toml`, `railway.json`), DB path configurable
  via `FALAFELS_DATA_DIR` for a mounted volume.
- `DEPLOY.md` with Railway + GoDaddy DNS steps.

**Not done / open:**
- **Not deployed anywhere yet.** No live URL exists.
- **Domain `falafelsloyalty.com.au` not connected.** Cannot be until deployed.
  - IMPORTANT: the assistant cannot operate a browser or the user's Railway/
    GoDaddy accounts. Deploy + DNS require the user's own authenticated clicks.
    The user has repeatedly asked the assistant to "open a browser and do it" —
    it genuinely can't. The path is: guide the user click-by-click, OR (their
    choice) they provide a Railway API token to attempt CLI deploy (network
    access from the sandbox not guaranteed; GitHub link + GoDaddy DNS still need
    their clicks regardless).
- **Staff-controlled stamping** (PIN/QR) — deferred, but needed before real
  customers use it so customers can't stamp themselves freely.
- No real Fala Fels logo image yet (text logo box stands in). User has the brand
  on Instagram `@fala_fels` and provided a photo of the physical card.
- No automated DB backups. No test framework.

---

## 11. Suggested next steps (in order)

1. **Deploy to Railway** (guide the user through `DEPLOY.md` Phase 1; they click).
2. **Connect the domain** (`DEPLOY.md` Phase 2; user pastes Railway's
   `…up.railway.app` target, assistant returns the exact GoDaddy CNAME +
   apex-forwarding values).
3. **Decide & build staff stamping** (PIN at till, or QR the staff scan). This is
   a gate in front of the existing `POST /api/coffee` — no economy changes needed.
4. Drop in the real logo image; add PWA "add to home screen" polish.
5. Add DB backup + a `FALAFELS_JWT_SECRET` in Railway env (don't ship the dev
   default).
