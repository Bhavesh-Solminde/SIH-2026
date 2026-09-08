/**
 * Bhaav — Collector App
 * Entry point. Wires React Navigation + device DB + sync engine.
 *
 * Navigation structure:
 *   Bottom Tabs (main shell):
 *     Home     → new lot button + earnings tiles
 *     Requests → pending handover confirmations (incoming from recycler)
 *     Ledger   → earnings history
 *     Rates    → price board
 *
 *   Stack screens pushed over tabs (lot creation + handover flows):
 *     Camera → Category → [SubCategory] → Quantity → Condition → Source → Value → Accept
 *     Handover, Safety
 */

import React, { useCallback, useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, AppState, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LanguageProvider } from './src/i18n/LanguageContext';
import { useStrings } from './src/i18n/useStrings';
import { LanguageSwitcher } from './src/components/LanguageSwitcher';
import { colors, spacing } from './src/ui/tokens';

// Tab screens
import HomeScreen            from './src/screens/HomeScreen';
import PendingRequestsScreen from './src/screens/PendingRequestsScreen';
import LedgerScreen          from './src/screens/LedgerScreen';
import PriceBoardScreen      from './src/screens/PriceBoardScreen';

// Stack screens (lot creation + standalone)
import CameraScreen      from './src/screens/CameraScreen';
import CategoryScreen    from './src/screens/CategoryScreen';
import SubCategoryScreen from './src/screens/SubCategoryScreen';
import QuantityScreen    from './src/screens/QuantityScreen';
import ConditionScreen   from './src/screens/ConditionScreen';
import SourceScreen      from './src/screens/SourceScreen';
import ValueScreen       from './src/screens/ValueScreen';
import AcceptScreen      from './src/screens/AcceptScreen';
import HandoverScreen    from './src/screens/HandoverScreen';
import SafetyScreen      from './src/screens/SafetyScreen';
import HandoverEvidenceScreen from './src/screens/HandoverEvidenceScreen';

// Sync engine
import { syncAndGetPending } from './src/screens/SyncEngine';
import { flushLotOutbox } from './src/lib/lotOutbox';

// The phone already knows this laptop's address — it reached the Expo dev server
// over it — so derive the API host from that instead of hardcoding an IP.
//
// This matters because the demo runs over a phone hotspot, not USB, and a
// hotspot hands out a different subnet (10.x) from office Wi-Fi (192.168.x).
// Every hardcoded IP goes stale the moment the network changes, and the failure
// is silent: the app just never reaches the server, while the API log shows only
// 127.0.0.1 from the console and looks perfectly healthy.
//
// EXPO_PUBLIC_API_URL still wins when set, for a build pointed at a real host.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (devHost ? `http://${devHost}:4000` : 'http://localhost:4000');

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_ICON_NAMES = {
  Home:     { active: 'home',          inactive: 'home-outline' },
  // "Requests" (route name unchanged) now displays as "My Lots" and covers
  // the full lot lifecycle — the standalone Lots tab was merged into it, so
  // this inherits its icon too.
  Requests: { active: 'cube',          inactive: 'cube-outline' },
  Ledger:   { active: 'wallet',        inactive: 'wallet-outline' },
  Rates:    { active: 'bar-chart',     inactive: 'bar-chart-outline' },
};

// Stable wrappers for tab screens that don't use db
const RequestsTab = (p) => <PendingRequestsScreen {...p} apiUrl={API_BASE_URL} />;

