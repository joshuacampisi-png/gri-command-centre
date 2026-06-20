import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { db, logEvent } from './db.js';
import { hashPassword, checkPassword, issueToken, requireAuth } from './auth.js';
import { ECONOMY, brisbaneDate, applyStreak } from './economy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// ---- helpers ---------------------------------------------------------------

function publicUser(u) {
  const punchesLeft = Math.max(0, ECONOMY.PUNCHES_FOR_FREE - u.punches);
  const vouchers = db
    .prepare('SELECT id, code, value_cents, status, created_at, redeemed_at FROM vouchers WHERE user_id = ? ORDER BY id DESC')
    .all(u.id);
  return {
    id: u.id,
    name: u.name,
    coins: u.coins,
    punches: u.punches,
    punchesNeeded: ECONOMY.PUNCHES_FOR_FREE,
    punchesLeft,
    freeCoffeeReady: u.punches >= ECONOMY.PUNCHES_FOR_FREE,
    currentStreak: u.current_streak,
    longestStreak: u.longest_streak,
    totalCoffees: u.total_coffees,
    freeRedeemed: u.free_redeemed,
    lastPurchaseDate: u.last_purchase_date,
    vouchers,
    economy: {
      coinsPerCoffee: ECONOMY.COINS_PER_COFFEE,
      redeemCoins: ECONOMY.REDEEM_COINS,
      redeemValueCents: ECONOMY.REDEEM_VALUE_CENTS,
      minCheckoutCents: ECONOMY.MIN_CHECKOUT_CENTS,
      punchesForFree: ECONOMY.PUNCHES_FOR_FREE,
      streak3: ECONOMY.STREAK_3DAY_BONUS,
      streak7: ECONOMY.STREAK_7DAY_BONUS,
    },
  };
}

function voucherCode() {
  return 'FAL-' + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

const cleanName = (s) => (typeof s === 'string' ? s.trim() : '');

// ---- auth ------------------------------------------------------------------

app.post('/api/auth/signup', (req, res) => {
  const name = cleanName(req.body?.name);
  const password = req.body?.password ?? '';
  if (name.length < 2) return res.status(400).json({ error: 'Enter your name' });
  if (password.length < 4) return res.status(400).json({ error: 'Password needs at least 4 characters' });

  const username = name.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That name is taken — try logging in instead' });

  const info = db
    .prepare('INSERT INTO users (name, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(name, username, hashPassword(password), new Date().toISOString());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  logEvent(user.id, 'signup');
  res.json({ token: issueToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const name = cleanName(req.body?.name);
  const password = req.body?.password ?? '';
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(name.toLowerCase());
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong name or password' });
  }
  res.json({ token: issueToken(user), user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---- buy a coffee (punch + coins + streak) ---------------------------------

app.post('/api/coffee', requireAuth, (req, res) => {
  const u = req.user;
  const today = brisbaneDate();

  const isFreeRedemption = u.punches >= ECONOMY.PUNCHES_FOR_FREE;

  // Streak handling (a free coffee still counts as a visit).
  const s = applyStreak({ current_streak: u.current_streak, last_purchase_date: u.last_purchase_date }, today);
  const baseCoins = ECONOMY.COINS_PER_COFFEE;
  const coinsEarned = baseCoins + s.streakBonus;

  let newPunches;
  if (isFreeRedemption) {
    newPunches = 0; // the 9th coffee was free — card resets
  } else {
    newPunches = u.punches + 1;
  }

  const newStreak = s.streak;
  const longest = Math.max(u.longest_streak, newStreak);
  const freeRedeemed = u.free_redeemed + (isFreeRedemption ? 1 : 0);

  db.prepare(
    `UPDATE users SET
       coins = coins + ?,
       punches = ?,
       free_redeemed = ?,
       current_streak = ?,
       longest_streak = ?,
       last_purchase_date = ?,
       total_coffees = total_coffees + 1
     WHERE id = ?`
  ).run(coinsEarned, newPunches, freeRedeemed, newStreak, longest, today, u.id);

  logEvent(u.id, isFreeRedemption ? 'free_coffee' : 'coffee', {
    coinsEarned,
    streak: newStreak,
    milestone: s.milestone,
  });

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({
    user: publicUser(fresh),
    result: {
      type: isFreeRedemption ? 'free' : 'punch',
      baseCoins,
      streakBonus: s.streakBonus,
      coinsEarned,
      streak: newStreak,
      sameDay: s.sameDay,
      milestone: s.milestone,
      freeCoffeeJustReady: !isFreeRedemption && newPunches >= ECONOMY.PUNCHES_FOR_FREE,
    },
  });
});

// ---- redeem coins for a $5 voucher -----------------------------------------

app.post('/api/redeem', requireAuth, (req, res) => {
  const u = req.user;
  if (u.coins < ECONOMY.REDEEM_COINS) {
    return res.status(400).json({ error: `You need ${ECONOMY.REDEEM_COINS} coins to redeem $5` });
  }
  const code = voucherCode();
  db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(ECONOMY.REDEEM_COINS, u.id);
  db.prepare(
    'INSERT INTO vouchers (user_id, code, value_cents, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(u.id, code, ECONOMY.REDEEM_VALUE_CENTS, 'active', new Date().toISOString());
  logEvent(u.id, 'redeem', { code, value_cents: ECONOMY.REDEEM_VALUE_CENTS });

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ user: publicUser(fresh), voucher: { code, value_cents: ECONOMY.REDEEM_VALUE_CENTS } });
});

// ---- mark a voucher as used at the till ------------------------------------

app.post('/api/voucher/:id/use', requireAuth, (req, res) => {
  const u = req.user;
  const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ? AND user_id = ?').get(req.params.id, u.id);
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
  if (voucher.status !== 'active') return res.status(400).json({ error: 'Voucher already used' });
  db.prepare('UPDATE vouchers SET status = ?, redeemed_at = ? WHERE id = ?').run(
    'redeemed',
    new Date().toISOString(),
    voucher.id
  );
  logEvent(u.id, 'voucher_used', { code: voucher.code });
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ user: publicUser(fresh) });
});

// ---- static frontend (production) ------------------------------------------

const distDir = join(__dirname, '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Falafels Loyalty running on http://localhost:${PORT}`));
