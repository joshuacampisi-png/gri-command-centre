import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card } from '../components/ui';
import { clearToken } from '../storage/secureToken';
import { useOuraData } from '../hooks/OuraProvider';

export default function SettingsScreen({ navigation, onDisconnect }) {
  const { data, fromCache, error } = useOuraData();

  function disconnect() {
    Alert.alert('Disconnect Oura?', 'Removes the saved token from this device. Your blood results stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearToken();
          onDisconnect();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>

        <Card style={{ marginTop: 16 }}>
          <Text style={styles.label}>Oura connection</Text>
          <Text style={styles.value}>
            {error ? 'Reconnect needed' : data ? 'Connected' : 'Connecting…'}
          </Text>
          {data?.info?.email ? <Text style={styles.meta}>{data.info.email}</Text> : null}
          {data?.fetchedAt ? (
            <Text style={styles.meta}>
              Last synced {new Date(data.fetchedAt).toLocaleString()}
              {fromCache ? ' (cached)' : ''}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.danger} onPress={disconnect}>
            <Text style={styles.dangerText}>Disconnect Oura</Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={styles.label}>About</Text>
          <Text style={styles.about}>
            Vitals reads live data from the Oura Ring API and stores her blood results privately on
            this device. Nothing is uploaded to any server. Reference ranges are general adult
            guides and vary by lab — always defer to the ranges on her actual pathology report.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 18 },
  back: { color: colors.accent, fontSize: 15, marginBottom: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  label: { color: colors.textDim, fontSize: 12, marginBottom: 4 },
  value: { color: colors.text, fontSize: 18, fontWeight: '700' },
  meta: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  danger: { marginTop: 16, borderWidth: 1, borderColor: colors.warn, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  dangerText: { color: colors.warn, fontWeight: '600' },
  about: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
});
