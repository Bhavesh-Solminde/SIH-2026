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
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LanguageProvider } from './src/i18n/LanguageContext';
import { colors } from './src/ui/tokens';

// Tab screens
import HomeScreen            from './src/screens/HomeScreen';
import PendingRequestsScreen from './src/screens/PendingRequestsScreen';
import LedgerScreen          from './src/screens/LedgerScreen';
import PriceBoardScreen      from './src/screens/PriceBoardScreen';
import LotsScreen            from './src/screens/LotsScreen';

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

// Sync engine
import { syncAndGetPending } from './src/screens/SyncEngine';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.0.102:4000';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_ICON_NAMES = {
  Home:     { active: 'home',          inactive: 'home-outline' },
  Requests: { active: 'document-text', inactive: 'document-text-outline' },
  Lots:     { active: 'cube',          inactive: 'cube-outline' },
  Ledger:   { active: 'wallet',        inactive: 'wallet-outline' },
  Rates:    { active: 'bar-chart',     inactive: 'bar-chart-outline' },
};

// Stable wrappers for tab screens that don't use db
const RequestsTab = (p) => <PendingRequestsScreen {...p} apiUrl={API_BASE_URL} />;
const LotsTab     = (p) => <LotsScreen            {...p} apiUrl={API_BASE_URL} />;

// ---------------------------------------------------------------------------
// Bottom tab navigator — always visible behind stack screens
// ---------------------------------------------------------------------------
function MainTabs({ db }) {
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
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeTab}
        options={{ title: 'नवीन', headerTitle: 'भाव संग्राहक' }}
      />
      <Tab.Screen
        name="Requests"
        component={RequestsTab}
        options={{ title: 'विनंत्या', headerTitle: 'प्रलंबित विनंत्या' }}
      />
      <Tab.Screen
        name="Lots"
        component={LotsTab}
        options={{ title: 'नोंदी', headerTitle: 'माझ्या नोंदी' }}
      />
      <Tab.Screen
        name="Ledger"
        component={LedgerTab}
        options={{ title: 'कमाई', headerTitle: 'कमाई' }}
      />
      <Tab.Screen
        name="Rates"
        component={RatesTab}
        options={{ title: 'दर', headerTitle: 'दर पत्रक' }}
      />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------
export default function App() {
  const appStateRef = useRef(AppState.currentState);
  const db = null;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        syncAndGetPending(API_BASE_URL, db).catch(() => {});
      }
      appStateRef.current = next;
    });
    syncAndGetPending(API_BASE_URL, db).catch(() => {});
    return () => sub.remove();
  }, []);

  const stackScreenOptions = {
    headerStyle:      { backgroundColor: colors.surface },
    headerTintColor:  colors.primary,
    headerTitleStyle: { fontWeight: '700' },
    cardStyle:        { backgroundColor: colors.background },
  };

  return (
    <SafeAreaProvider>
    <LanguageProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={stackScreenOptions}>
          {/* Main shell — tabs always visible */}
          <Stack.Screen name="Main" options={{ headerShown: false }}>
            {() => <MainTabs db={db} />}
          </Stack.Screen>

          {/* Lot creation flow — pushed over tabs */}
          <Stack.Screen name="Camera"      options={{ title: 'फोटो घ्या' }}>
            {(p) => <CameraScreen      {...p} db={db} />}
          </Stack.Screen>
          <Stack.Screen name="Category"    options={{ title: 'प्रकार' }}>
            {(p) => <CategoryScreen    {...p} db={db} />}
          </Stack.Screen>
          <Stack.Screen name="SubCategory" options={{ title: 'उपप्रकार' }}>
            {(p) => <SubCategoryScreen {...p} db={db} />}
          </Stack.Screen>
          <Stack.Screen name="Quantity"    options={{ title: 'प्रमाण' }}>
            {(p) => <QuantityScreen    {...p} db={db} />}
          </Stack.Screen>
          <Stack.Screen name="Condition"   options={{ title: 'स्थिती' }}>
            {(p) => <ConditionScreen   {...p} db={db} />}
          </Stack.Screen>
          <Stack.Screen name="Source"      options={{ title: 'स्रोत' }}>
            {(p) => <SourceScreen      {...p} db={db} />}
          </Stack.Screen>
          <Stack.Screen name="Value"       options={{ title: 'अंदाजे मूल्य' }}>
            {(p) => <ValueScreen       {...p} db={db} apiUrl={API_BASE_URL} />}
          </Stack.Screen>
          <Stack.Screen name="Accept"      options={{ title: 'स्वीकार' }}>
            {(p) => <AcceptScreen      {...p} db={db} apiUrl={API_BASE_URL} />}
          </Stack.Screen>

          {/* Standalone full-screen flows */}
          <Stack.Screen name="Handover" options={{ title: 'हस्तांतरण' }}>
            {(p) => <HandoverScreen {...p} db={db} apiUrl={API_BASE_URL} />}
          </Stack.Screen>
          <Stack.Screen name="Safety"   options={{ title: 'सुरक्षा सूचना' }}>
            {(p) => <SafetyScreen   {...p} db={db} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </LanguageProvider>
    </SafeAreaProvider>
  );
}
