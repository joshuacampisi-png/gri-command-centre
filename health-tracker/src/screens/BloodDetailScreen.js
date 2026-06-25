import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card, Section, Pill } from '../components/ui';
import TrendChart from '../components/TrendChart';
import { historyFor, deleteResult } from '../storage/bloodStore';
import { MARKER_BY_ID, evaluate, statusLabel } from '../data/bloodMarkers';
import { prettyDate, shortLabel } from '../utils/dates';

const STATUS_COLOR = { low: colors.warn, high: colors.warn, optimal: colors.good, in: colors.ok, unknown: colors.textFaint };

export default function BloodDetailScreen({ route, navigation }) {
  const { markerId } = route.params;
  const marker = MARKER_BY_ID[markerId];
  const [history, setHistory] = useState([]);

  const load = useCallback(() => {
    historyFor(markerId).then(setHistory);
  }, [markerId]);
  React.useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  if (!marker) return null;

  const points = history.map((r) => ({
    label: shortLabel(r.date),
    value: Number(r.value),
  }));
  const latest = history[history.length - 1];
  const latestStatus = latest ? evaluate(marker, Number(latest.value)) : 'unknown';

  function confirmDelete(id) {
    Alert.alert('Delete result?', 'This removes the single result permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteResult(id).then(load),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Bloods</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{marker.name}</Text>
        <Text style={styles.sub}>{marker.desc}</Text>

        {latest ? (
          <Card style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={styles.latestLabel}>Latest · {prettyDate(latest.date)}</Text>
                <Text style={[styles.latestValue, { color: STATUS_COLOR[latestStatus] }]}>
                  {latest.value} <Text style={styles.unit}>{marker.unit}</Text>
                </Text>
              </View>
              <Pill text={statusLabel(latestStatus)} color={STATUS_COLOR[latestStatus]} />
            </View>
            <Text style={styles.ref}>
              Reference {marker.low}–{marker.high} {marker.unit}
              {marker.optimalLow || marker.optimalHigh
                ? `  ·  optimal ${marker.optimalLow ?? marker.low}–${marker.optimalHigh ?? marker.high}`
                : ''}
            </Text>
          </Card>
        ) : null}

        <Section title="Trend">
          <Card>
            <TrendChart
              points={points}
              color={colors.accent}
              band={[marker.optimalLow ?? marker.low, marker.optimalHigh ?? marker.high]}
              unit={marker.unit === '%' ? '%' : ''}
            />
          </Card>
        </Section>

        <Section title="History">
          {[...history].reverse().map((r) => {
            const s = evaluate(marker, Number(r.value));
            return (
              <Card key={r.id} style={styles.histRow}>
                <View>
                  <Text style={styles.histValue}>
                    {r.value} <Text style={styles.unit}>{marker.unit}</Text>
                  </Text>
                  <Text style={styles.histDate}>
                    {prettyDate(r.date)}
                    {r.lab ? ` · ${r.lab}` : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pill text={statusLabel(s)} color={STATUS_COLOR[s]} />
                  <TouchableOpacity onPress={() => confirmDelete(r.id)}>
                    <Text style={styles.del}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18, paddingBottom: 40 },
  back: { color: colors.accent, fontSize: 15, marginBottom: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 4, marginBottom: 18, lineHeight: 19 },
  latestLabel: { color: colors.textDim, fontSize: 12 },
  latestValue: { fontSize: 30, fontWeight: '800', marginTop: 4 },
  unit: { fontSize: 14, color: colors.textDim, fontWeight: '400' },
  ref: { color: colors.textFaint, fontSize: 12, marginTop: 12 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  histValue: { color: colors.text, fontSize: 16, fontWeight: '600' },
  histDate: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  del: { color: colors.warn, fontSize: 13 },
});
