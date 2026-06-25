// Small shared presentational components used across screens.
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, action, children }) {
  return (
    <View style={{ marginBottom: 22 }}>
      {title ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {action || null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// A labelled metric value, optionally with a status colour and subtitle.
export function Metric({ label, value, unit, sub, color = colors.text, flex = 1 }) {
  return (
    <View style={{ flex }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[styles.metricValue, { color }]}>{value ?? '—'}</Text>
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </View>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

export function Pill({ text, color = colors.textDim, bg }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg || 'rgba(255,255,255,0.06)' }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.textDim, marginTop: 10 }}>{label}</Text>
    </View>
  );
}

export function Empty({ title, sub }) {
  return (
    <View style={styles.center}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      {sub ? (
        <Text style={{ color: colors.textDim, marginTop: 6, textAlign: 'center' }}>{sub}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  metricLabel: { color: colors.textDim, fontSize: 12, marginBottom: 3 },
  metricValue: { fontSize: 22, fontWeight: '700' },
  metricUnit: { color: colors.textDim, fontSize: 13 },
  metricSub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  center: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
});
