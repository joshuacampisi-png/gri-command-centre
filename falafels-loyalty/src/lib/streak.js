// Date + streak helpers that run on the CUSTOMER'S device, so "today" and the
// streak status track the phone's real local clock and timezone — not the
// server's. The server still recomputes authoritatively on each purchase, but
// the client passes its own local date along and renders the streak live so a
// missed day shows as broken straight away, before the next coffee.

// Today's calendar date in the device's local timezone, as YYYY-MM-DD.
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Whole-day difference between two YYYY-MM-DD strings (b - a), in local time.
export function dayDiff(a, b) {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((db - da) / 86400000);
}

// Resolve the streak as it stands *right now* on this device.
//   status: 'none'   — no streak going
//           'today'  — already stamped today; streak locked in
//           'active' — stamped yesterday; buy today to extend it
//           'broken' — missed a day (or more); streak has lapsed to 0
export function liveStreak(storedStreak, lastPurchaseDate, today = localDate()) {
  const stored = storedStreak || 0;
  if (!lastPurchaseDate || stored <= 0) {
    return { streak: 0, status: 'none', boughtToday: false, atRisk: false };
  }
  const diff = dayDiff(lastPurchaseDate, today);
  if (diff <= 0) return { streak: stored, status: 'today', boughtToday: true, atRisk: false };
  if (diff === 1) return { streak: stored, status: 'active', boughtToday: false, atRisk: true };
  return { streak: 0, status: 'broken', boughtToday: false, atRisk: false };
}

// The NEXT streak coin bonus from the current streak. Coins land on a streak day:
// day 3, 10, 17… (≡3 mod 7) earn `streak3`; day 7, 14, 21… (≡0 mod 7) earn
// `streak7`. Returns how many more daily coffees until it, the target day, and
// the coin amount. (One coffee per day extends the streak.)
export function nextCoinBonus(streak, streak3, streak7) {
  const s = Math.max(0, streak || 0);
  for (let i = 1; i <= 7; i++) {
    const d = s + i;
    const c = d % 7;
    if (c === 3) return { day: d, coffees: i, coins: streak3 };
    if (c === 0) return { day: d, coffees: i, coins: streak7 };
  }
  return { day: s + 3, coffees: 3, coins: streak3 };
}
