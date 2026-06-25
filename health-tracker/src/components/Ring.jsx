import React from 'react';

function scoreColor(score) {
  if (score == null) return 'var(--faint)';
  if (score >= 85) return 'var(--good)';
  if (score >= 70) return 'var(--ok)';
  return 'var(--warn)';
}

// Circular 0-100 score ring.
export default function Ring({ score, label, color, size = 92, stroke = 9 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const ringColor = color || scoreColor(score);
  return (
    <div className="ring">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ringColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - pct)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.28,
            fontWeight: 700,
          }}
        >
          {score == null ? '—' : Math.round(score)}
        </div>
      </div>
      {label ? <div className="ring-label">{label}</div> : null}
    </div>
  );
}
