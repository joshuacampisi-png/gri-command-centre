import React from 'react';

// A single coffee cup. `filled` = stamped, `free` = the 9th free slot.
function Cup({ filled, free, justStamped }) {
  return (
    <div className={`cup ${filled ? 'filled' : ''} ${free ? 'free' : ''} ${justStamped ? 'pop' : ''}`}>
      <svg viewBox="0 0 40 48" aria-hidden="true">
        <path
          className="cup-outline"
          d="M8 6 h24 l-3 30 a4 4 0 0 1 -4 3.6 h-6 a4 4 0 0 1 -4 -3.6 z"
          fill="none"
          strokeWidth="2.4"
        />
        <path
          className="cup-rim"
          d="M6 6 h28"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {free && <span className="free-label">FREE</span>}
      {filled && <span className="stamp">✓</span>}
    </div>
  );
}

export default function LoyaltyCard({ user, lastStampIndex }) {
  const total = user.punchesNeeded; // 8 paid
  const slots = [];
  for (let i = 0; i < total; i++) {
    slots.push({ filled: i < user.punches, free: false, index: i });
  }
  // 9th slot = the free coffee reward marker
  slots.push({ filled: false, free: true, index: total });

  return (
    <div className="loyalty-card">
      <div className="card-top">
        <div className="card-tagline">Purchase 8 coffees &amp; get your 9th FREE!</div>
        <div className="logo-box small"><span>Fala</span><span>Fels</span></div>
      </div>

      <div className="cups-grid">
        {slots.map((s) => (
          <Cup
            key={s.index}
            filled={s.filled}
            free={s.free}
            justStamped={lastStampIndex === s.index}
          />
        ))}
      </div>

      <div className="card-foot">
        <span>
          <strong>{user.punchesLeft}</strong> more stamp{user.punchesLeft === 1 ? '' : 's'} until your next free coffee
        </span>
      </div>
    </div>
  );
}
