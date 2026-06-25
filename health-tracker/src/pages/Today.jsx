import React from 'react';
import Ring from '../components/Ring.jsx';
import { Card, Section, Metric, Pill, Spinner, SEVERITY } from '../components/ui.jsx';
import { latest, latestSleep, avgHrv, avgRestingHr, stressHours } from '../lib/ouraSelect';
import { buildInsights } from '../lib/insights';
import { round } from '../lib/stats';
import { prettyDate } from '../lib/dates';

export default function Today({ oura, bloods, days, setDays, nav }) {
  const { data, loading, error } = oura;
  if (loading && !data) {
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  }

  const readiness = latest(data?.readiness);
  const sleepDaily = latest(data?.sleepDaily);
  const activity = latest(data?.activity);
  const stress = latest(data?.stress);
  const sleep = latestSleep(data?.sleepDetail);
  const spo2 = latest(data?.spo2);
  const hrv = sleep?.average_hrv ?? round(avgHrv(data?.sleepDetail));
  const rhr = sleep?.lowest_heart_rate ?? round(avgRestingHr(data?.sleepDetail));
  const insights = buildInsights(data, bloods).slice(0, 3);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const tempDev = readiness?.temperature_deviation;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="greet">{greet}</p>
          <p className="date">{prettyDate(readiness?.day || new Date().toISOString())}</p>
        </div>
        <button className="link-btn" onClick={nav.openSettings}>
          Settings
        </button>
      </div>

      {error && data ? <div className="banner">Showing saved data — couldn't refresh ({error})</div> : null}
      {error && !data ? <div className="banner">Couldn't load Oura data: {error}</div> : null}

      <div className="rings">
        <Ring score={readiness?.score} label="Readiness" color="var(--readiness)" />
        <Ring score={sleepDaily?.score} label="Sleep" color="var(--sleep)" />
        <Ring score={activity?.score} label="Activity" color="var(--activity)" />
      </div>

      <Section title="Body, last night">
        <Card>
          <div className="row">
            <Metric label="HRV (avg)" value={hrv} unit="ms" color="var(--info)" />
            <Metric label="Resting HR" value={rhr} unit="bpm" color="var(--info)" />
            <Metric
              label="Temp dev."
              value={tempDev != null ? `${tempDev > 0 ? '+' : ''}${tempDev}` : '—'}
              unit="°C"
              color={tempDev != null && Math.abs(tempDev) >= 0.5 ? 'var(--ok)' : 'var(--text)'}
            />
          </div>
          <div className="row mt">
            <Metric label="SpO₂" value={spo2?.spo2_percentage?.average ? round(spo2.spo2_percentage.average, 1) : '—'} unit="%" />
            <Metric label="Resp. rate" value={sleep?.respiratory_rate ? round(sleep.respiratory_rate, 1) : '—'} unit="/min" />
            <Metric label="Sleep eff." value={sleep?.efficiency ?? '—'} unit="%" />
          </div>
        </Card>
      </Section>

      <Section title="Today's stress">
        <Card>
          <div className="row">
            <Metric label="High stress" value={stress ? round(stressHours(stress.stress_high), 1) : '—'} unit="h" color="var(--stress)" />
            <Metric label="Recovery" value={stress ? round(stressHours(stress.recovery_high), 1) : '—'} unit="h" color="var(--good)" />
            <div className="metric" style={{ display: 'flex', alignItems: 'center' }}>
              {stress?.day_summary ? (
                <Pill text={stress.day_summary} color={stress.day_summary === 'stressful' ? 'var(--warn)' : 'var(--good)'} />
              ) : null}
            </div>
          </div>
        </Card>
      </Section>

      <Section
        title="Top insights"
        action={
          <button className="link-btn" onClick={nav.goInsights}>
            See all
          </button>
        }
      >
        {insights.map((ins, i) => (
          <Card key={i} className="insight">
            <div className="head">
              <span className="bar" style={{ background: SEVERITY[ins.severity].color }} />
              <span className="title">{ins.title}</span>
            </div>
            <div className="detail">{ins.detail}</div>
          </Card>
        ))}
      </Section>

      <div className="window-row">
        {[7, 14, 30].map((d) => (
          <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>
            {d}d
          </button>
        ))}
      </div>
    </div>
  );
}
