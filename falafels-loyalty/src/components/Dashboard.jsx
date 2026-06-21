import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import Confetti from './Confetti.jsx';
import AnimatedNumber from './AnimatedNumber.jsx';
import { liveStreak, nextCoinBonus } from '../lib/streak.js';
import logo from '../assets/logo.png';
import './Dashboard.css';

const IG_URL = 'https://www.instagram.com/fala_fels/';
const IG_PENDING_KEY = 'falafels_ig_pending';

function dollars(cents) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/* ── Lucide-style icons (1.7 stroke, currentColor) ───────────────── */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Coffee = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M17 8h1a3 3 0 0 1 0 6h-1" /><path d="M3 8h14v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" /><path d="M6 1v2M10 1v2M14 1v2" /></svg>);
const CoffeeTo = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" /><line x1="6" x2="6" y1="2" y2="4" /><line x1="10" x2="10" y1="2" y2="4" /><line x1="14" x2="14" y1="2" y2="4" /></svg>);
const Gift = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" /></svg>);
const Coin = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /></svg>);
const Ticket = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v14" /></svg>);
const Insta = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><rect x="2" y="2" width="20" height="20" rx="5.5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" /></svg>);
const Flame = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z" /></svg>);
const Home = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></svg>);
const Chart = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>);
const User = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>);
const Phone = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>);
const LogOut = (p) => (<svg viewBox="0 0 24 24" {...S} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>);

const SECTIONS = ['card', 'rewards', 'activity', 'profile'];

