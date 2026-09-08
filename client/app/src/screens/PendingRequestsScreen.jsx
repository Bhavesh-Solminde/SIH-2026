import React, { useCallback, useEffect, useState } from 'react';
import {
  View, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, spacing, conditionColors, statusColors } from '../ui/tokens';
import { useVoice } from '../hooks/useVoice';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

/**
 * "My Lots" — every lot this device has ever collected, one screen instead
 * of the two this used to be split across (a "Requests" tab that only showed
 * lots with a live PENDING_COLLECTOR handover, and a separate "Lots" tab with
 * the full history). GET /public/lots already returns the full lifecycle
 * (PENDING → AWAITING_CONFIRM → CONFIRMED/DISPUTED) with a QR-ready
 * referenceCode on every row regardless of status, so there was no reason to
 * fetch two endpoints and reconcile them client-side.
 *
 * Agree/Disagree only render for AWAITING_CONFIRM rows — the only status
 * where an actual pending handover exists to act on. Tapping the card body
 * always opens the QR/details screen (HandoverScreen), at any status, the
 * same way the old Lots tab did.
 */

const CONDITION_COLOR = conditionColors;
const STATUS_COLOR = statusColors;

const STATUS_LABEL_KEY = {
  PENDING:          'handover_pending',
  AWAITING_CONFIRM: 'lot_status_awaiting_confirm',
  CONFIRMED:        'lot_status_complete',
  DISPUTED:         'handover_disputed',
};

const FILTERS = [
  { key: 'ALL',              labelKey: 'filter_all' },
  { key: 'AWAITING_CONFIRM', labelKey: 'filter_confirmation_short' },
  { key: 'PENDING',          labelKey: 'handover_pending' },
  { key: 'CONFIRMED',        labelKey: 'lot_status_complete' },
];

const DATE_LOCALE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

