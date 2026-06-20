# Falafels Loyalty

A digital version of the Fala Fels punch card. Each customer makes a quick
account (name + password), gets their own self-contained stamp card, builds
daily streaks, and earns **Falafel Coins** that convert to cash discounts.

## How it works

- **Stamp card:** every coffee is a stamp; 8 stamps bank a free coffee and the
  card resets. Free coffees **stack** — claim them whenever you like.
- **Falafel Coins** come from the welcome bonus + streaks (not per coffee):
  - Signup bonus: **+50**
  - 3-day streak: **+50**, 7-day streak: **+100** (repeats weekly)
  - Signup 50 + day-3 50 + day-7 100 = **200 = $5 off across the first week**.
- **Coins stack:** they keep building if unclaimed. Redeeming a $5 voucher spends
  200 coins; any remainder carries over toward the next discount.
- **Vouchers:** redeem 200 coins for a $5 voucher (min spend $5) with a code to
  show at the till.

All economy numbers live in [`server/economy.js`](server/economy.js) — tweak there.

## Stack

- Backend: Node + Express + SQLite (`better-sqlite3`), bcrypt + JWT auth.
- Frontend: React + Vite.
- Data lives in `data/falafels.db` (created on first run, git-ignored).

## Run locally

```bash
cd falafels-loyalty
npm install

# Dev (two terminals):
npm run server      # API on :8787
npm run dev         # Vite UI on :5180 (proxies /api -> :8787)

# Production-style (single server serves the built UI):
npm run build
npm start           # serves UI + API on :8787
```

Then open the printed URL and create a card.

## Notes

- Set `FALAFELS_JWT_SECRET` in production for stable, secure sessions.
- Each account is fully isolated — its own card, coins, streak and vouchers.
