// Falafel Coins economy + streak rules.
// Every tunable number lives here so it's easy to adjust later.

export const ECONOMY = {
  // Stamp card: buy 8, the 9th is free.
  PUNCHES_FOR_FREE: 8,

  // Coins earned per coffee bought.
  COINS_PER_COFFEE: 10,

  // Redemption: 200 Falafel Coins = $5.00 off (min spend $5).
  REDEEM_COINS: 200,
  REDEEM_VALUE_CENTS: 500,
  MIN_CHECKOUT_CENTS: 500,

  // Streak milestones (consecutive Brisbane days with a purchase).
  // These repeat every week: day 3 -> +50, day 7 -> +200, day 10 -> +50, day 14 -> +200 ...
  STREAK_3DAY_BONUS: 50,
  STREAK_7DAY_BONUS: 200,
};

const TZ = 'Australia/Brisbane';

// Current calendar date in Brisbane (QLD, no DST) as YYYY-MM-DD.
export function brisbaneDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Whole-day difference between two YYYY-MM-DD strings (b - a).
export function dayDiff(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86400000);
}

// Work out the new streak + any milestone bonus for a purchase made on `today`.
// state: { last_purchase_date, current_streak }
export function applyStreak(state, today) {
  let streak = state.current_streak || 0;
  let sameDay = false;

  if (!state.last_purchase_date) {
    streak = 1;
  } else {
    const diff = dayDiff(state.last_purchase_date, today);
    if (diff <= 0) {
      sameDay = true; // already counted today (or clock skew) — streak unchanged
    } else if (diff === 1) {
      streak += 1; // consecutive day
    } else {
      streak = 1; // streak broken, start again
    }
  }

  let streakBonus = 0;
  let milestone = null;

  if (!sameDay) {
    const cycle = streak % 7; // 1..6, and 0 means a 7-day multiple
    if (cycle === 0) {
      streakBonus = ECONOMY.STREAK_7DAY_BONUS;
      milestone = { days: streak, kind: '7day', coins: streakBonus };
    } else if (cycle === 3) {
      streakBonus = ECONOMY.STREAK_3DAY_BONUS;
      milestone = { days: streak, kind: '3day', coins: streakBonus };
    }
  }

  return { streak, sameDay, streakBonus, milestone, today };
}

// How many whole $5 vouchers a coin balance can buy.
export function redeemableVouchers(coins) {
  return Math.floor(coins / ECONOMY.REDEEM_COINS);
}