// The language switcher lives in every header (both navigators below) rather
// than in one screen's body, so it's reachable no matter where the collector
// is in the flow. headerRightContainerStyle nudges it off the screen edge —
// React Navigation's default headerRight padding is tight for 3 pill buttons.
function HeaderLanguageSwitcher() {
  return (
    <View style={{ paddingRight: spacing[3] }}>
      <LanguageSwitcher />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom tab navigator — always visible behind stack screens
// ---------------------------------------------------------------------------
function MainTabs({ db }) {
  const t = useStrings();
  const HomeTab   = useCallback((p) => <HomeScreen       {...p} db={db} />, [db]);
  const LedgerTab = useCallback((p) => <LedgerScreen     {...p} db={db} apiUrl={API_BASE_URL} />, [db]);
  const RatesTab  = useCallback((p) => <PriceBoardScreen {...p} db={db} apiUrl={API_BASE_URL} />, [db]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icon = TAB_ICON_NAMES[route.name];
          return (
            <Ionicons
              name={focused ? icon.active : icon.inactive}
              size={size ?? 24}
              color={color}
            />
          );
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.border,
          height:          68,
          paddingBottom:   8,
          paddingTop:      6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle:      { backgroundColor: colors.surface },
        headerTintColor:  colors.primary,
        headerTitleStyle: { fontWeight: '700' },
        headerRight:      () => <HeaderLanguageSwitcher />,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeTab}
        options={{ title: t('nav_home'), headerTitle: t('nav_home_header') }}
      />
      <Tab.Screen
        name="Requests"
        component={RequestsTab}
        options={{ title: t('nav_requests'), headerTitle: t('nav_requests_header') }}
      />
      <Tab.Screen
        name="Ledger"
        component={LedgerTab}
        options={{ title: t('nav_ledger'), headerTitle: t('nav_ledger_header') }}
      />
      <Tab.Screen
        name="Rates"
        component={RatesTab}
        options={{ title: t('nav_rates'), headerTitle: t('nav_rates_header') }}
      />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root navigator — Stack over the tab shell. Rendered inside LanguageProvider
// so it can call useStrings() for every screen title; App() itself sits above
// the provider and cannot.
// ---------------------------------------------------------------------------
function AppNavigator({ db }) {
  const t = useStrings();

  const stackScreenOptions = {
    headerStyle:      { backgroundColor: colors.surface },
    headerTintColor:  colors.primary,
    headerTitleStyle: { fontWeight: '700' },
    cardStyle:        { backgroundColor: colors.background },
    headerRight:      () => <HeaderLanguageSwitcher />,
  };

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={stackScreenOptions}>
        {/* Main shell — tabs always visible */}
        <Stack.Screen name="Main" options={{ headerShown: false }}>
          {() => <MainTabs db={db} />}
        </Stack.Screen>

        {/* Lot creation flow — pushed over tabs */}
        <Stack.Screen name="Camera"      options={{ title: t('nav_camera') }}>
          {(p) => <CameraScreen      {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="Category"    options={{ title: t('nav_category') }}>
          {(p) => <CategoryScreen    {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="SubCategory" options={{ title: t('nav_subcategory') }}>
          {(p) => <SubCategoryScreen {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="Quantity"    options={{ title: t('nav_quantity') }}>
          {(p) => <QuantityScreen    {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="Condition"   options={{ title: t('nav_condition') }}>
          {(p) => <ConditionScreen   {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="Source"      options={{ title: t('nav_source') }}>
          {(p) => <SourceScreen      {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="Value"       options={{ title: t('nav_value') }}>
          {(p) => <ValueScreen       {...p} db={db} apiUrl={API_BASE_URL} />}
        </Stack.Screen>
        <Stack.Screen name="Accept"      options={{ title: t('nav_accept') }}>
          {(p) => <AcceptScreen      {...p} db={db} apiUrl={API_BASE_URL} />}
        </Stack.Screen>

        {/* Standalone full-screen flows */}
        <Stack.Screen name="Handover" options={{ title: t('nav_handover') }}>
          {(p) => <HandoverScreen {...p} db={db} apiUrl={API_BASE_URL} />}
        </Stack.Screen>
        <Stack.Screen name="Safety"   options={{ title: t('nav_safety') }}>
          {(p) => <SafetyScreen   {...p} db={db} />}
        </Stack.Screen>
        <Stack.Screen name="HandoverEvidence" options={{ title: t('evidence_header') }}>
          {(p) => <HandoverEvidenceScreen {...p} apiUrl={API_BASE_URL} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------
export default function App() {
  const appStateRef = useRef(AppState.currentState);
  const db = null;

  useEffect(() => {
    // syncAndGetPending no-ops today — db is always null here (Expo Go has
    // no native SQLite), so SyncEngine's own outbox is dead code. It's kept
    // for when that changes. flushLotOutbox is the outbox that's actually
    // live right now: lots AcceptScreen couldn't submit live in
    // AsyncStorage, retried on every foreground.
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        syncAndGetPending(API_BASE_URL, db).catch(() => {});
        flushLotOutbox(API_BASE_URL).catch(() => {});
      }
      appStateRef.current = next;
    });
    syncAndGetPending(API_BASE_URL, db).catch(() => {});
    flushLotOutbox(API_BASE_URL).catch(() => {});
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
    <LanguageProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <AppNavigator db={db} />
    </LanguageProvider>
    </SafeAreaProvider>
  );
}
