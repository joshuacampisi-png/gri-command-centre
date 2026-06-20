import React, { useState, useRef } from 'react';
import { api } from '../api.js';
import LoyaltyCard from './LoyaltyCard.jsx';
import Confetti from './Confetti.jsx';
import StreakTracker from './StreakTracker.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import { liveStreak } from '../lib/streak.js';

function dollars(cents) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function Dashboard({ user, setUser, onLogout, showToast }) {
  const [busy, setBusy] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [lastStampIndex, setLastStampIndex] = useState(-1);
  const [coinPulse, setCoinPulse] = useState(false);
  const [streakBump, setStreakBump] = useState(0);
  const stampTimer = useRef(null);

  const eco = user.economy;
  // Streak as it stands on this device right now (handles a missed day live).
  const live = liveStreak(user.currentStreak, user.lastPurchaseDate);
  const cash = user.cashout || { eligible: false, dollars: 0, valueCents: 0 };
  const isStreakDay = live.boughtToday; // bought a coffee today on this device
  const canCashout = cash.eligible && isStreakDay; // $5 min AND a streak day
  const progressToRedeem = Math.min(100, (user.coins / eco.redeemCoins) * 100);
  const activeVouchers = user.vouchers.filter((v) => v.status === 'active');

  async function buyCoffee() {
    if (busy) return;
    setBusy(true);
    const prevPunches = user.punches;
    const prevStreak = live.streak;
    try {
      const { user: updated, result } = await api.buyCoffee();

      // Stamp animation on the cup that was just filled.
      if (result.type === 'punch') {
        setLastStampIndex(prevPunches);
        clearTimeout(stampTimer.current);
        stampTimer.current = setTimeout(() => setLastStampIndex(-1), 700);
      }

      setUser(updated);
      setCoinPulse(true);
      setTimeout(() => setCoinPulse(false), 700);

      // Fire the streak animation when the streak actually ticks up today.
      if (result.streak > prevStreak) {
        setStreakBump((k) => k + 1);
      }

      // Feedback messages.
      if (result.freeEarned) {
        setConfettiKey((k) => k + 1);
        showToast(`Card full — free coffee earned! You have ${result.freeCoffees} to claim ☕`, 'success');
      } else if (result.milestone) {
        setConfettiKey((k) => k + 1);
        const m = result.milestone;
        showToast(`${m.days}-day streak! +${m.coins} Falafel Coins 🔥`, 'success');
      } else if (result.coinsEarned > 0) {
        showToast(`+${result.coinsEarned} Falafel Coins · ${result.streak}-day streak 🔥`, 'success');
      } else {
        showToast(`Stamp added · ${result.streak}-day streak`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function claimFreeCoffee() {
    if (user.freeCoffees < 1 || busy) return;
    setBusy(true);
    try {
      const { user: updated } = await api.claimFreeCoffee();
      setUser(updated);
      setConfettiKey((k) => k + 1);
      showToast('Enjoy your free coffee! ☕', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!canCashout || busy) return;
    setBusy(true);
    try {
      const { user: updated, voucher } = await api.redeem();
      setUser(updated);
      setConfettiKey((k) => k + 1);
      setCoinPulse(true);
      setTimeout(() => setCoinPulse(false), 700);
      showToast(`${dollars(voucher.value_cents)} voucher unlocked! Code ${voucher.code}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function useVoucher(id) {
    setBusy(true);
    try {
      const { user: updated } = await api.useVoucher(id);
      setUser(updated);
      showToast('Voucher marked as used', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <Confetti fire={confettiKey} />

      <header className="dash-header">
        <div>
          <div className="hello">Hey {user.name} 👋</div>
          <div className="hello-sub">Falafels Loyalty</div>
        </div>
        <button className="link-logout" onClick={onLogout}>Log out</button>
      </header>

      <StreakTracker
        streak={live.streak}
        longestStreak={user.longestStreak}
        boughtToday={live.boughtToday}
        bumpKey={streakBump}
      />

      <LoyaltyCard user={user} lastStampIndex={lastStampIndex} />

      <button className="btn-coffee" onClick={buyCoffee} disabled={busy}>
        <span className="coffee-emoji">☕</span>
        I bought a coffee
      </button>

      {/* Banked free coffees — stack up, claim whenever */}
      {user.freeCoffees > 0 && (
        <section className="free-card">
          <div className="free-left">
            <div className="free-count">☕ {user.freeCoffees}</div>
            <div className="free-text">
              free coffee{user.freeCoffees === 1 ? '' : 's'} ready
              <span>claim whenever you like — they keep stacking</span>
            </div>
          </div>
          <button className="btn-claim" onClick={claimFreeCoffee} disabled={busy}>
            Claim 1
          </button>
        </section>
      )}

      {/* Falafel Coins */}
      <section className="coin-card">
        <div className="coin-head">
          <div className="coin-label">Falafel Coins</div>
          <div className={`coin-balance ${coinPulse ? 'pulse' : ''}`}>
            <span className="coin-icon">🪙</span>
            <AnimatedNumber value={user.coins} />
          </div>
        </div>

        <div className="coin-bar">
          <div className="coin-bar-fill" style={{ width: `${progressToRedeem}%` }} />
        </div>
        <div className="coin-hint">
          {!cash.eligible
            ? `${eco.redeemCoins - user.coins} more coins to your first ${dollars(eco.redeemValueCents)} cash-out`
            : isStreakDay
              ? `Ready — cash out $${cash.dollars} off today 🎉`
              : `Buy a coffee today to cash out your $${cash.dollars} (streak day only)`}
        </div>

        <button className="btn-redeem" onClick={redeem} disabled={!canCashout || busy}>
          {cash.eligible ? `Cash out $${cash.dollars} off` : `Cash out — ${dollars(eco.redeemValueCents)} minimum`}
        </button>
        <div className="coin-fine">
          Welcome bonus + streaks earn coins · {eco.coinsPerDollar} coins = $1 · {dollars(eco.redeemValueCents)} minimum ·
          cash out on a streak day · leftover coins keep stacking
        </div>
      </section>

      {/* Vouchers */}
      {activeVouchers.length > 0 && (
        <section className="voucher-section">
          <h3>Your vouchers</h3>
          {activeVouchers.map((v) => (
            <div className="voucher" key={v.id}>
              <div className="voucher-left">
                <div className="voucher-value">{dollars(v.value_cents)} off</div>
                <div className="voucher-code">{v.code}</div>
              </div>
              <button className="btn-use" onClick={() => useVoucher(v.id)} disabled={busy}>
                Use at till
              </button>
            </div>
          ))}
          <p className="voucher-note">Show the code to staff to apply your discount.</p>
        </section>
      )}

      {/* Stats */}
      <section className="stats">
        <div className="stat"><strong>{user.totalCoffees}</strong><span>coffees</span></div>
        <div className="stat"><strong>{user.freeRedeemed}</strong><span>free claimed</span></div>
        <div className="stat"><strong>{user.longestStreak}</strong><span>best streak</span></div>
      </section>

      {/* Follow us on Instagram */}
      <a
        className="ig-link"
        href="https://www.instagram.com/fala_fels/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="ig-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </span>
        <span className="ig-copy">
          Follow us on Instagram
          <span>@fala_fels — tag us in your coffee runs</span>
        </span>
        <span className="ig-go" aria-hidden="true">→</span>
      </a>

      <footer className="dash-foot">Fala Fels · Shop 2c, 51-73 The Lanes Blv, Mermaid Waters · @fala_fels</footer>
    </div>
  );
}
