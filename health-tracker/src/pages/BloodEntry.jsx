import React, { useState, useMemo } from 'react';
import { MARKERS, CATEGORIES, evaluate, statusLabel } from '../lib/bloodMarkers';
import { STATUS_COLOR } from '../components/ui.jsx';
import { api } from '../lib/api';
import { isoDate } from '../lib/dates';

export default function BloodEntry({ onClose, onSaved }) {
  const [date, setDate] = useState(isoDate());
  const [lab, setLab] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? MARKERS.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
      : MARKERS;
    const byCat = {};
    for (const m of list) (byCat[m.category] = byCat[m.category] || []).push(m);
    return byCat;
  }, [search]);

  const entered = Object.keys(values).filter((k) => values[k] !== '' && values[k] != null);

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      alert('Use the date format YYYY-MM-DD.');
      return;
    }
    const rows = entered
      .map((markerId) => {
        const m = MARKERS.find((x) => x.id === markerId);
        const num = parseFloat(values[markerId]);
        if (isNaN(num)) return null;
        return { markerId, value: num, unit: m.unit, date, lab: lab.trim() || undefined };
      })
      .filter(Boolean);
    if (!rows.length) {
      alert('Enter at least one result.');
      return;
    }
    setBusy(true);
    try {
      await api.addBloods(rows);
      onSaved();
    } catch (e) {
      alert(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div className="topbar" style={{ marginBottom: 16 }}>
        <button className="link-btn" onClick={onClose}>
          Cancel
        </button>
        <strong>Add results</strong>
        <button className="link-btn" disabled={!entered.length || busy} onClick={save}>
          {busy ? 'Saving…' : `Save (${entered.length})`}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">Test date</label>
        <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
        <label className="label" style={{ marginTop: 12 }}>
          Lab / source (optional)
        </label>
        <input className="input" value={lab} onChange={(e) => setLab(e.target.value)} placeholder="e.g. Sonic, Australian Clinical Labs" />
      </div>

      <input
        className="input"
        style={{ marginBottom: 14 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search markers (e.g. ferritin, thyroid)"
      />

      {CATEGORIES.filter((c) => filtered[c]).map((cat) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <p className="cat-title">{cat}</p>
          {filtered[cat].map((m) => {
            const v = values[m.id] ?? '';
            const status = v !== '' ? evaluate(m, parseFloat(v)) : 'unknown';
            return (
              <div key={m.id} className="marker-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{m.name}</div>
                  <div className="ref">
                    {m.low}–{m.high} {m.unit}
                  </div>
                </div>
                <input
                  className="field"
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => setValues((s) => ({ ...s, [m.id]: e.target.value }))}
                  placeholder="—"
                />
                <div className="status" style={{ color: STATUS_COLOR[status] }}>
                  {v !== '' ? statusLabel(status) : ''}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
