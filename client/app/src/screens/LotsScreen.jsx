import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, spacing } from '../ui/tokens';
import { useVoice } from '../hooks/useVoice';
import { useStrings } from '../i18n/useStrings';
import { CategoryIcon } from '../components/CategoryIcon';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

const STATUS_CONFIG = {
  PENDING:          { label: 'प्रलंबित',          bg: colors.warningSurface, text: colors.warning },
  AWAITING_CONFIRM: { label: 'पुष्टीची प्रतीक्षा', bg: '#E3F2FD',             text: '#1565C0' },
  CONFIRMED:        { label: 'पूर्ण',              bg: colors.primarySurface, text: colors.primary },
  DISPUTED:         { label: 'वाद',               bg: colors.dangerSurface,  text: colors.danger },
};

const FILTERS = [
  { key: 'ALL',              label: 'सर्व' },
  { key: 'PENDING',          label: 'प्रलंबित' },
  { key: 'AWAITING_CONFIRM', label: 'पुष्टी' },
  { key: 'CONFIRMED',        label: 'पूर्ण' },
];

export default function LotsScreen({ apiUrl }) {
  const t = useStrings();
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

  const renderItem = ({ item }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDING;
    const amountStr = item.finalTotal != null
      ? `₹${Math.round(item.finalTotal).toLocaleString('en-IN')}`
      : `≈₹${Math.round(item.estimatedValue ?? 0).toLocaleString('en-IN')}`;

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <CategoryIcon categoryId={item.categoryCode ?? 'OTHER'} size={40} />
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text variant="md" style={styles.amount}>{amountStr}</Text>
              <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
                <Text variant="sm" style={[styles.chipText, { color: cfg.text }]}>{cfg.label}</Text>
              </View>
            </View>
            <Text variant="sm" style={styles.meta}>
              {item.quantity} {item.unit === 'KG' ? 'किलो' : 'नग'} · {item.categoryNameMr ?? item.categoryCode}
            </Text>
            <Text variant="sm" style={styles.date}>
              {new Date(item.collectionTs).toLocaleDateString('mr-IN')}
              {item.referenceCode ? ` · ${item.referenceCode}` : ''}
            </Text>
            {item.recyclerName && (
              <Text variant="sm" style={styles.recycler}>{item.recyclerName}</Text>
            )}
          </View>
        </View>
      </View>
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
              {f.label}
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
            {filter === 'ALL' ? 'अद्याप कोणतीही नोंद नाही' : 'या स्थितीत काहीही नाही'}
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
  empty:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[8] },
  emptyIcon:  { marginBottom: spacing[3] },
  emptyTitle: { color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
});
