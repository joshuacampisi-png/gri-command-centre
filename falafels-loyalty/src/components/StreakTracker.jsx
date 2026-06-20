import React, { useEffect, useState } from 'react';
import AnimatedNumber from './AnimatedNumber.jsx';

const WEEK = 7;

// Where we are inside the current 7-day reward cycle (1..7, or 0 when no streak).
function weekPosition(streak) {
  if (streak <= 0) return 0;
  return ((streak - 1) % WEEK) + 1;
}

function nextBonus(pos) {
  if (pos < 3) return { days: 3 - pos, coins: 50 };
  if (pos < 7) return { days: 7 - pos, coins: 200 };
  return { days: 3, coins: 50 }; // just completed a week, next is the day-3 bonus
}

export default function StreakTracker({ streak, longestStreak, bumpKey }) {
  const [popDot, setPopDot] = useState(0);
  const [flare, setFlare] = useState(false);

  // Animate the newly earned day whenever the streak ticks up.
  useEffect(() => {
    if (!bumpKey) return;
    setPopDot(weekPosition(streak));
    setFlare(true);
    const t1 = setTimeout(() => setPopDot(0), 750);
    const t2 = setTimeout(() => setFlare(false), 850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [bumpKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = weekPosition(streak);
  const active = streak > 0;
  const next = nextBonus(pos);

  // Flame grows with the streak, with a hard cap.
  const flameSize = 30 + Math.min(streak, 14) * 1.6;

  const dots = [];
  for (let i = 1; i <= WEEK; i++) {
    const reward = i === 3 ? 50 : i === 7 ? 200 : 0;
    dots.push({
      i,
      filled: i <= pos,
      reward,
      isPop: popDot === i,
    });
  }

  return (
    <section className={`streak-card ${active ? 'active' : ''} ${flare ? 'flare' : ''}`}>
      <div className="streak-head">
        <span
          className="streak-flame"
          style={{ fontSize: `${flameSize}px` }}
        >
          🔥
        </span>
        <div className="streak-count">
          <div className="streak-num">
            <AnimatedNumber value={streak} />
            <span className="streak-unit">day{streak === 1 ? '' : 's'}</span>
          </div>
          <div className="streak-label">
            {active ? 'streak going strong' : 'no streak yet'}
          </div>
        </div>
        <div className="streak-best">
          <strong>{longestStreak}</strong>
          <span>best</span>
        </div>
      </div>

      <div className="week-track">
        {dots.map((d) => (
          <div key={d.i} className={`day-wrap ${d.reward ? 'reward' : ''}`}>
            <div
              className={`day-dot ${d.filled ? 'on' : ''} ${d.reward ? 'is-reward' : ''} ${d.isPop ? 'pop' : ''}`}
            >
              {d.filled ? <span className="day-tick">☕</span> : <span className="day-i">{d.i}</span>}
            </div>
            {d.reward > 0 && <span className="reward-tag">+{d.reward}</span>}
          </div>
        ))}
      </div>

      <div className="streak-hint">
        {active ? (
          <>
            <strong>{next.days}</strong> day{next.days === 1 ? '' : 's'} to your
            <span className="hint-coins"> +{next.coins} 🪙</span> bonus
          </>
        ) : (
          <>Buy a coffee today to light the streak 🔥</>
        )}
      </div>
    </section>
  );
}
