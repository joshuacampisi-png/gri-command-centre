import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card } from '../components/ui';
import { useOuraData } from '../hooks/OuraProvider';
import { buildInsights } from '../insights/engine';
import { getAllResults } from '../storage/bloodStore';

const SEVERITY = {
  high: { color: colors.warn, label: 'Act soon' },
  medium: { color: colors.ok, label: 'Watch' },
  good: { color: colors.good, label: 'Good' },
  info: { color: colors.info, label: 'Note' },
};

export default function InsightsScreen({ navigation }) {
  const { data, loading, refresh } = useOuraData();
  const [bloods, setBloods] = useState([]);

  const load = useCallback(() => {
    getAllResults().then(setBloods);
  }, []);
  React.useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  const insights = buildInsights(data, bloods);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Insights</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.settings}>Settings</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sub}>
          Patterns across her Oura data and blood results. Educational only — not medical advice.
        </Text>

        {insights.map((ins, i) => {
          const sev = SEVERITY[ins.severity];
          return (
            <Card key={i} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.bar, { backgroundColor: sev.color }]} />
                <Text style={styles.cardTitle}>{ins.title}</Text>
              </View>
              <Text style={styles.detail}>{ins.detail}</Text>
              <View style={styles.tags}>
                <View style={[styles.tag, { borderColor: sev.color }]}>
                  <Text style={[styles.tagText, { color: sev.color }]}>{sev.label}</Text>
                </View>
                {ins.tag ? (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{ins.tag}</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })}

        <Text style={styles.disclaimer}>
          Vitals surfaces patterns to discuss with a qualified clinician. It does not diagnose,
          treat, or replace professional medical advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  settings: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 4, marginBottom: 18, lineHeight: 19 },
  card: { marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bar: { width: 4, height: 18, borderRadius: 2, marginRight: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  detail: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tag: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  disclaimer: { color: colors.textFaint, fontSize: 12, marginTop: 16, lineHeight: 17 },
});
