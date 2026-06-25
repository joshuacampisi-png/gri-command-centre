import React from 'react';

// Minimal SVG line chart. points: [{ label, value }]. Optional band [lo, hi]
// shades a reference range.
export default function TrendChart({ points = [], color = 'var(--accent)', band, unit = '', height = 140 }) {
  const data = points.filter((p) => typeof p.value === 'number' && !isNaN(p.value));
  if (data.length < 2) {
    return <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--faint)', fontSize: 13 }}>Not enough data yet</div>;
  }

  const W = 320;
  const H = height;
  const padX = 8;
  const padY = 16;
  const values = data.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (band) {
    lo = Math.min(lo, band[0]);
    hi = Math.max(hi, band[1]);
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const range = hi - lo;
  const x = (i) => padX + (i * (W - padX * 2)) / (data.length - 1);
  const y = (v) => padY + (1 - (v - lo) / range) * (H - padY * 2);
  const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const dp = range < 5 ? 1 : 0;

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {band ? (
          <>
            <rect x={padX} y={y(band[1])} width={W - padX * 2} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--good)" opacity="0.10" />
            <line x1={padX} y1={y(band[1])} x2={W - padX} y2={y(band[1])} stroke="var(--good)" strokeWidth="0.5" opacity="0.4" strokeDasharray="3 3" />
            <line x1={padX} y1={y(band[0])} x2={W - padX} y2={y(band[0])} stroke="var(--good)" strokeWidth="0.5" opacity="0.4" strokeDasharray="3 3" />
          </>
        ) : null}
        <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="2.5" fill={color} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, color: 'var(--faint)', fontSize: 11 }}>
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--faint)', fontSize: 11 }}>
        <span>low {lo.toFixed(dp)}{unit}</span>
        <span>high {hi.toFixed(dp)}{unit}</span>
      </div>
    </div>
  );
}