export default function PendingRequestsScreen({ apiUrl, navigation }) {
  const t = useStrings();
  const { lang } = useLanguage();
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [disputing, setDisputing] = useState(null);
  const { speak, speakNumber } = useVoice();

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
      log.sync.info('my lots loaded', { count: (data.lots ?? []).length });
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
  const awaitingCount = lots.filter((l) => l.status === 'AWAITING_CONFIRM').length;

  // Announce only the actionable count — a collector who has 40 lots on
  // record but nothing new to agree to doesn't need that read out every time
  // they open the tab.
  useEffect(() => {
    if (loading) return;
    if (awaitingCount > 0) {
      speak(t('requests_pending', { count: awaitingCount }));
    }
  }, [loading, awaitingCount, speak, t]);

  // Read one amount back, digit by digit — "चार तीन नऊ एक शून्य" for ₹43,910.
  // Grammatical composition topped out at 9,999 and, above that, produced a
  // sentence a collector then had to convert back into the figure printed in
  // front of them. Digits map one-to-one onto what is on the screen, which
  // is the only form that can actually be checked.
  const readAmount = (amount) => {
    speakNumber(Math.round(Number(amount) || 0));
  };

  // Accepting requires a second photo + GPS fix taken right now — see
  // HandoverEvidenceScreen. It calls POST /handover/:lot_id/confirm itself
  // once both are captured and the photo has uploaded, then navigates back
  // here, which re-triggers fetchLots() via useFocusEffect.
  const handleAccept = (item) => {
    navigation.navigate('HandoverEvidence', {
      lotId: item.lotId,
      finalTotal: item.finalTotal,
    });
  };

  // The other half of the counter-signature. This was a disabled
  // "वाद घाला (लवकरच)" pill: a collector shown a price they had not agreed
  // to could only accept it or walk away, and the record therefore contained
  // nothing but agreements. Disagreeing now writes a real DISPUTED handover.
  const handleDispute = (item) => {
    Alert.alert(
      t('dispute_confirm_title'),
      t('dispute_confirm_message', { amount: Math.round(item.finalTotal).toLocaleString('en-IN') }),
      [
        { text: t('dispute_cancel'), style: 'cancel' },
        {
          text: t('dispute_confirm_yes'),
          style: 'destructive',
          onPress: async () => {
            setDisputing(item.lotId);
            try {
              const res = await fetch(`${apiUrl}/handover/${item.lotId}/dispute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              log.handover.warn('collector disputed', { lotId: item.lotId });
              speak(t('voice_dispute_recorded'));
              await fetchLots();
            } catch (err) {
              log.handover.error('dispute failed', err);
              speak(t('voice_error_generic'));
            } finally {
              setDisputing(null);
            }
          },
        },
      ],
    );
  };

  // Every lot carries a reference code from the moment it is created, so the
  // QR/details screen is reachable for the whole life of the lot — not only
  // in the narrow window when a handover confirmation happens to be pending.
  const openDetail = (item) => {
    if (!item.referenceCode) return;
    navigation.navigate('Handover', {
      lotId:              item.lotId,
      referenceCode:      item.referenceCode,
      finalTotal:         item.finalTotal,
      handoverId:         item.handoverId,
      categoryNameMr:     item.categoryNameMr,
      recyclerName:       item.recyclerName,
      quantity:           item.quantity,
      unit:               item.unit,
      inspectedCondition: item.inspectedCondition,
    });
  };

  const renderItem = ({ item }) => {
    const isAwaiting  = item.status === 'AWAITING_CONFIRM';
    const isDisputing = disputing === item.lotId;
    const statusColor = STATUS_COLOR[item.status] ?? STATUS_COLOR.PENDING;
    const statusLabel = t(STATUS_LABEL_KEY[item.status] ?? STATUS_LABEL_KEY.PENDING);
    const condStyle = CONDITION_COLOR[item.inspectedCondition] ?? { bg: colors.gray200, text: colors.text };
    const amountStr = item.finalTotal != null
      ? `₹${Math.round(item.finalTotal).toLocaleString('en-IN')}`
      : `≈₹${Math.round(item.estimatedValue ?? 0).toLocaleString('en-IN')}`;

    return (
      <View style={styles.card}>
        {/* Tappable info area → HandoverScreen (QR + details), any status */}
        <TouchableOpacity
          onPress={() => openDetail(item)}
          disabled={!item.referenceCode}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('requests_view_details_a11y')}
        >
          <View style={styles.cardRow}>
            <CategoryIcon categoryId={item.categoryCode ?? 'OTHER'} size={40} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.amount}>{amountStr}</Text>
                <View style={[styles.chip, { backgroundColor: statusColor.bg }]}>
                  <Text style={[styles.chipText, { color: statusColor.text }]}>{statusLabel}</Text>
                </View>
              </View>

              <Text style={styles.meta}>
                {item.quantity} {item.unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
                {item.categoryNameMr ? ` · ${item.categoryNameMr}` : ''}
              </Text>
              {item.recyclerName && (
                <Text style={styles.meta}>{item.recyclerName}</Text>
              )}
              {isAwaiting && item.inspectedCondition && (
                <View style={[styles.condBadge, { backgroundColor: condStyle.bg }]}>
                  <Text style={[styles.condText, { color: condStyle.text }]}>
                    {t(`condition_${item.inspectedCondition.toLowerCase()}`)}
                  </Text>
                </View>
              )}
              <Text style={styles.date}>
                {new Date(item.collectionTs).toLocaleDateString(DATE_LOCALE[lang] ?? 'mr-IN')}
                {item.referenceCode ? ` · ${item.referenceCode}` : ''}
              </Text>
              {item.referenceCode && (
                <Text style={styles.tapHint}>{t('requests_tap_for_qr')}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Only a lot with a live pending handover needs a decision — the
            "Hear amount" readout and Agree/Disagree pair are meaningless
            (and would be misleading) on a lot the recycler hasn't inspected
            yet, or one that's already CONFIRMED/DISPUTED. */}
        {isAwaiting && (
          <>
            <TouchableOpacity
              style={styles.listenBtn}
              onPress={() => readAmount(item.finalTotal)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('requests_listen_amount')}
            >
              <Ionicons name="volume-medium" size={16} color={colors.primary} />
              <Text style={styles.listenText}>{t('requests_listen_amount')}</Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.confirmBtn, isDisputing && styles.btnDisabled]}
                onPress={() => handleAccept(item)}
                disabled={isDisputing}
                activeOpacity={0.75}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.confirmText}>{t('requests_agree')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.disputeBtn, isDisputing && styles.btnDisabled]}
                onPress={() => handleDispute(item)}
                disabled={isDisputing}
                activeOpacity={0.75}
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={18} color={colors.danger} />
                <Text style={styles.disputeText}>
                  {isDisputing ? t('waiting') : t('requests_disagree')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="lg" style={styles.title}>{t('nav_requests_header')}</Text>
        <TouchableOpacity
          onPress={fetchLots}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.refreshRow}
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.refreshBtn}>{t('refresh')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={filter === f.key ? styles.filterTextActive : styles.filterText}>
              {t(f.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && lots.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="mail-open-outline" size={48} color={colors.textDisabled} style={styles.emptyIconView} />
          <Text style={styles.emptyTitle}>
            {filter === 'ALL' ? t('requests_empty_title') : t('lots_empty_filtered')}
          </Text>
          {filter === 'ALL' && (
            <Text style={styles.emptySub}>{t('requests_empty_sub')}</Text>
          )}
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
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: spacing[2],
  },
  title: { fontWeight: '700', color: colors.primary },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  refreshBtn: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  filters: {
    flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap',
    paddingBottom: spacing[3],
  },
  filterBtn: {
    paddingHorizontal: spacing[3], paddingVertical: spacing[1],
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText:      { color: colors.textSecondary, fontSize: 13 },
  filterTextActive: { color: '#fff', fontWeight: '700', fontSize: 13 },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[6] },
  emptyIconView: { marginBottom: spacing[3] },
  emptyTitle: { fontWeight: '700', color: colors.text, textAlign: 'center', fontSize: 17 },
  emptySub: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing[2], lineHeight: 22 },
  list: { paddingBottom: spacing[8] },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing[4], borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing[3],
  },
  cardRow: { flexDirection: 'row', gap: spacing[3] },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  amount: { fontWeight: '800', color: colors.primary, fontSize: 22 },
  chip: { paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: 99 },
  chipText: { fontSize: 11, fontWeight: '700' },
  condBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 99, marginTop: 2 },
  condText: { fontSize: 11, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, marginBottom: 2 },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  tapHint: { color: colors.primary, fontSize: 11, fontWeight: '600', marginTop: spacing[2] },
  listenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing[1], paddingVertical: spacing[2], marginTop: spacing[3], marginBottom: spacing[2],
    borderRadius: 10, backgroundColor: colors.primarySurface,
  },
  listenText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  actions: { flexDirection: 'row', gap: spacing[2] },
  confirmBtn: {
    flex: 1, flexDirection: 'row', gap: spacing[1],
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: spacing[3], alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disputeBtn: {
    flex: 1, flexDirection: 'row', gap: spacing[1],
    borderWidth: 1.5, borderColor: colors.dangerLight, borderRadius: 10,
    backgroundColor: colors.dangerSurface,
    paddingVertical: spacing[3], alignItems: 'center', justifyContent: 'center',
  },
  disputeText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
});
