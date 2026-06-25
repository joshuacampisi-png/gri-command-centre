import React from 'react';
import { Card, Section, Metric, Pill, Spinner } from '../components/ui.jsx';
import TrendChart from '../components/TrendChart.jsx';
import { latest, series, avgHrv, avgRestingHr } from '../lib/ouraSelect';
import { round } from '../lib/stats';

const RESILIENCE_COLOR = {
  limited: 'var(--warn)',
  adequate: 'var(--ok)',
  solid: 'var(--good)',
  strong: 'var(--good)',
  exceptional: 'var(--good)',
};

export default function Body({ oura }) {
  const { data, loading } = oura;
  if (loading && !data) {
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  }

  const hrvPts = series(data?.sleepDetail, (d) => d.average_hrv);
  const rhrPts = series(data?.sleepDetail, (d) => d.lowest_heart_rate);
  const tempPts = series(data?.readiness, (d) => d.temperature_deviation);
  const spo2Pts = series(data?.spo2, (d) => d.spo2_percentage?.average);
  const stepsPts = series(data?.activity, (d) => d.steps);

  const resilience = latest(data?.resilience);
  const cardioAge = latest(data?.cardioAge);
  const vo2 = latest(data?.vo2);
  const activity = latest(data?.activity);

  return (
    <div className="page">
      <h1>Body</h1>
      <p className="sub">Recovery, heart and long-term markers</p>

      <Section title="Snapshot">
        <Card>
          <div className="row">
            <Metric label="Avg HRV" value={round(avgHrv(data?.sleepDetail))} unit="ms" color="var(--info)" />
            <Metric label="Resting HR" value={round(avgRestingHr(data?.sleepDetail))} unit="bpm" color="var(--info)" />
            <Metric label="VO₂ max" value={vo2?.vo2_max ? round(vo2.vo2_max, 1) : '—'} />
          </div>
          <div className="row mt">
            <Metric label="Cardio age" value={cardioAge?.vascular_age ?? '—'} unit={cardioAge?.vascular_age ? 'yrs' : ''} />
            <Metric label="Steps today" value={activity?.steps ? activity.steps.toLocaleString() : '—'} />
            <div className="metric">
              <div className="label">Resilience</div>
              {resilience?.level ? (
                <Pill text={resilience.level} color={RESILIENCE_COLOR[resilience.level] || 'var(--dim)'} />
              ) : (
                <div className="value">—</div>
              )}
            </div>
          </div>
        </Card>
      </Section>

      <Section title="HRV — autonomic recovery">
        <Card>
          <TrendChart points={hrvPts} color="var(--info)" />
          <p className="note">Higher and stable HRV = better recovery and stress resilience.</p>
        </Card>
      </Section>

      <Section title="Resting heart rate">
        <Card>
          <TrendChart points={rhrPts} color="var(--readiness)" />
          <p className="note">Lower is generally fitter. A sustained rise can flag stress or illness.</p>
        </Card>
      </Section>

      <Section title="Body temperature deviation">
        <Card>
          <TrendChart points={tempPts} color="var(--activity)" band={[-0.3, 0.3]} unit="°" />
          <p className="note">Deviation from her baseline. Big swings can mean illness or cycle phase.</p>
        </Card>
      </Section>

      <Section title="Blood oxygen (SpO₂)">
        <Card>
          <TrendChart points={spo2Pts} color="var(--info)" band={[95, 100]} unit="%" />
        </Card>
      </Section>

      <Section title="Daily steps">
        <Card>
          <TrendChart points={stepsPts} color="var(--activity)" />
        </Card>
      </Section>
    </div>
  );
}
