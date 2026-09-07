import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, spacing, statusColors } from '../ui/tokens';
import { useVoice } from '../hooks/useVoice';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

// Status label keys, resolved through t() at render time so they follow the
// active language. PENDING/DISPUTED reuse the handover_* phrasing — same
// word, same meaning, one catalogue entry.
const STATUS_LABEL_KEY = {
  PENDING:          'handover_pending',
  AWAITING_CONFIRM: 'lot_status_awaiting_confirm',
  CONFIRMED:        'lot_status_complete',
  DISPUTED:         'handover_disputed',
};
const STATUS_COLOR = statusColors;

const FILTERS = [
  { key: 'ALL',              labelKey: 'filter_all' },
  { key: 'PENDING',          labelKey: 'handover_pending' },
  { key: 'AWAITING_CONFIRM', labelKey: 'filter_confirmation_short' },
  { key: 'CONFIRMED',        labelKey: 'lot_status_complete' },
];

// toLocaleDateString locale per active language — this used to be hardcoded
// to 'mr-IN' regardless of the collector's chosen language.
const DATE_LOCALE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

export default function LotsScreen({ apiUrl, navigation }) {
  const t = useStrings();
  const { lang } = useLanguage();
  const { speak } = useVoice();
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');

  useFocusEffect(
    useCallback(() => {
      speak(t('home_history'));
    }, [speak, t])
  );

  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await fetch(
        `${apiUrl}/public/lots?device_id=${encodeURIComponent(deviceId)}`,
        { signal: AbortSignal.timeout?.(8000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLots(data.lots ?? []);
      log.sync.info('lots loaded', { count: (data.lots ?? []).length });
    } catch (err) {
      log.sync.warn('fetch lots failed', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useFocusEffect(
    useCallback(() => {
      fetchLots();
    }, [fetchLots])
  );

  const filtered = filter === 'ALL' ? lots : lots.filter((l) => l.status === filter);

  // Every lot carries a reference code from the moment it is created, so the
  // QR is reachable from here for the whole life of the lot — not only in the
  // narrow window when a handover request happens to be pending.
  const openQr = (item) => {
    if (!item.referenceCode) return;
    navigation?.navigate?.('Handover', {
      lotId:              item.lotId,
      referenceCode:      item.referenceCode,
      finalTotal:         item.finalTotal ?? null,
      categoryNameMr:     item.categoryNameMr,
      recyclerName:       item.recyclerName,
      quantity:           item.quantity,
      unit:               item.unit,
      inspectedCondition: item.condition ?? null,
    });
  };

  const renderItem = ({ item }) => {
    const statusColor = STATUS_COLOR[item.status] ?? STATUS_COLOR.PENDING;
    const statusLabel = t(STATUS_LABEL_KEY[item.status] ?? STATUS_LABEL_KEY.PENDING);
    const amountStr = item.finalTotal != null
      ? `₹${Math.round(item.finalTotal).toLocaleString('en-IN')}`
      : `≈₹${Math.round(item.estimatedValue ?? 0).toLocaleString('en-IN')}`;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openQr(item)}
        disabled={!item.referenceCode}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('lots_view_qr_a11y')}
      >
        <View style={styles.cardRow}>
          <CategoryIcon categoryId={item.categoryCode ?? 'OTHER'} size={40} />
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text variant="md" style={styles.amount}>{amountStr}</Text>
              <View style={[styles.chip, { backgroundColor: statusColor.bg }]}>
                <Text variant="sm" style={[styles.chipText, { color: statusColor.text }]}>{statusLabel}</Text>
              </View>
            </View>
            <Text variant="sm" style={styles.meta}>
              {item.quantity} {item.unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')} · {item.categoryNameMr ?? item.categoryCode}
            </Text>
            <Text variant="sm" style={styles.date}>
              {new Date(item.collectionTs).toLocaleDateString(DATE_LOCALE[lang] ?? 'mr-IN')}
              {item.referenceCode ? ` · ${item.referenceCode}` : ''}
            </Text>
            {item.recyclerName && (
              <Text variant="sm" style={styles.recycler}>{item.recyclerName}</Text>
            )}
            {item.referenceCode && (
              <View style={styles.qrHintRow}>
                <Ionicons name="qr-code-outline" size={12} color={colors.primary} />
                <Text variant="sm" style={styles.qrHint}>{t('lots_tap_for_qr')}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text variant="sm" style={filter === f.key ? styles.filterTextActive : styles.filterText}>
              {t(f.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && lots.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={48} color={colors.textDisabled} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>
            {filter === 'ALL' ? t('lots_empty_all') : t('lots_empty_filtered')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.lotId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchLots}
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
  filters: {
    flexDirection: 'row', gap: spacing[2], padding: spacing[3],
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: spacing[3], paddingVertical: spacing[1],
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText:      { color: colors.textSecondary },
  filterTextActive: { color: '#fff', fontWeight: '700' },
  loader: { flex: 1 },
  list: { padding: spacing[3], gap: spacing[2], paddingBottom: spacing[8] },
  card: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: spacing[3], borderWidth: 1, borderColor: colors.border,
  },
  cardRow:  { flexDirection: 'row', gap: spacing[3], alignItems: 'center' },
  cardBody: { flex: 1 },
  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  amount:   { fontWeight: '700', color: colors.primary },
  chip:     { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 999 },
  chipText: { fontWeight: '600', fontSize: 11 },
  meta:     { color: colors.textSecondary, marginTop: 1 },
  date:     { color: colors.textSecondary, marginTop: 1, fontSize: 11 },
  recycler: { color: colors.textSecondary, marginTop: 1, fontSize: 11, fontStyle: 'italic' },
  qrHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing[1] },
  qrHint:    { color: colors.primary, fontSize: 11, fontWeight: '600' },
  empty:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[8] },
  emptyIcon:  { marginBottom: spacing[3] },
  emptyTitle: { color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
});
