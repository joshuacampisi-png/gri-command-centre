import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card, Section, Metric, Loading, Empty } from '../components/ui';
import TrendChart from '../components/TrendChart';
import { useOuraData } from '../hooks/OuraProvider';
import { latestSleep, series } from '../utils/ouraSelect';
import { fmtDuration, prettyDate } from '../utils/dates';
import { round } from '../utils/stats';

function StageBar({ sleep }) {
  const total = sleep.total_sleep_duration + (sleep.awake_time || 0);
  const seg = (d, c) => ({ flex: Math.max(0.0001, (d || 0) / total), backgroundColor: c });
  return (
    <View>
      <View style={styles.stageBar}>
        <View style={seg(sleep.deep_sleep_duration, '#5B5BD6')} />
        <View style={seg(sleep.rem_sleep_duration, '#8B7FF0')} />
        <View style={seg(sleep.light_sleep_duration, '#B4AEF5')} />
        <View style={seg(sleep.awake_time, colors.border)} />
      </View>
      <View style={styles.legend}>
        <Legend c="#5B5BD6" t={`Deep ${fmtDuration(sleep.deep_sleep_duration)}`} />
        <Legend c="#8B7FF0" t={`REM ${fmtDuration(sleep.rem_sleep_duration)}`} />
        <Legend c="#B4AEF5" t={`Light ${fmtDuration(sleep.light_sleep_duration)}`} />
        <Legend c={colors.border} t={`Awake ${fmtDuration(sleep.awake_time)}`} />
      </View>
    </View>
  );
}

function Legend({ c, t }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: c }]} />
      <Text style={styles.legendText}>{t}</Text>
    </View>
  );
}

export default function SleepScreen() {
  const { data, loading, refresh } = useOuraData();
  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading label="Loading sleep…" />
      </SafeAreaView>
    );
  }

  const sleep = latestSleep(data?.sleepDetail);
  const scorePts = series(data?.sleepDaily, (d) => d.score);
  const durationPts = series(data?.sleepDetail, (d) => round((d.total_sleep_duration || 0) / 3600, 1));
  const hrvPts = series(data?.sleepDetail, (d) => d.average_hrv);
  const effPts = series(data?.sleepDetail, (d) => d.efficiency);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>Sleep</Text>

        {!sleep ? (
          <Empty title="No sleep data yet" sub="Wear the ring overnight and pull to refresh." />
        ) : (
          <>
            <Text style={styles.sub}>Last night · {prettyDate(sleep.day)}</Text>
            <Section>
              <Card>
                <View style={styles.row}>
                  <Metric label="Time asleep" value={fmtDuration(sleep.total_sleep_duration)} />
                  <Metric label="In bed" value={fmtDuration(sleep.time_in_bed)} />
                  <Metric label="Efficiency" value={sleep.efficiency} unit="%" />
                </View>
                <View style={{ height: 16 }} />
                <StageBar sleep={sleep} />
              </Card>
            </Section>

            <Section title="Vitals during sleep">
              <Card>
                <View style={styles.row}>
                  <Metric label="Avg HRV" value={round(sleep.average_hrv)} unit="ms" color={colors.info} />
                  <Metric label="Avg HR" value={round(sleep.average_heart_rate)} unit="bpm" color={colors.info} />
                  <Metric label="Lowest HR" value={sleep.lowest_heart_rate} unit="bpm" color={colors.info} />
                </View>
                <View style={[styles.row, { marginTop: 14 }]}>
                  <Metric label="Resp. rate" value={round(sleep.respiratory_rate, 1)} unit="/min" />
                  <Metric label="Latency" value={fmtDuration(sleep.latency)} />
                  <Metric label="Restless" value={sleep.restless_periods ?? '—'} />
                </View>
              </Card>
            </Section>

            <Section title="Sleep score trend">
              <Card>
                <TrendChart points={scorePts} color={colors.sleep} band={[70, 100]} />
              </Card>
            </Section>

            <Section title="Hours asleep">
              <Card>
                <TrendChart points={durationPts} color={colors.sleep} band={[7, 9]} unit="h" />
              </Card>
            </Section>

            <Section title="Overnight HRV trend">
              <Card>
                <TrendChart points={hrvPts} color={colors.info} />
              </Card>
            </Section>

            <Section title="Sleep efficiency trend">
              <Card>
                <TrendChart points={effPts} color={colors.good} band={[85, 100]} unit="%" />
              </Card>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 2, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stageBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 9, height: 9, borderRadius: 5, marginRight: 6 },
  legendText: { color: colors.textDim, fontSize: 12 },
});
