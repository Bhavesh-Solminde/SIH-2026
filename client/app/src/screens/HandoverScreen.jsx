import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { play, composeNumber } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';
import { getLot } from '../db/repos/lots';
import { confirmHandover } from '../db/repos/handovers';
import { log } from '../lib/logger';

/**
 * S7 — Handover
 * Phase QR   → collector shows QR / reference code to recycler
 * Phase CONFIRM → collector confirms the amount the recycler entered
 * Phase DONE    → handover complete
 */
const PHASES = { QR: 'qr', CONFIRM: 'confirm', DONE: 'done' };

export default function HandoverScreen({ navigation, route, db, apiUrl }) {
  const t = useStrings();
  const { speak } = useVoice();
  const {
    lotId, referenceCode, finalTotal, handoverId,
    // params passed from PendingRequestsScreen (API-only mode)
    categoryNameMr, recyclerName, quantity, unit, inspectedCondition: paramCondition,
  } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speak(t('handover_label'));
    }, [speak, t])
  );

  const [phase, setPhase] = useState(PHASES.QR);
  const [lot, setLot] = useState(null);
  const [finalAmount, setFinalAmount] = useState(finalTotal ?? null);

  useEffect(() => {
    if (!db || !lotId) return;
    log.handover.debug('loading lot', { lotId });
    getLot(db, lotId).then(setLot).catch((err) => log.handover.warn('getLot failed', err));
  }, [db, lotId]);

  useEffect(() => {
    if (phase === PHASES.CONFIRM && finalAmount) {
      log.handover.info('entering confirm phase', { finalAmount });
      const n = Math.round(Number(finalAmount));
      composeNumber(n).forEach((clip) => play(clip).catch(() => {}));
    }
  }, [phase, finalAmount]);

  const handleCorrect = async () => {
    log.handover.info('collector agreed', { lotId, finalAmount });
    try {
      if (db && lotId) {
        await confirmHandover(db, { lotId, agree: true, protest: false });
      } else if (apiUrl && lotId) {
        const res = await fetch(`${apiUrl}/handover/${lotId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      play('good').catch(() => {});
      setPhase(PHASES.DONE);
    } catch (err) {
      log.handover.error('confirm failed', err);
    }
  };

  const handleWrong = async () => {
    log.handover.warn('collector disputed', { lotId, finalAmount });
    try {
      if (db && lotId) {
        await confirmHandover(db, { lotId, agree: false, protest: true });
      }
      setPhase(PHASES.DONE);
    } catch (err) {
      log.handover.error('dispute failed', err);
    }
  };

  if (phase === PHASES.DONE) {
    return (
      <Screen style={styles.container}>
        <View style={styles.doneCard}>
          <Ionicons name="checkmark-circle" size={72} color={colors.primary} style={styles.doneIconView} />
          <Text variant="xl" style={styles.doneTitle}>{t('handover_confirmed')}</Text>
          <Text style={styles.doneSub}>संदर्भ: {referenceCode}</Text>
          <Text variant="lg" style={styles.doneAmount}>
            ₹{Math.round(Number(finalAmount ?? 0)).toLocaleString('en-IN')}
          </Text>
        </View>
        <Button title="मुख्यपृष्ठावर जा" onPress={() => navigation.navigate('Home')} />
      </Screen>
    );
  }

  if (phase === PHASES.CONFIRM) {
    return (
      <Screen style={styles.container}>
        <View style={styles.confirmCard}>
          <Text variant="sm" style={styles.confirmLabel}>नोंदवलेली रक्कम</Text>
          <Text variant="3xl" style={styles.confirmAmount}>
            ₹{Math.round(Number(finalAmount ?? 0)).toLocaleString('en-IN')}
          </Text>
          <Text variant="sm" style={styles.confirmSub}>
            ही रक्कम बरोबर आहे का?
          </Text>
        </View>

        <View style={styles.confirmButtons}>
          <TouchableOpacity style={[styles.confirmBtn, styles.correctBtn]} onPress={handleCorrect}>
            <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
            <Text style={styles.correctText}>बरोबर</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.confirmBtn, styles.wrongBtn]} onPress={handleWrong}>
            <Ionicons name="close-circle" size={28} color={colors.danger} />
            <Text style={styles.wrongText}>चूक</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  // Phase: QR
  const qrValue = referenceCode ?? lotId ?? 'bhaav-handover';

  // Merge db lot data with params (params win for display when db not available)
  const displayCategory  = lot?.categoryCode ?? categoryNameMr ?? '—';
  const displayQty       = lot ? `${lot.quantity} ${lot.unit}` : (quantity ? `${quantity} ${unit ?? ''}` : null);
  const displayCondition = lot?.condition ?? paramCondition ?? null;
  const displayRecycler  = recyclerName ?? null;
  const displayDate      = lot?.collectionTs
    ? new Date(lot.collectionTs).toLocaleDateString('en-IN')
    : null;

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('handover_label')}</Text>

      {/* QR code */}
      <View style={styles.qrBox}>
        <QRCode
          value={qrValue}
          size={200}
          color={colors.primary}
          backgroundColor={colors.surface}
        />
        <Text variant="md" style={styles.qrRef}>{referenceCode ?? '—'}</Text>
        <Text variant="sm" style={styles.qrHint}>
          हे QR स्कॅन करा किंवा संदर्भ कोड सांगा
        </Text>
      </View>

      {/* Lot summary */}
      {(displayQty || displayCategory || displayRecycler) && (
        <View style={styles.lotSummary}>
          <View style={styles.lotRow}>
            <Ionicons name="cube-outline" size={16} color={colors.textSecondary} />
            <Text variant="sm" style={styles.lotRowText}>
              {[displayCategory, displayQty, displayCondition].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {displayRecycler && (
            <View style={styles.lotRow}>
              <Ionicons name="business-outline" size={16} color={colors.textSecondary} />
              <Text variant="sm" style={styles.lotRowText}>{displayRecycler}</Text>
            </View>
          )}
          {displayDate && (
            <View style={styles.lotRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text variant="sm" style={styles.lotRowText}>{displayDate}</Text>
            </View>
          )}
        </View>
      )}

      {finalAmount && (
        <Button
          title={`रक्कम तपासा: ₹${Math.round(Number(finalAmount))}`}
          onPress={() => setPhase(PHASES.CONFIRM)}
          style={styles.checkBtn}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[5] },
  title: { fontWeight: '700', marginBottom: spacing[4] },
  qrBox: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 2, borderColor: colors.border,
    padding: spacing[6], alignItems: 'center', marginBottom: spacing[4],
  },
  qrRef: {
    marginTop: spacing[3], color: colors.primary, fontWeight: '700',
    letterSpacing: 3, fontSize: 18,
  },
  qrHint: { marginTop: spacing[2], color: colors.textSecondary, textAlign: 'center' },
  lotSummary: {
    backgroundColor: colors.gray100, borderRadius: 8, padding: spacing[3],
    marginBottom: spacing[4], gap: spacing[2],
  },
  lotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  lotRowText: { color: colors.textSecondary },
  checkBtn: {},
  confirmCard: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { color: colors.textSecondary },
  confirmAmount: { fontWeight: '800', color: colors.primary, marginVertical: spacing[4] },
  confirmSub: { color: colors.textSecondary },
  confirmButtons: { flexDirection: 'row', gap: spacing[3], paddingBottom: spacing[6] },
  confirmBtn: {
    flex: 1, padding: spacing[5], borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', gap: spacing[2],
  },
  correctBtn: { backgroundColor: colors.primarySurface, borderWidth: 2, borderColor: colors.primary },
  wrongBtn: { backgroundColor: colors.dangerSurface, borderWidth: 2, borderColor: colors.dangerLight },
  correctText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  wrongText: { fontSize: 18, fontWeight: '700', color: colors.danger },
  doneCard: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneIconView: { marginBottom: spacing[4] },
  doneTitle: { fontWeight: '800', color: colors.primary },
  doneSub: { color: colors.textSecondary, marginTop: spacing[2] },
  doneAmount: { fontWeight: '700', color: colors.primary, marginTop: spacing[4] },
});
