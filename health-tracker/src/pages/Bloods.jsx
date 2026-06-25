import React from 'react';
import { Card, Section, Pill, Empty, STATUS_COLOR } from '../components/ui.jsx';
import { MARKER_BY_ID, CATEGORIES, evaluate, statusLabel } from '../lib/bloodMarkers';
import { prettyDate } from '../lib/dates';

function latestByMarker(results) {
  const out = {};
  for (const r of results) {
    if (!out[r.markerId] || r.date > out[r.markerId].date) out[r.markerId] = r;
  }
  return out;
}

export default function Bloods({ bloods, nav }) {
  const latest = latestByMarker(bloods || []);
  const markerIds = Object.keys(latest);
  const flagged = markerIds.filter((id) => {
    const s = evaluate(MARKER_BY_ID[id], Number(latest[id].value));
    return s === 'low' || s === 'high';
  }).length;

  const byCat = {};
  for (const id of markerIds) {
    const cat = MARKER_BY_ID[id]?.category;
    if (!cat) continue;
    (byCat[cat] = byCat[cat] || []).push(id);
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Bloods</h1>
        <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={nav.openEntry}>
          + Add
        </button>
      </div>

      {!markerIds.length ? (
        <Empty
          title="No blood results yet"
          sub="Tap + Add to enter results from her pathology reports. The app flags anything out of range and tracks every marker over time."
        />
      ) : (
        <>
          <p className="sub">
            {markerIds.length} markers tracked ·{' '}
            <span style={{ color: flagged ? 'var(--warn)' : 'var(--good)' }}>{flagged} out of range</span>
          </p>

          {CATEGORIES.filter((c) => byCat[c]).map((cat) => (
            <Section key={cat} title={cat}>
              {byCat[cat]
                .map((id) => ({ id, marker: MARKER_BY_ID[id], r: latest[id] }))
                .sort((a, b) => a.marker.name.localeCompare(b.marker.name))
                .map(({ id, marker, r }) => {
                  const status = evaluate(marker, Number(r.value));
                  return (
                    <Card key={id} className="list-card" onClick={() => nav.openMarker(id)}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{marker.name}</div>
                        <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 2 }}>
                          ref {marker.low}–{marker.high} {marker.unit} · {prettyDate(r.date)}
                        </div>
                      </div>
                      <div>
                        <div className="v" style={{ color: STATUS_COLOR[status] }}>
                          {r.value} <span className="unit">{marker.unit}</span>
                        </div>
                        <div style={{ textAlign: 'right', marginTop: 4 }}>
                          <Pill text={statusLabel(status)} color={STATUS_COLOR[status]} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </Section>
          ))}
        </>
      )}
    </div>
  );
}