export default function Dashboard({ user, setUser, onLogout, showToast }) {
  const [active, setActive] = useState('card');
  const [busy, setBusy] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [coinPulse, setCoinPulse] = useState(false);
  const [stampPop, setStampPop] = useState(-1);
  const [claimCount, setClaimCount] = useState(1);
  const stampTimer = useRef(null);

  const eco = user.economy;
  const live = liveStreak(user.currentStreak, user.lastPurchaseDate);
  const cash = user.cashout || { eligible: false, dollars: 0, valueCents: 0 };
  const isStreakDay = live.boughtToday;
  const canCashout = cash.eligible && isStreakDay;
  const remaining = Math.max(0, user.punchesNeeded - user.punches);
  const activeVouchers = user.vouchers.filter((v) => v.status === 'active');
  const nextBonus = nextCoinBonus(live.streak, eco.streak3, eco.streak7);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    setClaimCount((c) => Math.min(Math.max(1, c), Math.max(1, user.freeCoffees)));
  }, [user.freeCoffees]);

  /* ── Instagram follow bonus: credited only when they return ─────── */
  const claimIg = useCallback(async () => {
    if (!localStorage.getItem(IG_PENDING_KEY)) return;
    if (user.igFollowClaimed) { localStorage.removeItem(IG_PENDING_KEY); return; }
    try {
      const res = await api.followInstagram();
      localStorage.removeItem(IG_PENDING_KEY);
      setUser(res.user);
      if (res.awarded) {
        setConfettiKey((k) => k + 1);
        setCoinPulse(true);
        setTimeout(() => setCoinPulse(false), 900);
        showToast(`You've earned ${res.coinsEarned} bonus Falafel Coins`, 'success');
      }
    } catch {
      /* leave pending; will retry on next return */
    }
  }, [user.igFollowClaimed, setUser, showToast]);

  useEffect(() => {
    claimIg(); // covers the back-button / reload return path
    const onVisibility = () => { if (document.visibilityState === 'visible') claimIg(); };
    const onReturn = () => claimIg(); // focus/pageshow imply we're back in front
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
    };
  }, [claimIg]);

  function followInstagram() {
    if (!user.igFollowClaimed) localStorage.setItem(IG_PENDING_KEY, '1');
    window.open(IG_URL, '_blank', 'noopener');
  }

  /* ── One-page scroll: bottom nav scrolls to a section ───────────── */
  function scrollTo(key) {
    setActive(key);
    document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Scroll-spy: highlight the nav item for whatever section is up top.
  useEffect(() => {
    const els = SECTIONS.map((k) => document.getElementById(`sec-${k}`)).filter(Boolean);
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-42% 0px -52% 0px', threshold: 0 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Reveal each section as it scrolls into view (subtle fade + rise).
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    document.querySelectorAll('.d-reveal').forEach((el) => {
      // Anything already on screen at mount reveals now; the rest on scroll-in.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.classList.add('in');
      else obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  /* ── Actions ────────────────────────────────────────────────────── */
  async function buyCoffee() {
    if (busy) return;
    setBusy(true);
    const prevPunches = user.punches;
    try {
      const { user: updated, result } = await api.buyCoffee();
      if (result.type === 'punch') {
        setStampPop(prevPunches);
        clearTimeout(stampTimer.current);
        stampTimer.current = setTimeout(() => setStampPop(-1), 700);
      }
      setUser(updated);
      setCoinPulse(true);
      setTimeout(() => setCoinPulse(false), 700);
      if (result.freeEarned) {
        setConfettiKey((k) => k + 1);
        showToast(`Card full — a free coffee's banked. You have ${result.freeCoffees} ready`, 'success');
      } else if (result.milestone) {
        setConfettiKey((k) => k + 1);
        showToast(`${result.milestone.days}-day streak. +${result.milestone.coins} Falafel Coins`, 'success');
      } else if (result.coinsEarned > 0) {
        showToast(`+${result.coinsEarned} Falafel Coins · ${result.streak}-day streak`, 'success');
      } else {
        showToast(`Stamp added · ${result.streak}-day streak`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function claimFree() {
    if (user.freeCoffees < 1 || busy) return;
    setBusy(true);
    try {
      const { user: updated, claimed } = await api.claimFreeCoffee(claimCount);
      setUser(updated);
      setConfettiKey((k) => k + 1);
      showToast(`Enjoy — ${claimed} free coffee${claimed > 1 ? 's' : ''} to redeem at the counter`, 'success');
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
      showToast(`${dollars(voucher.value_cents)} voucher ready. Code ${voucher.code}`, 'success');
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

  /* ── Sections (called as functions to avoid remounts) ───────────── */
  function topBar() {
    return (
      <header className="d-top">
        <div className="d-id">
          <span className="d-avatar"><img src={logo} alt="" /></span>
          <div>
            <div className="d-greet">{greet}</div>
            <div className="d-name">{user.name}</div>
          </div>
        </div>
        <span className={`d-streak-chip ${live.streak > 0 ? 'on' : ''}`}>
          <Flame width="14" height="14" />
          {live.streak > 0 ? `${live.streak} day streak` : 'Start a streak'}
        </span>
      </header>
    );
  }

  function loyaltyCard() {
    const stamps = [];
    for (let i = 1; i <= user.punchesNeeded; i++) {
      const filled = i <= user.punches;
      const isReward = i === user.punchesNeeded;
      stamps.push(
        <div
          key={i}
          className={`d-stamp ${filled ? 'filled' : isReward ? 'reward' : 'empty'} ${stampPop === i - 1 ? 'pop' : ''}`}
        >
          {filled ? <Coffee width="18" height="18" /> : isReward ? <Gift width="16" height="16" /> : null}
        </div>
      );
    }
    return (
      <section className="d-card">
        <span className="d-card-glow" />
        <div className="d-card-head">
          <div>
            <div className="d-eyebrow muted">Coffee card</div>
            <div className="d-card-count">{user.punches} of {user.punchesNeeded} cups</div>
          </div>
          <div className="d-card-reward">
            <div className="d-eyebrow muted">Reward</div>
            <div className="d-card-free">{user.punchesNeeded + 1}th free</div>
          </div>
        </div>
        <div className="d-stamps">{stamps}</div>
        <div className="d-card-foot">
          {remaining > 0
            ? <><strong>{remaining} more cup{remaining > 1 ? 's' : ''}</strong> and your {user.punchesNeeded + 1}th coffee's on us.</>
            : <><strong>Card full</strong> — a free coffee's waiting in your bank.</>}
        </div>
        <div className="d-card-streak">
          <span className="d-card-streak-l">
            <Flame width="14" height="14" />
            {live.streak > 0 ? `${live.streak}-day streak` : 'No streak yet'}
          </span>
          <span className="d-card-streak-r">
            <strong>{nextBonus.coffees} more day{nextBonus.coffees > 1 ? 's' : ''}</strong>
            <span className="d-card-streak-coins"><Coin width="13" height="13" />+{nextBonus.coins} coins</span>
          </span>
        </div>
      </section>
    );
  }

  function buyButton() {
    return (
      <button className="d-buy" onClick={buyCoffee} disabled={busy}>
        <CoffeeTo width="19" height="19" />
        I bought a coffee
      </button>
    );
  }

  function igCard() {
    const claimed = user.igFollowClaimed;
    return (
      <section className="d-ig">
        <span className="d-ig-glyph"><Insta width="21" height="21" /></span>
        <div className="d-ig-copy">
          <div className="d-ig-title">Follow the kitchen</div>
          <div className="d-ig-sub">
            {claimed ? '@fala_fels · specials & new drops' : `@fala_fels · follow for ${eco.igFollowBonus} bonus coins`}
          </div>
        </div>
        {claimed ? (
          <span className="d-ig-done">Following</span>
        ) : (
          <button className="d-ig-btn" onClick={followInstagram}>Follow &amp; earn {eco.igFollowBonus}</button>
        )}
      </section>
    );
  }

  function readyNudge() {
    const bits = [];
    if (user.freeCoffees > 0) bits.push(`${user.freeCoffees} free coffee${user.freeCoffees > 1 ? 's' : ''}`);
    if (cash.eligible) bits.push(`${dollars(cash.valueCents)} to cash out`);
    if (!bits.length) return null;
    return (
      <button className="d-nudge" onClick={() => scrollTo('rewards')}>
        <Gift width="18" height="18" />
        <span>{bits.join(' & ')} ready</span>
        <span className="d-nudge-go">View</span>
      </button>
    );
  }

  function freeCoffeeCard() {
    const n = user.freeCoffees;
    return (
      <section className="d-panel">
        <div className="d-panel-head">
          <span className="d-panel-ico"><Gift width="20" height="20" /></span>
          <div>
            <div className="d-panel-title">Free coffees</div>
            <div className="d-panel-sub">{n > 0 ? 'Banked and ready — claim any time' : 'Earn one every 8 stamps'}</div>
          </div>
          <span className={`d-count-pill ${n > 0 ? '' : 'zero'}`}>×{n}</span>
        </div>
        {n > 0 && (
          <div className="d-claim-row">
            {n > 1 && (
              <div className="d-stepper" role="group" aria-label="How many to claim">
                <button onClick={() => setClaimCount((c) => Math.max(1, c - 1))} disabled={claimCount <= 1} aria-label="Fewer">−</button>
                <span>{claimCount}</span>
                <button onClick={() => setClaimCount((c) => Math.min(n, c + 1))} disabled={claimCount >= n} aria-label="More">+</button>
              </div>
            )}
            <button className="d-claim-btn" onClick={claimFree} disabled={busy}>
              Claim {n > 1 ? claimCount : ''}
            </button>
          </div>
        )}
        {n > 1 && <div className="d-panel-fine">The rest stay banked in your unclaimed coffees.</div>}
      </section>
    );
  }

  function coinsCard() {
    return (
      <section className="d-panel">
        <div className="d-panel-head">
          <span className="d-panel-ico"><Coin width="20" height="20" /></span>
          <div>
            <div className="d-panel-title">Falafel Coins</div>
            <div className="d-panel-sub">{eco.coinsPerDollar} coins = $1 · {dollars(eco.redeemValueCents)} minimum</div>
          </div>
          <span className={`d-coin-num ${coinPulse ? 'pulse' : ''}`}><AnimatedNumber value={user.coins} /></span>
        </div>

        <div className="d-coin-hint">
          {!cash.eligible
            ? `${eco.redeemCoins - user.coins} more coins to your first ${dollars(eco.redeemValueCents)} cash-out`
            : isStreakDay
              ? `Ready — cash out ${dollars(cash.valueCents)} off today`
              : `Buy a coffee today to cash out your ${dollars(cash.valueCents)} (streak day only)`}
        </div>

        <button className="d-redeem" onClick={redeem} disabled={!canCashout || busy}>
          {cash.eligible ? `Cash out ${dollars(cash.valueCents)} off` : `Cash out — ${dollars(eco.redeemValueCents)} minimum`}
        </button>
        <div className="d-panel-fine">Earn coins from your welcome bonus &amp; streaks · cash out on a streak day · leftover coins keep stacking.</div>
      </section>
    );
  }

  function vouchers() {
    if (!activeVouchers.length) return null;
    return (
      <section className="d-vouchers">
        <h3 className="d-section-h">Your vouchers</h3>
        {activeVouchers.map((v) => (
          <div className="d-voucher" key={v.id}>
            <span className="d-voucher-ico"><Ticket width="20" height="20" /></span>
            <div className="d-voucher-copy">
              <div className="d-voucher-val">{dollars(v.value_cents)} off · ready</div>
              <div className="d-voucher-sub">Show at the counter · min spend {dollars(eco.minCheckoutCents)} · {v.code}</div>
            </div>
            <button className="d-voucher-use" onClick={() => useVoucher(v.id)} disabled={busy}>Use</button>
          </div>
        ))}
      </section>
    );
  }

  function streakTracker() {
    const pos = live.streak <= 0 ? 0 : ((live.streak - 1) % 7) + 1;
    const dots = [];
    for (let i = 1; i <= 7; i++) {
      const reward = i === 3 ? eco.streak3 : i === 7 ? eco.streak7 + eco.streak3 : 0;
      dots.push(
        <div className="d-day" key={i}>
          <div className={`d-day-dot ${i <= pos ? 'on' : ''} ${reward ? 'reward' : ''}`}>
            {i <= pos ? <Coffee width="14" height="14" /> : <span>{i}</span>}
          </div>
          {reward ? <span className="d-day-tag">+{i === 3 ? eco.streak3 : eco.streak7}</span> : <span className="d-day-tag empty" />}
        </div>
      );
    }
    return (
      <section className="d-panel">
        <div className="d-streak-head">
          <span className={`d-flame ${live.streak > 0 ? 'on' : ''}`}><Flame width="26" height="26" /></span>
          <div className="d-streak-meta">
            <div className="d-streak-num">{live.streak}<span> day{live.streak === 1 ? '' : 's'}</span></div>
            <div className="d-streak-label">
              {live.streak <= 0 ? 'no streak yet' : isStreakDay ? 'stamped today' : 'keep it alive — buy today'}
            </div>
          </div>
          <div className="d-streak-best"><strong>{user.longestStreak}</strong><span>best</span></div>
        </div>
        <div className="d-week">{dots}</div>
        <div className="d-streak-next">
          Buy <strong>{nextBonus.coffees} more day{nextBonus.coffees > 1 ? 's' : ''}</strong> in a row to earn
          <span className="d-next-coins"><Coin width="14" height="14" /> +{nextBonus.coins} coins</span>
        </div>
        <div className="d-panel-fine center">Day 3 earns +{eco.streak3} coins · day 7 earns +{eco.streak7} coins · repeats weekly</div>
      </section>
    );
  }

  function stats() {
    return (
      <section className="d-stats">
        <div className="d-stat"><strong>{user.totalCoffees}</strong><span>coffees</span></div>
        <div className="d-stat"><strong>{user.freeRedeemed}</strong><span>free claimed</span></div>
        <div className="d-stat"><strong>{user.longestStreak}</strong><span>best streak</span></div>
      </section>
    );
  }

  function profileRows() {
    return (
      <>
        <button className="d-row" onClick={() => window.dispatchEvent(new Event('falafels-install'))}>
          <span className="d-row-ico"><Phone width="20" height="20" /></span>
          <div className="d-row-copy"><div>Add to home screen</div><span>One tap to open — stay signed in</span></div>
          <span className="d-row-go">›</span>
        </button>
        <button className="d-row danger" onClick={onLogout}>
          <span className="d-row-ico"><LogOut width="20" height="20" /></span>
          <div className="d-row-copy"><div>Log out</div></div>
          <span className="d-row-go">›</span>
        </button>
        <p className="d-foot">Fala Fels · Shop 2c, 51-73 The Lanes Blv, Mermaid Waters · @fala_fels</p>
      </>
    );
  }

  function sectionHeader(title, sub) {
    return (
      <div className="d-sec-head">
        <h2>{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
    );
  }

  function tabBar() {
    const tabs = [
      { k: 'card', label: 'Card', Ico: Home },
      { k: 'rewards', label: 'Rewards', Ico: Gift },
      { k: 'activity', label: 'Activity', Ico: Chart },
      { k: 'profile', label: 'Profile', Ico: User },
    ];
    return (
      <nav className="d-tabs">
        {tabs.map(({ k, label, Ico }) => (
          <button key={k} className={`d-tab ${active === k ? 'active' : ''}`} onClick={() => scrollTo(k)}>
            <Ico width="22" height="22" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <div className="d-screen">
      <Confetti fire={confettiKey} />
      {topBar()}
      <main className="d-body">
        <section id="sec-card" className="d-sec">
          {loyaltyCard()}
          {buyButton()}
          {readyNudge()}
        </section>

        <section id="sec-rewards" className="d-sec d-reveal">
          {sectionHeader('Rewards', 'Free coffees, coins & vouchers')}
          {freeCoffeeCard()}
          {coinsCard()}
          {vouchers()}
        </section>

        <section id="sec-activity" className="d-sec d-reveal">
          {sectionHeader('Activity', 'Your streak & milestones')}
          {streakTracker()}
          {stats()}
        </section>

        <section id="sec-profile" className="d-sec d-reveal">
          {sectionHeader('More', 'Follow us & account')}
          {igCard()}
          {profileRows()}
        </section>
      </main>
      {tabBar()}
    </div>
  );
}
