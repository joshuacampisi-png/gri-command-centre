import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, scoreColor } from '../theme';
import { Card, Section, Metric, Pill, Loading } from '../components/ui';
import ScoreRing from '../components/ScoreRing';
import { useOuraData, useWindow } from '../hooks/OuraProvider';
import { latest, latestSleep, avgHrv, avgRestingHr, stressHours } from '../utils/ouraSelect';
import { buildInsights } from '../insights/engine';
import { getAllResults } from '../storage/bloodStore';
import { round } from '../utils/stats';
import { prettyDate } from '../utils/dates';

const SEVERITY_COLOR = { high: colors.warn, medium: colors.ok, good: colors.good, info: colors.info };

export default function TodayScreen({ navigation }) {
  const { data, loading, error, fromCache, refresh } = useOuraData();
  const { days, setDays } = useWindow();
  const [bloods, setBloods] = useState([]);

  const loadBloods = useCallback(() => {
    getAllResults().then(setBloods);
  }, []);
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadBloods);
    loadBloods();
    return unsub;
  }, [navigation, loadBloods]);

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading label="Reading her Oura data…" />
      </SafeAreaView>
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <Text style={styles.greet}>{greet}</Text>
        <Text style={styles.date}>
          {readiness ? prettyDate(readiness.day) : prettyDate(new Date().toISOString())}
        </Text>

        {fromCache && error ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Showing saved data — couldn't refresh ({error})</Text>
          </View>
        ) : null}

        <View style={styles.rings}>
          <ScoreRing score={readiness?.score} label="Readiness" color={colors.readiness} />
          <ScoreRing score={sleepDaily?.score} label="Sleep" color={colors.sleep} />
          <ScoreRing score={activity?.score} label="Activity" color={colors.activity} />
        </View>

        <Section title="Body, last night">
          <Card>
            <View style={styles.row}>
              <Metric label="HRV (avg)" value={hrv} unit="ms" color={colors.info} />
              <Metric label="Resting HR" value={rhr} unit="bpm" color={colors.info} />
              <Metric
                label="Temp dev."
                value={readiness?.temperature_deviation != null ? `${readiness.temperature_deviation > 0 ? '+' : ''}${readiness.temperature_deviation}` : '—'}
                unit="°C"
                color={readiness && Math.abs(readiness.temperature_deviation || 0) >= 0.5 ? colors.ok : colors.text}
              />
            </View>
            <View style={[styles.row, { marginTop: 14 }]}>
              <Metric label="SpO₂" value={spo2?.spo2_percentage?.average ? round(spo2.spo2_percentage.average, 1) : '—'} unit="%" />
              <Metric label="Resp. rate" value={sleep?.respiratory_rate ? round(sleep.respiratory_rate, 1) : '—'} unit="/min" />
              <Metric label="Sleep eff." value={sleep?.efficiency ?? '—'} unit="%" />
            </View>
          </Card>
        </Section>

        <Section title="Today's stress">
          <Card>
            <View style={styles.row}>
              <Metric
                label="High stress"
                value={stress ? round(stressHours(stress.stress_high), 1) : '—'}
                unit="h"
                color={colors.stress}
              />
              <Metric
                label="Recovery"
                value={stress ? round(stressHours(stress.recovery_high), 1) : '—'}
                unit="h"
                color={colors.good}
              />
              <View style={{ flex: 1, justifyContent: 'center' }}>
                {stress?.day_summary ? (
                  <Pill
                    text={stress.day_summary}
                    color={stress.day_summary === 'stressful' ? colors.warn : colors.good}
                  />
                ) : null}
              </View>
            </View>
          </Card>
        </Section>

        <Section
          title="Top insights"
          action={
            <TouchableOpacity onPress={() => navigation.navigate('Insights')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          }
        >
          {insights.map((ins, i) => (
            <Card key={i} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={[styles.dot, { backgroundColor: SEVERITY_COLOR[ins.severity] }]} />
                <Text style={styles.insightTitle}>{ins.title}</Text>
              </View>
              <Text style={styles.insightDetail} numberOfLines={3}>
                {ins.detail}
              </Text>
            </Card>
          ))}
        </Section>

        <View style={styles.windowRow}>
          {[7, 14, 30].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.windowBtn, days === d && styles.windowActive]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.windowText, days === d && { color: colors.bg }]}>{d}d</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18, paddingBottom: 40 },
  greet: { color: colors.text, fontSize: 26, fontWeight: '800' },
  date: { color: colors.textDim, fontSize: 14, marginTop: 2, marginBottom: 18 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  banner: { backgroundColor: 'rgba(251,113,133,0.12)', borderRadius: 10, padding: 10, marginBottom: 16 },
  bannerText: { color: colors.warn, fontSize: 12 },
  seeAll: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  insightTitle: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  insightDetail: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  windowRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 6, gap: 8 },
  windowBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  windowActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  windowText: { color: colors.textDim, fontWeight: '600' },
});
