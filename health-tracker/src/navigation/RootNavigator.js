import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';

import TodayScreen from '../screens/TodayScreen';
import SleepScreen from '../screens/SleepScreen';
import BodyScreen from '../screens/BodyScreen';
import BloodsScreen from '../screens/BloodsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import BloodEntryScreen from '../screens/BloodEntryScreen';
import BloodDetailScreen from '../screens/BloodDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, border: colors.border, text: colors.text, primary: colors.accent },
};

// Simple text glyphs avoid pulling an icon-font dependency.
const ICONS = { Today: '◎', Sleep: '☾', Body: '❤', Bloods: '🩸', Insights: '✦' };

function TabIcon({ name, color }) {
  return <Text style={{ color, fontSize: 18 }}>{ICONS[name]}</Text>;
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 86, paddingTop: 8 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Sleep" component={SleepScreen} />
      <Tab.Screen name="Body" component={BodyScreen} />
      <Tab.Screen name="Bloods" component={BloodsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator({ onDisconnect }) {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="BloodEntry" component={BloodEntryScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="BloodDetail" component={BloodDetailScreen} />
        <Stack.Screen name="Settings">
          {(props) => <SettingsScreen {...props} onDisconnect={onDisconnect} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
