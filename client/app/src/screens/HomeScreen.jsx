import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStrings } from '../i18n/useStrings';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, spacing } from '../ui/tokens';
import { earningsTotals } from '../db/repos/lots';
import { pendingCount } from '../db/repos/outbox';
import { useVoice } from '../hooks/useVoice';
import { log } from '../lib/logger';

/**
 * S0 — Home
 * One button, two tiles, sync pill. Zero complexity.
 */
export default function HomeScreen({ navigation, db }) {
  const t = useStrings();
  const { speak } = useVoice();
  const [pendingSync, setPendingSync] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);

  useFocusEffect(
    useCallback(() => {
      speak(t('home_title'));
    }, [speak, t])
  );

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const [count, totals] = await Promise.all([
        pendingCount(db),
        earningsTotals(db),
      ]);
      setPendingSync(count);
      setWeekEarnings(totals.week);
      log.home.info('refreshed', { pendingSync: count, weekEarnings: totals.week });
    } catch (err) {
      log.home.error('refresh failed', err);
    }
  }, [db]);

  useEffect(() => {
    refresh();
    const unsub = navigation?.addListener?.('focus', refresh);
    return unsub;
  }, [refresh, navigation]);

  const syncLabel = pendingSync > 0 ? t('home_sync_pending', { count: pendingSync }) : t('home_synced');

  return (
    <Screen style={styles.container}>
      {/* Header: sync pill. Language switcher lives in the nav header (App.js). */}
      <View style={styles.header}>
        <View style={[styles.pill, pendingSync > 0 && styles.pillPending]}>
          <Ionicons
            name={pendingSync > 0 ? 'sync' : 'checkmark-circle'}
            size={13}
            color={pendingSync > 0 ? colors.warning : colors.primary}
          />
          <Text variant="sm" style={pendingSync > 0 ? styles.pillTextPending : styles.pillText}>
            {syncLabel}
          </Text>
        </View>
      </View>

      {/* The one main action */}
      <View style={styles.hero}>
        <Button
          title={t('home_new_lot')}
          onPress={() => navigation.navigate('Camera')}
          style={styles.mainButton}
        />
      </View>

      {/* Two info tiles */}
      <View style={styles.tiles}>
        <TouchableOpacity
          style={styles.tile}
          onPress={() => navigation.navigate('Ledger')}
        >
          <Text variant="sm" style={styles.tileLabel}>{t('home_earnings')}</Text>
          <Text variant="xl" style={styles.tileValue}>₹{weekEarnings.toFixed(0)}</Text>
          <Text variant="sm" style={styles.tileSub}>{t('earnings_week')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tile}
          onPress={() => navigation.navigate('Rates')}
        >
          <Text variant="sm" style={styles.tileLabel}>{t('home_price_board')}</Text>
          <Text variant="xl">₹</Text>
          <Text variant="sm" style={styles.tileSub}>{t('home_view_rates')}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    paddingHorizontal: spacing[3], paddingVertical: spacing[1],
    backgroundColor: colors.gray200, borderRadius: 999,
  },
  pillPending: { backgroundColor: colors.warningSurface },
  pillText: { color: colors.primary },
  pillTextPending: { color: colors.warning },
  hero: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing[6] },
  mainButton: { minHeight: 72 },
  tiles: {
    flexDirection: 'row', padding: spacing[4],
    gap: spacing[3], paddingBottom: spacing[8],
  },
  tile: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12,
    padding: spacing[4], alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  tileLabel: { color: colors.textSecondary, marginBottom: spacing[1] },
  tileValue: { color: colors.primary, fontWeight: '700' },
  tileSub: { color: colors.textSecondary, marginTop: spacing[1] },
});
