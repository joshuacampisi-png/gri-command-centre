import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme';
import { getToken } from './src/storage/secureToken';
import { OuraProvider } from './src/hooks/OuraProvider';
import OnboardingScreen from './src/screens/OnboardingScreen';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const [token, setToken] = useState(undefined); // undefined = loading, null = none
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getToken().then((t) => {
      setToken(t || null);
      setChecked(true);
    });
  }, []);

  if (!checked) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {token ? (
        <OuraProvider token={token}>
          <RootNavigator onDisconnect={() => setToken(null)} />
        </OuraProvider>
      ) : (
        <OnboardingScreen onConnected={(t) => setToken(t)} />
      )}
    </SafeAreaProvider>
  );
}
