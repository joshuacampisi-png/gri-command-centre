import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { Card } from '../components/ui';
import { MARKERS, CATEGORIES, evaluate, statusLabel } from '../data/bloodMarkers';
import { addMany } from '../storage/bloodStore';
import { isoDate } from '../utils/dates';

const STATUS_COLOR = { low: colors.warn, high: colors.warn, optimal: colors.good, in: colors.ok, unknown: colors.textFaint };

export default function BloodEntryScreen({ navigation }) {
  const [date, setDate] = useState(isoDate());
  const [lab, setLab] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState({}); // markerId -> string

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? MARKERS.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)) : MARKERS;
    const byCat = {};
    for (const m of list) {
      if (!byCat[m.category]) byCat[m.category] = [];
      byCat[m.category].push(m);
    }
    return byCat;
  }, [search]);

  const entered = Object.keys(values).filter((k) => values[k] !== '' && values[k] != null);

  function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Check the date', 'Use the format YYYY-MM-DD.');
      return;
    }
    const rows = entered
      .map((markerId) => {
        const m = MARKERS.find((x) => x.id === markerId);
        const num = parseFloat(values[markerId]);
        if (isNaN(num)) return null;
        return { markerId, value: num, unit: m.unit, date, lab: lab.trim() || undefined };
      })
      .filter(Boolean);

    if (!rows.length) {
      Alert.alert('Nothing to save', 'Enter at least one result.');
      return;
    }
    addMany(rows).then(() => {
      Alert.alert('Saved', `${rows.length} result${rows.length > 1 ? 's' : ''} added for ${date}.`);
      navigation.goBack();
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add results</Text>
          <TouchableOpacity onPress={save}>
            <Text style={[styles.save, !entered.length && { opacity: 0.4 }]}>Save ({entered.length})</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Test date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Lab / source (optional)</Text>
            <TextInput
              style={styles.input}
              value={lab}
              onChangeText={setLab}
              placeholder="e.g. Sonic, Australian Clinical Labs"
              placeholderTextColor={colors.textFaint}
            />
          </Card>

          <TextInput
            style={[styles.input, { marginBottom: 14 }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search markers (e.g. ferritin, thyroid)"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
          />

          {CATEGORIES.filter((c) => filtered[c]).map((cat) => (
            <View key={cat} style={{ marginBottom: 18 }}>
              <Text style={styles.catTitle}>{cat}</Text>
              {filtered[cat].map((m) => {
                const v = values[m.id] ?? '';
                const status = v !== '' ? evaluate(m, parseFloat(v)) : 'unknown';
                return (
                  <View key={m.id} style={styles.markerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.markerName}>{m.name}</Text>
                      <Text style={styles.markerRef}>
                        {m.low}–{m.high} {m.unit}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.valueInput}
                      value={v}
                      onChangeText={(t) => setValues((s) => ({ ...s, [m.id]: t }))}
                      placeholder="—"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="decimal-pad"
                    />
                    <View style={styles.statusCol}>
                      {v !== '' ? (
                        <Text style={{ color: STATUS_COLOR[status], fontSize: 11, fontWeight: '600' }}>
                          {statusLabel(status)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  cancel: { color: colors.textDim, fontSize: 15 },
  save: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  scroll: { padding: 18 },
  label: { color: colors.textDim, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 12,
    fontSize: 15,
  },
  catTitle: { color: colors.accent, fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  markerName: { color: colors.text, fontSize: 15 },
  markerRef: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
  valueInput: {
    width: 70,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    textAlign: 'right',
  },
  statusCol: { width: 84, alignItems: 'flex-end' },
});
