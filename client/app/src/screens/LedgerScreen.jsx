import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { CategoryIcon } from '../components/CategoryIcon';
import { colors, spacing, statusColors } from '../ui/tokens';
import { useVoice } from '../hooks/useVoice';
import { listLots, earningsTotals } from '../db/repos/lots';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

/**
 * S8 — Earnings ledger
 * When db is available: reads from device SQLite (offline-first).
 * When db is null (Expo Go / no native SQLite): fetches from /public/lots
 * with AsyncStorage cache so data persists across restarts.
 */

const LEDGER_CACHE_KEY = 'bhaav_ledger_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min for ledger (changes more frequently than rates)

const STATUS_LABEL = {
  DRAFT:            'Draft',
  PENDING:          'Pending',
  ACCEPTED:         'Accepted',
  AWAITING_CONFIRM: 'Awaiting',
  CONFIRMED:        'Confirmed',
  DISPUTED:         'Disputed',
};
const STATUS_CHIP = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([code, label]) => [
    code,
    { label, ...(statusColors[code] ?? statusColors.DRAFT) },
  ]),
);

function StatusChip({ status }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.DRAFT;
  return (
    <View style={[styles.chip, { backgroundColor: chip.bg }]}>
      <Text variant="sm" style={{ color: chip.text, fontWeight: '600' }}>
        {chip.label}
      </Text>
    </View>
  );
}

function computeTotals(lots) {
  const now = Date.now();
  const weekMs  = 7 * 86_400_000;
  const monthMs = 30 * 86_400_000;
  let week = 0, month = 0;
  for (const l of lots) {
    const confirmed = l.handoverStatus === 'CONFIRMED' || l.status === 'CONFIRMED';
    const amount = confirmed
      ? Number(l.finalTotal ?? l.estimatedValue ?? 0)
      : Number(l.estimatedValue ?? 0);
    const ts = new Date(l.createdAt ?? l.collectionTs).getTime();
    const age = now - ts;
    if (age <= weekMs)  week  += amount;
    if (age <= monthMs) month += amount;
  }
  return { week, month };
}

export default function LedgerScreen({ navigation, db, apiUrl }) {
  const t = useStrings();
  const { speak } = useVoice();
  const [lots, setLots] = useState([]);
  const [totals, setTotals] = useState({ week: 0, month: 0 });
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      speak(t('earnings_title'));
    }, [speak, t])
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Path A: device SQLite
      if (db) {
        const [rows, tot] = await Promise.all([listLots(db, 100), earningsTotals(db)]);
        setLots(rows);
        setTotals(tot);
        setLoading(false);
        return;
      }

      // Path B: API with cache
      if (!apiUrl) { setLoading(false); return; }

      // Try fresh cache first
      try {
        const cached = await AsyncStorage.getItem(LEDGER_CACHE_KEY);
        if (cached) {
          const { cachedAt, data } = JSON.parse(cached);
          if (Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS) {
            setLots(data);
            setTotals(computeTotals(data));
            setLoading(false);
          }
        }
      } catch { /* ignore */ }

      const deviceId = await getDeviceId();
      const res = await fetch(
        `${apiUrl}/public/lots?device_id=${encodeURIComponent(deviceId)}`,
        { signal: AbortSignal.timeout?.(8000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { lots: apiLots } = await res.json();
      setLots(apiLots ?? []);
      setTotals(computeTotals(apiLots ?? []));

      // Cache the result
      try {
        await AsyncStorage.setItem(LEDGER_CACHE_KEY, JSON.stringify({
          cachedAt: new Date().toISOString(),
          data: apiLots ?? [],
        }));
      } catch { /* ignore */ }

      log.sync.info('ledger loaded from API', { count: (apiLots ?? []).length });
    } catch (err) {
      log.sync.warn('ledger load failed', { message: err?.message });
      // Keep showing cached data — don't clear on error
    } finally {
      setLoading(false);
    }
  }, [db, apiUrl]);

  useEffect(() => {
    load();
    const unsub = navigation?.addListener?.('focus', load);
    return unsub;
  }, [load, navigation]);

  const renderItem = ({ item }) => {
    const status = item.handoverStatus ?? item.status ?? 'DRAFT';
    const isConfirmed = status === 'CONFIRMED';
    const amount = (isConfirmed && item.finalTotal)
      ? `₹${Math.round(Number(item.finalTotal)).toLocaleString('en-IN')}`
      : `≈₹${Math.round(Number(item.estimatedValue ?? 0)).toLocaleString('en-IN')}`;

    const dateStr = new Date(item.createdAt ?? item.collectionTs)
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    return (
      <View style={styles.row}>
        <CategoryIcon categoryId={item.categoryCode ?? 'OTHER'} size={40} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text variant="md" style={styles.rowAmount}>{amount}</Text>
            <StatusChip status={status} />
          </View>
          <Text variant="sm" style={styles.rowSub}>
            {item.quantity} {item.unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
            {item.categoryCode ? ` · ${item.categoryCode}` : ''}
            {' · '}{dateStr}
          </Text>
          {item.referenceCode && (
            <Text variant="sm" style={styles.refCode}>{t('requests_reference', { code: item.referenceCode })}</Text>
          )}
          {item.recyclerName && (
            <Text variant="sm" style={styles.recycler}>{item.recyclerName}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <View style={styles.totalCard}>
          <Text variant="sm" style={styles.totalLabel}>{t('earnings_week')}</Text>
          <Text variant="xl" style={styles.totalValue}>
            ₹{Math.round(totals.week).toLocaleString('en-IN')}
          </Text>
        </View>
        <View style={styles.totalCard}>
          <Text variant="sm" style={styles.totalLabel}>{t('earnings_month')}</Text>
          <Text variant="xl" style={styles.totalValue}>
            ₹{Math.round(totals.month).toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      {loading && lots.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : lots.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={48} color={colors.textDisabled} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>{t('lots_empty_all')}</Text>
        </View>
      ) : (
        <FlatList
          data={lots}
          keyExtractor={(item) => item.id ?? item.lotId}
          renderItem={renderItem}
          style={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', gap: spacing[3],
    padding: spacing[4], backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  totalCard: {
    flex: 1, backgroundColor: colors.primarySurface,
    borderRadius: 12, padding: spacing[3], alignItems: 'center',
  },
  totalLabel: { color: colors.textSecondary },
  totalValue: { fontWeight: '700', color: colors.primary, marginTop: spacing[1] },
  loader: { flex: 1 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row', padding: spacing[4], gap: spacing[3],
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center',
  },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowAmount: { fontWeight: '700' },
  rowSub: { color: colors.textSecondary, marginTop: spacing[1] },
  refCode: { color: colors.primary, marginTop: 2, fontSize: 11, fontWeight: '600' },
  recycler: { color: colors.textSecondary, marginTop: 1, fontSize: 11, fontStyle: 'italic' },
  chip: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 999 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[8] },
  emptyIcon: { marginBottom: spacing[3] },
  emptyText: { color: colors.textSecondary },
});
