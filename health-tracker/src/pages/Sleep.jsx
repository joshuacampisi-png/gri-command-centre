import React from 'react';
import { Card, Section, Metric, Spinner, Empty } from '../components/ui.jsx';
import TrendChart from '../components/TrendChart.jsx';
import { latestSleep, series } from '../lib/ouraSelect';
import { fmtDuration, prettyDate } from '../lib/dates';
import { round } from '../lib/stats';

function StageBar({ sleep }) {
  const total = sleep.total_sleep_duration + (sleep.awake_time || 0);
  const seg = (d, c) => ({ flexGrow: Math.max(0.0001, (d || 0) / total), background: c });
  return (
    <div>
      <div className="stage-bar">
        <span style={seg(sleep.deep_sleep_duration, '#5B5BD6')} />
        <span style={seg(sleep.rem_sleep_duration, '#8B7FF0')} />
        <span style={seg(sleep.light_sleep_duration, '#B4AEF5')} />
        <span style={seg(sleep.awake_time, 'var(--border)')} />
      </div>
      <div className="legend">
        <Legend c="#5B5BD6" t={`Deep ${fmtDuration(sleep.deep_sleep_duration)}`} />
        <Legend c="#8B7FF0" t={`REM ${fmtDuration(sleep.rem_sleep_duration)}`} />
        <Legend c="#B4AEF5" t={`Light ${fmtDuration(sleep.light_sleep_duration)}`} />
        <Legend c="var(--border)" t={`Awake ${fmtDuration(sleep.awake_time)}`} />
      </div>
    </div>
  );
}
function Legend({ c, t }) {
  return (
    <span className="item">
      <span className="dot" style={{ background: c }} />
      {t}
    </span>
  );
}

export default function Sleep({ oura }) {
  const { data, loading } = oura;
  if (loading && !data) {
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  }

  const sleep = latestSleep(data?.sleepDetail);
  const scorePts = series(data?.sleepDaily, (d) => d.score);
  const durationPts = series(data?.sleepDetail, (d) => round((d.total_sleep_duration || 0) / 3600, 1));
  const hrvPts = series(data?.sleepDetail, (d) => d.average_hrv);
  const effPts = series(data?.sleepDetail, (d) => d.efficiency);

  return (
    <div className="page">
      <h1>Sleep</h1>
      {!sleep ? (
        <Empty title="No sleep data yet" sub="Wear the ring overnight and pull to refresh." />
      ) : (
        <>
          <p className="sub">Last night · {prettyDate(sleep.day)}</p>
          <Section>
            <Card>
              <div className="row">
                <Metric label="Time asleep" value={fmtDuration(sleep.total_sleep_duration)} />
                <Metric label="In bed" value={fmtDuration(sleep.time_in_bed)} />
                <Metric label="Efficiency" value={sleep.efficiency} unit="%" />
              </div>
              <div style={{ height: 16 }} />
              <StageBar sleep={sleep} />
            </Card>
          </Section>

          <Section title="Vitals during sleep">
            <Card>
              <div className="row">
                <Metric label="Avg HRV" value={round(sleep.average_hrv)} unit="ms" color="var(--info)" />
                <Metric label="Avg HR" value={round(sleep.average_heart_rate)} unit="bpm" color="var(--info)" />
                <Metric label="Lowest HR" value={sleep.lowest_heart_rate} unit="bpm" color="var(--info)" />
              </div>
              <div className="row mt">
                <Metric label="Resp. rate" value={round(sleep.respiratory_rate, 1)} unit="/min" />
                <Metric label="Latency" value={fmtDuration(sleep.latency)} />
                <Metric label="Restless" value={sleep.restless_periods ?? '—'} />
              </div>
            </Card>
          </Section>

          <Section title="Sleep score trend">
            <Card>
              <TrendChart points={scorePts} color="var(--sleep)" band={[70, 100]} />
            </Card>
          </Section>

          <Section title="Hours asleep">
            <Card>
              <TrendChart points={durationPts} color="var(--sleep)" band={[7, 9]} unit="h" />
            </Card>
          </Section>

          <Section title="Overnight HRV trend">
            <Card>
              <TrendChart points={hrvPts} color="var(--info)" />
            </Card>
          </Section>

          <Section title="Sleep efficiency trend">
            <Card>
              <TrendChart points={effPts} color="var(--good)" band={[85, 100]} unit="%" />
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
