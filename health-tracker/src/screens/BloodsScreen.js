import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card, Section, Pill, Empty } from '../components/ui';
import { getAllResults } from '../storage/bloodStore';
import { MARKER_BY_ID, CATEGORIES, evaluate, statusLabel } from '../data/bloodMarkers';
import { prettyDate } from '../utils/dates';

const STATUS_COLOR = { low: colors.warn, high: colors.warn, optimal: colors.good, in: colors.ok, unknown: colors.textFaint };

function latestByMarker(results) {
  const out = {};
  for (const r of results) {
    if (!out[r.markerId] || r.date > out[r.markerId].date) out[r.markerId] = r;
  }
  return out;
}

export default function BloodsScreen({ navigation }) {
  const [results, setResults] = useState(null);

  const load = useCallback(() => {
    getAllResults().then(setResults);
  }, []);
  React.useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  const latest = results ? latestByMarker(results) : {};
  const markerIds = Object.keys(latest);
  const flaggedCount = markerIds.filter((id) => {
    const s = evaluate(MARKER_BY_ID[id], Number(latest[id].value));
    return s === 'low' || s === 'high';
  }).length;

  const byCat = {};
  for (const id of markerIds) {
    const cat = MARKER_BY_ID[id]?.category;
    if (!cat) continue;
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(id);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Bloods</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('BloodEntry')}>
            <Text style={styles.addText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {!markerIds.length ? (
          <Empty
            title="No blood results yet"
            sub="Tap + Add to enter results from her pathology reports. The app flags anything out of range and tracks every marker over time."
          />
        ) : (
          <>
            <Text style={styles.summary}>
              {markerIds.length} markers tracked ·{' '}
              <Text style={{ color: flaggedCount ? colors.warn : colors.good }}>
                {flaggedCount} out of range
              </Text>
            </Text>

            {CATEGORIES.filter((c) => byCat[c]).map((cat) => (
              <Section key={cat} title={cat}>
                {byCat[cat]
                  .map((id) => ({ id, marker: MARKER_BY_ID[id], r: latest[id] }))
                  .sort((a, b) => a.marker.name.localeCompare(b.marker.name))
                  .map(({ id, marker, r }) => {
                    const status = evaluate(marker, Number(r.value));
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => navigation.navigate('BloodDetail', { markerId: id })}
                      >
                        <Card style={styles.markerCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.markerName}>{marker.name}</Text>
                            <Text style={styles.markerMeta}>
                              ref {marker.low}–{marker.high} {marker.unit} · {prettyDate(r.date)}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.value, { color: STATUS_COLOR[status] }]}>
                              {r.value} <Text style={styles.unit}>{marker.unit}</Text>
                            </Text>
                            <Pill text={statusLabel(status)} color={STATUS_COLOR[status]} />
                          </View>
                        </Card>
                      </TouchableOpacity>
                    );
                  })}
              </Section>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  addText: { color: colors.bg, fontWeight: '700' },
  summary: { color: colors.textDim, fontSize: 14, marginTop: 6, marginBottom: 18 },
  markerCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingVertical: 12 },
  markerName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  markerMeta: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  value: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  unit: { fontSize: 12, color: colors.textDim, fontWeight: '400' },
});
