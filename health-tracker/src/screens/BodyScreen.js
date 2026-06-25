import React from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card, Section, Metric, Pill, Loading } from '../components/ui';
import TrendChart from '../components/TrendChart';
import { useOuraData } from '../hooks/OuraProvider';
import { latest, series, avgHrv, avgRestingHr } from '../utils/ouraSelect';
import { round } from '../utils/stats';

const RESILIENCE_COLOR = {
  limited: colors.warn,
  adequate: colors.ok,
  solid: colors.good,
  strong: colors.good,
  exceptional: colors.good,
};

export default function BodyScreen() {
  const { data, loading, refresh } = useOuraData();
  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading label="Loading body metrics…" />
      </SafeAreaView>
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>Body</Text>
        <Text style={styles.sub}>Recovery, heart and long-term markers</Text>

        <Section title="Snapshot">
          <Card>
            <View style={styles.row}>
              <Metric label="Avg HRV" value={round(avgHrv(data?.sleepDetail))} unit="ms" color={colors.info} />
              <Metric label="Resting HR" value={round(avgRestingHr(data?.sleepDetail))} unit="bpm" color={colors.info} />
              <Metric label="VO₂ max" value={vo2?.vo2_max ? round(vo2.vo2_max, 1) : '—'} />
            </View>
            <View style={[styles.row, { marginTop: 14, alignItems: 'center' }]}>
              <Metric
                label="Cardio age"
                value={cardioAge?.vascular_age ?? '—'}
                unit={cardioAge?.vascular_age ? 'yrs' : ''}
              />
              <Metric label="Steps today" value={activity?.steps ? activity.steps.toLocaleString() : '—'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>Resilience</Text>
                {resilience?.level ? (
                  <Pill text={resilience.level} color={RESILIENCE_COLOR[resilience.level] || colors.textDim} />
                ) : (
                  <Text style={{ color: colors.text }}>—</Text>
                )}
              </View>
            </View>
          </Card>
        </Section>

        <Section title="HRV — autonomic recovery">
          <Card>
            <TrendChart points={hrvPts} color={colors.info} />
            <Text style={styles.note}>Higher and stable HRV = better recovery and stress resilience.</Text>
          </Card>
        </Section>

        <Section title="Resting heart rate">
          <Card>
            <TrendChart points={rhrPts} color={colors.readiness} />
            <Text style={styles.note}>Lower is generally fitter. A sustained rise can flag stress or illness.</Text>
          </Card>
        </Section>

        <Section title="Body temperature deviation">
          <Card>
            <TrendChart points={tempPts} color={colors.activity} band={[-0.3, 0.3]} unit="°" />
            <Text style={styles.note}>Deviation from her baseline. Big swings can mean illness or cycle phase.</Text>
          </Card>
        </Section>

        <Section title="Blood oxygen (SpO₂)">
          <Card>
            <TrendChart points={spo2Pts} color={colors.info} band={[95, 100]} unit="%" />
          </Card>
        </Section>

        <Section title="Daily steps">
          <Card>
            <TrendChart points={stepsPts} color={colors.activity} />
          </Card>
        </Section>
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
  metricLabel: { color: colors.textDim, fontSize: 12, marginBottom: 4 },
  note: { color: colors.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
});
