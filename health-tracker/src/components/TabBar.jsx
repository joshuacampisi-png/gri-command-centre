import React from 'react';

const TABS = [
  { id: 'today', label: 'Today', glyph: '◎' },
  { id: 'sleep', label: 'Sleep', glyph: '☾' },
  { id: 'body', label: 'Body', glyph: '❤' },
  { id: 'bloods', label: 'Bloods', glyph: '🩸' },
  { id: 'insights', label: 'Insights', glyph: '✦' },
];

export default function TabBar({ tab, setTab }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
          <span className="glyph">{t.glyph}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
