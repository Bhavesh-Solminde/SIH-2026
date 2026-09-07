import React, { useCallback, useEffect, useState } from 'react';
import {
  View, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, spacing, conditionColors } from '../ui/tokens';
import { useVoice } from '../hooks/useVoice';
import { useStrings } from '../i18n/useStrings';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

let Location = null;
try { Location = require('expo-location'); } catch {}

const CONDITION_COLOR = conditionColors;

export default function PendingRequestsScreen({ apiUrl, navigation }) {
  const t = useStrings();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [disputing, setDisputing]   = useState(null);
  const { speak, speakNumber } = useVoice();

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await fetch(
        `${apiUrl}/handover/pending?device_id=${encodeURIComponent(deviceId)}`,
        { signal: AbortSignal.timeout?.(8000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRequests(data.pending ?? []);
      log.sync.info('pending requests loaded', { count: (data.pending ?? []).length });
    } catch (err) {
      log.sync.warn('fetch pending failed', err);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useFocusEffect(
    useCallback(() => {
      fetchPending();
    }, [fetchPending])
  );

  // Speak the count whenever data finishes loading
  useEffect(() => {
    if (loading) return;
    if (requests.length > 0) {
      speak(t('requests_pending', { count: requests.length }));
    }
  }, [loading, requests.length, speak, t]);

  // Read one amount back, digit by digit — "चार तीन नऊ एक शून्य" for ₹43,910.
  // Grammatical composition topped out at 9,999 and, above that, produced a
  // sentence a collector then had to convert back into the figure printed in
  // front of them. Digits map one-to-one onto what is on the screen, which
  // is the only form that can actually be checked.
  const readAmount = (amount) => {
    speakNumber(Math.round(Number(amount) || 0));
  };

  const handleConfirm = async (item) => {
    setConfirming(item.lotId);
    try {
      let handoverLat = null;
      let handoverLng = null;
      try {
        if (Location) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            handoverLat = pos.coords.latitude;
            handoverLng = pos.coords.longitude;
          }
        }
      } catch {}

      const res = await fetch(`${apiUrl}/handover/${item.lotId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoverLat, handoverLng }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      speak(t('voice_handover_confirmed'));
      await fetchPending();
    } catch (err) {
      log.handover.error('confirm failed', err);
      speak(t('voice_error_generic'));
    } finally {
      setConfirming(null);
    }
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
              await fetchPending();
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

  const openDetail = (item) => {
    navigation.navigate('Handover', {
      lotId:             item.lotId,
      referenceCode:     item.referenceCode,
      finalTotal:        item.finalTotal,
      handoverId:        item.handoverId,
      categoryNameMr:    item.categoryNameMr,
      recyclerName:      item.recyclerName,
      quantity:          item.quantity,
      unit:              item.unit,
      inspectedCondition: item.inspectedCondition,
    });
  };

  const renderItem = ({ item }) => {
    const isConfirming = confirming === item.lotId;
    const isDisputing  = disputing  === item.lotId;
    const busy         = isConfirming || isDisputing;
    const condStyle = CONDITION_COLOR[item.inspectedCondition] ?? { bg: colors.gray200, text: colors.text };

    return (
      <View style={styles.card}>
        {/* Tappable info area → HandoverScreen (QR + details) */}
        <TouchableOpacity
          onPress={() => openDetail(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('requests_view_details_a11y')}
        >
          <View style={styles.cardTop}>
            <Text style={styles.amount}>
              ₹{Math.round(item.finalTotal).toLocaleString('en-IN')}
            </Text>
            <View style={[styles.condBadge, { backgroundColor: condStyle.bg }]}>
              <Text style={[styles.condText, { color: condStyle.text }]}>
                {t(`condition_${(item.inspectedCondition ?? '').toLowerCase()}`)}
              </Text>
            </View>
          </View>

          {item.categoryNameMr && (
            <Text style={styles.meta}>{item.categoryNameMr}</Text>
          )}
          {item.recyclerName && (
            <Text style={styles.meta}>{item.recyclerName}</Text>
          )}
          <Text style={styles.ref}>{t('requests_reference', { code: item.referenceCode })}</Text>
          <Text style={styles.tapHint}>{t('requests_tap_for_qr')}</Text>
        </TouchableOpacity>

        {/* Hear the amount. A collector who cannot read ₹43,910 off the
            screen has no other way to check what they are agreeing to. */}
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

        {/* Both answers, both real. */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.confirmBtn, busy && styles.btnDisabled]}
            onPress={() => handleConfirm(item)}
            disabled={busy}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.confirmText}>
              {isConfirming ? t('waiting') : t('requests_agree')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.disputeBtn, busy && styles.btnDisabled]}
            onPress={() => handleDispute(item)}
            disabled={busy}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={18} color={colors.danger} />
            <Text style={styles.disputeText}>
              {isDisputing ? t('waiting') : t('requests_disagree')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="lg" style={styles.title}>{t('nav_requests_header')}</Text>
        <TouchableOpacity
          onPress={fetchPending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.refreshRow}
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.refreshBtn}>{t('refresh')}</Text>
        </TouchableOpacity>
      </View>

      {loading && requests.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="mail-open-outline" size={48} color={colors.textDisabled} style={styles.emptyIconView} />
          <Text style={styles.emptyTitle}>{t('requests_empty_title')}</Text>
          <Text style={styles.emptySub}>
            {t('requests_empty_sub')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.handoverId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchPending}
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[2] },
  amount: { fontWeight: '800', color: colors.primary, fontSize: 24 },
  condBadge: { paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: 99 },
  condText: { fontSize: 12, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, marginBottom: 2 },
  ref: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  tapHint: { color: colors.primary, fontSize: 11, fontWeight: '600', marginBottom: spacing[3] },
  listenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing[1], paddingVertical: spacing[2], marginBottom: spacing[2],
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
