import React, { useCallback, useEffect, useState } from 'react';
import {
  View, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors, spacing } from '../ui/tokens';
import { useVoice } from '../hooks/useVoice';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

let Location = null;
try { Location = require('expo-location'); } catch {}

const CONDITION_MR = { GOOD: 'चांगली', FAIR: 'ठीक', POOR: 'खराब' };
const CONDITION_COLOR = {
  GOOD: { bg: '#E8F5E9', text: '#2E7D32' },
  FAIR: { bg: '#FFF8E1', text: '#F57F17' },
  POOR: { bg: '#FFEBEE', text: '#C62828' },
};

export default function PendingRequestsScreen({ apiUrl, navigation }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(null);
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
      speak(`${requests.length} विनंत्या प्रलंबित`);
    }
  }, [loading, requests.length, speak]);

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
      speak('हस्तांतरण पुष्टी झाली');
      await speakNumber(item.finalTotal);
      await fetchPending();
    } catch (err) {
      log.handover.error('confirm failed', err);
      speak('चूक झाली, पुन्हा प्रयत्न करा');
    } finally {
      setConfirming(null);
    }
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
    const condStyle = CONDITION_COLOR[item.inspectedCondition] ?? { bg: colors.gray200, text: colors.text };

    return (
      <View style={styles.card}>
        {/* Tappable info area → HandoverScreen (QR + details) */}
        <TouchableOpacity
          onPress={() => openDetail(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="तपशील पहा"
        >
          <View style={styles.cardTop}>
            <Text style={styles.amount}>
              ₹{Math.round(item.finalTotal).toLocaleString('en-IN')}
            </Text>
            <View style={[styles.condBadge, { backgroundColor: condStyle.bg }]}>
              <Text style={[styles.condText, { color: condStyle.text }]}>
                {CONDITION_MR[item.inspectedCondition] ?? item.inspectedCondition}
              </Text>
            </View>
          </View>

          {item.categoryNameMr && (
            <Text style={styles.meta}>{item.categoryNameMr}</Text>
          )}
          {item.recyclerName && (
            <Text style={styles.meta}>{item.recyclerName}</Text>
          )}
          <Text style={styles.ref}>संदर्भ: {item.referenceCode}</Text>
          <Text style={styles.tapHint}>QR पाहण्यासाठी टच करा →</Text>
        </TouchableOpacity>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.confirmBtn, isConfirming && styles.confirmBtnDisabled]}
            onPress={() => handleConfirm(item)}
            disabled={isConfirming}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>
              {isConfirming ? 'प्रतीक्षा…' : 'सहमत आहे ✓'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.disputeBtn}
            onPress={() => speak('विवाद सुविधा लवकरच येईल')}
            activeOpacity={0.75}
          >
            <Text style={styles.disputeText}>वाद घाला</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="lg" style={styles.title}>प्रलंबित विनंत्या</Text>
        <TouchableOpacity onPress={fetchPending} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.refreshBtn}>↻ ताजे करा</Text>
        </TouchableOpacity>
      </View>

      {loading && requests.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>कोणतीही विनंती नाही</Text>
          <Text style={styles.emptySub}>
            पुनर्वापरकर्त्याने माल तपासल्यावर येथे दिसेल.
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
  refreshBtn: { color: colors.primary, fontSize: 18 },
  loader: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[6] },
  emptyIcon: { fontSize: 52, marginBottom: spacing[3] },
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
  actions: { gap: spacing[2] },
  confirmBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: spacing[3], alignItems: 'center', marginBottom: spacing[2],
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disputeBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingVertical: spacing[2], alignItems: 'center',
  },
  disputeText: { color: colors.textSecondary, fontSize: 13 },
});
