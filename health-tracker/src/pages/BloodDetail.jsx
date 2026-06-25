import React from 'react';
import { Card, Section, Pill, STATUS_COLOR } from '../components/ui.jsx';
import TrendChart from '../components/TrendChart.jsx';
import { MARKER_BY_ID, evaluate, statusLabel } from '../lib/bloodMarkers';
import { prettyDate, shortLabel } from '../lib/dates';
import { api } from '../lib/api';

export default function BloodDetail({ markerId, bloods, onBack, onChanged }) {
  const marker = MARKER_BY_ID[markerId];
  if (!marker) return null;

  const history = (bloods || [])
    .filter((r) => r.markerId === markerId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = history.map((r) => ({ label: shortLabel(r.date), value: Number(r.value) }));
  const latest = history[history.length - 1];
  const latestStatus = latest ? evaluate(marker, Number(latest.value)) : 'unknown';

  async function remove(id) {
    if (!window.confirm('Delete this single result permanently?')) return;
    await api.deleteBlood(id);
    onChanged();
  }

  return (
    <div className="page">
      <button className="back" onClick={onBack}>
        ‹ Bloods
      </button>
      <h1 style={{ fontSize: 24 }}>{marker.name}</h1>
      <p className="sub">{marker.desc}</p>

      {latest ? (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--dim)', fontSize: 12 }}>Latest · {prettyDate(latest.date)}</div>
              <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, color: STATUS_COLOR[latestStatus] }}>
                {latest.value} <span style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 400 }}>{marker.unit}</span>
              </div>
            </div>
            <Pill text={statusLabel(latestStatus)} color={STATUS_COLOR[latestStatus]} />
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12 }}>
            Reference {marker.low}–{marker.high} {marker.unit}
            {marker.optimalLow || marker.optimalHigh
              ? `  ·  optimal ${marker.optimalLow ?? marker.low}–${marker.optimalHigh ?? marker.high}`
              : ''}
          </div>
        </Card>
      ) : null}

      <Section title="Trend">
        <Card>
          <TrendChart
            points={points}
            color="var(--accent)"
            band={[marker.optimalLow ?? marker.low, marker.optimalHigh ?? marker.high]}
            unit={marker.unit === '%' ? '%' : ''}
          />
        </Card>
      </Section>

      <Section title="History">
        {[...history].reverse().map((r) => {
          const s = evaluate(marker, Number(r.value));
          return (
            <Card key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {r.value} <span style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 400 }}>{marker.unit}</span>
                </div>
                <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 2 }}>
                  {prettyDate(r.date)}
                  {r.lab ? ` · ${r.lab}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Pill text={statusLabel(s)} color={STATUS_COLOR[s]} />
                <button className="del" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </div>
            </Card>
          );
        })}
      </Section>
    </div>
  );
}
