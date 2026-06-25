import React from 'react';
import { Card, SEVERITY } from '../components/ui.jsx';
import { buildInsights } from '../lib/insights';

export default function Insights({ oura, bloods, nav }) {
  const insights = buildInsights(oura.data, bloods);

  return (
    <div className="page">
      <div className="topbar">
        <h1>Insights</h1>
        <button className="link-btn" onClick={nav.openSettings}>
          Settings
        </button>
      </div>
      <p className="sub">
        Patterns across her Oura data and blood results. Educational only — not medical advice.
      </p>

      {insights.map((ins, i) => {
        const sev = SEVERITY[ins.severity];
        return (
          <Card key={i} className="insight" style={{ marginBottom: 12 }}>
            <div className="head">
              <span className="bar" style={{ background: sev.color }} />
              <span className="title">{ins.title}</span>
            </div>
            <div className="detail">{ins.detail}</div>
            <div className="tags">
              <span className="tag" style={{ borderColor: sev.color, color: sev.color }}>
                {sev.label}
              </span>
              {ins.tag ? <span className="tag">{ins.tag}</span> : null}
            </div>
          </Card>
        );
      })}

      <p className="fine">
        Vitals surfaces patterns to discuss with a qualified clinician. It does not diagnose, treat,
        or replace professional medical advice.
      </p>
    </div>
  );
}
