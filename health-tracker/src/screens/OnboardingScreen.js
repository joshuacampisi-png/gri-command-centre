import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, radius } from '../theme';
import { oura } from '../api/oura';
import { saveToken } from '../storage/secureToken';

export default function OnboardingScreen({ onConnected }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const info = await oura.verify(token.trim());
      await saveToken(token.trim());
      setName(info?.email || 'your ring');
      onConnected(token.trim());
    } catch (e) {
      setError(e.message || 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Vitals</Text>
        <Text style={styles.tag}>Everything her body is telling her — in one place.</Text>

        <View style={styles.card}>
          <Text style={styles.h}>Connect her Oura Ring</Text>
          <Text style={styles.p}>
            Vitals reads sleep, readiness, stress and body data straight from Oura. You'll need a
            free Personal Access Token from her Oura account.
          </Text>

          <View style={styles.steps}>
            <Step n="1" t="Sign in to the Oura web dashboard with her account." />
            <Step n="2" t="Open Personal Access Tokens and create a new token." />
            <Step n="3" t="Copy it and paste it below." />
          </View>

          <TouchableOpacity
            onPress={() => Linking.openURL('https://cloud.ouraring.com/personal-access-tokens')}
          >
            <Text style={styles.link}>Open Oura token page ↗</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Paste Oura Personal Access Token"
            placeholderTextColor={colors.textFaint}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, (!token || busy) && styles.btnDisabled]}
            onPress={connect}
            disabled={!token || busy}
          >
            {busy ? (
              <ActivityIndicator color="#0B0F14" />
            ) : (
              <Text style={styles.btnText}>Connect</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.fine}>
            The token is stored encrypted on this device only (secure keystore). It never leaves the
            phone except to talk to Oura directly.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ n, t }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={{ color: colors.bg, fontWeight: '700' }}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{t}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 80, paddingBottom: 60 },
  brand: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: 0.5 },
  tag: { color: colors.textDim, fontSize: 15, marginTop: 6, marginBottom: 28 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  h: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  p: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  steps: { marginTop: 16, marginBottom: 8 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepText: { color: colors.text, flex: 1, fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600', marginBottom: 18 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 14,
    fontSize: 14,
  },
  err: { color: colors.warn, marginTop: 12, fontSize: 13 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#0B0F14', fontWeight: '700', fontSize: 16 },
  fine: { color: colors.textFaint, fontSize: 12, marginTop: 16, lineHeight: 17 },
});
