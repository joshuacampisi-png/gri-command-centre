import React from 'react';

export function Card({ children, className = '', ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div className="section">
      {title ? (
        <div className="section-head">
          <h2>{title}</h2>
          {action || null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Metric({ label, value, unit, sub, color = 'var(--text)' }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>
        {value ?? '—'}
        {unit ? <span className="unit"> {unit}</span> : null}
      </div>
      {sub ? <div className="msub">{sub}</div> : null}
    </div>
  );
}

export function Pill({ text, color = 'var(--dim)', bg }) {
  return (
    <span className="pill" style={{ color, background: bg }}>
      {text}
    </span>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ title, sub }) {
  return (
    <div className="center">
      <h3>{title}</h3>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}

export const STATUS_COLOR = {
  low: 'var(--warn)',
  high: 'var(--warn)',
  optimal: 'var(--good)',
  in: 'var(--ok)',
  unknown: 'var(--faint)',
};

export const SEVERITY = {
  high: { color: 'var(--warn)', label: 'Act soon' },
  medium: { color: 'var(--ok)', label: 'Watch' },
  good: { color: 'var(--good)', label: 'Good' },
  info: { color: 'var(--info)', label: 'Note' },
};
