# Falafels Loyalty

A digital version of the Fala Fels punch card. Each customer makes a quick
account (name + password), gets their own self-contained stamp card, builds
daily streaks, and earns **Falafel Coins** that convert to cash discounts.

## How it works

- **Stamp card:** buy 8 coffees, the 9th is free (mirrors the paper card).
- **Falafel Coins:** earn 10 coins per coffee. 200 coins = **$5 off** (min spend $5).
- **Streaks (Brisbane days):** every 3rd consecutive day = +50 coins, every 7th
  day = +200 coins ($5). Repeats weekly.
- **Vouchers:** redeem 200 coins for a $5 voucher with a code to show at the till.

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
