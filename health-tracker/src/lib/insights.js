// Turns raw Oura trends + blood results into plain-language insights.
// Severity: 'high' (act soon) | 'medium' (watch) | 'good' (positive) | 'info'.
import { MARKER_BY_ID, evaluate } from './bloodMarkers';
import { latest, avgHrv, avgRestingHr, byDayAsc } from './ouraSelect';
import { slope, mean, round } from './stats';

function latestValueByMarker(results) {
  const out = {};
  for (const r of results || []) {
    if (!out[r.markerId] || r.date > out[r.markerId].date) out[r.markerId] = r;
  }
  return out;
}

export function buildInsights(oura, bloodResults) {
  const insights = [];
  const add = (severity, title, detail, tag) => insights.push({ severity, title, detail, tag });

  if (oura) {
    const sleepScores = byDayAsc(oura.sleepDaily).map((d) => d.score).filter((x) => x != null);
    const hrvSeries = byDayAsc(oura.sleepDetail).map((s) => s.average_hrv).filter(Boolean);
    const rhrSeries = byDayAsc(oura.sleepDetail).map((s) => s.lowest_heart_rate).filter(Boolean);

    const hrvTrend = slope(hrvSeries);
    if (hrvSeries.length >= 5 && hrvTrend < -0.4) {
      add('medium', 'HRV is trending down', `Her average overnight HRV has been falling (now ~${round(mean(hrvSeries.slice(-3)))} ms). Declining HRV often tracks accumulated stress, under-recovery, illness or poor sleep.`, 'Recovery');
    } else if (hrvSeries.length >= 5 && hrvTrend > 0.4) {
      add('good', 'HRV is improving', 'Overnight HRV is trending up — a good sign of recovery and adaptation.', 'Recovery');
    }

    const rhrTrend = slope(rhrSeries);
    if (rhrSeries.length >= 5 && rhrTrend > 0.3) {
      add('medium', 'Resting heart rate is creeping up', `Lowest overnight heart rate is rising (now ~${round(mean(rhrSeries.slice(-3)))} bpm). A sustained rise can precede illness, or follow alcohol, late meals or stress.`, 'Recovery');
    }

    const lastReady = latest(oura.readiness);
    if (lastReady && lastReady.temperature_deviation != null && Math.abs(lastReady.temperature_deviation) >= 0.5) {
      add(Math.abs(lastReady.temperature_deviation) >= 1 ? 'high' : 'medium', 'Body temperature is off baseline', `Last night's body temperature deviated ${lastReady.temperature_deviation > 0 ? '+' : ''}${lastReady.temperature_deviation}°C from baseline. Worth watching for illness, or it may reflect her cycle phase.`, 'Body');
    }

    if (sleepScores.length >= 3) {
      const recentSleep = mean(sleepScores.slice(-3));
      if (recentSleep < 70) {
        add('medium', 'Sleep has been below par', `Average sleep score over recent nights is ${round(recentSleep)}. Check bedtime consistency and total sleep on the Sleep tab.`, 'Sleep');
      } else if (recentSleep >= 85) {
        add('good', 'Sleep is strong', `Average sleep score is ${round(recentSleep)} over recent nights — keep it up.`, 'Sleep');
      }
    }

    const stressHrs = (oura.stress || []).map((d) => (d.stress_high || 0) / 3600);
    if (stressHrs.length && mean(stressHrs.slice(-3)) > 4) {
      add('medium', 'High daytime stress load', `Averaging ${round(mean(stressHrs.slice(-3)), 1)}h/day of elevated stress recently. Recovery windows (walks, breathwork, downtime) help offset this.`, 'Stress');
    }
  }

  const latestBloods = latestValueByMarker(bloodResults);
  for (const markerId of Object.keys(latestBloods)) {
    const marker = MARKER_BY_ID[markerId];
    if (!marker) continue;
    const r = latestBloods[markerId];
    const status = evaluate(marker, Number(r.value));
    if (status === 'low' || status === 'high') {
      add(marker.cycleDependent ? 'info' : 'medium', `${marker.name} is ${status === 'low' ? 'below' : 'above'} range`, `Latest ${marker.name.toLowerCase()} was ${r.value} ${marker.unit} (reference ${marker.low}–${marker.high}). ${marker.desc}${marker.cycleDependent ? ' This marker swings with the menstrual cycle, so timing matters.' : ''}`, 'Bloods');
    }
  }

  if (oura && bloodResults && bloodResults.length) {
    const ferritin = latestBloods['ferritin'];
    const rhrAvg = avgRestingHr(oura.sleepDetail);
    const hrvAvg = avgHrv(oura.sleepDetail);

    if (ferritin && Number(ferritin.value) < 30) {
      add('high', 'Low iron stores may be driving fatigue', `Ferritin is ${ferritin.value} µg/L (low). Low iron commonly causes tiredness, breathlessness and poor recovery${rhrAvg ? `, and can show up as an elevated resting heart rate (hers averages ~${round(rhrAvg)} bpm)` : ''}. Worth discussing iron with her GP.`, 'Iron + Recovery');
    }

    const vitd = latestBloods['vitd'];
    if (vitd && Number(vitd.value) < 50) {
      add('medium', 'Low vitamin D alongside sleep data', `Vitamin D is ${vitd.value} nmol/L (low), which is linked with poorer sleep and low mood — cross-check her sleep scores on the Sleep tab.`, 'Vitamin D + Sleep');
    }

    const tsh = latestBloods['tsh'];
    if (tsh && Number(tsh.value) > 4 && rhrAvg && hrvAvg) {
      add('medium', 'Thyroid + recovery worth a look', `TSH is ${tsh.value} mIU/L (elevated), which can lower energy and metabolism. Pair this with her HRV (~${round(hrvAvg)} ms) and resting HR when reviewing with a doctor.`, 'Thyroid');
    }
  }

  const rank = { high: 0, medium: 1, good: 2, info: 3 };
  insights.sort((a, b) => rank[a.severity] - rank[b.severity]);

  if (!insights.length) {
    add('good', 'Nothing flagged', 'No notable trends or out-of-range markers right now. Keep logging and the picture sharpens over time.', 'All clear');
  }
  return insights;
}
