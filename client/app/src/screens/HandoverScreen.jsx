import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
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
  const { speak, speakNumber } = useVoice();
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
  const [disputed, setDisputed] = useState(false);
  const [lot, setLot] = useState(null);
  const [finalAmount, setFinalAmount] = useState(finalTotal ?? null);

  useEffect(() => {
    if (!db || !lotId) return;
    log.handover.debug('loading lot', { lotId });
    getLot(db, lotId).then(setLot).catch((err) => log.handover.warn('getLot failed', err));
  }, [db, lotId]);

  // Read the amount out digit by digit, one clip at a time. The old call
  // fired every clip in the same tick, so "one thousand three hundred" came
  // out as four words layered on top of each other.
  useEffect(() => {
    if (phase === PHASES.CONFIRM && finalAmount) {
      log.handover.info('entering confirm phase', { finalAmount });
      speakNumber(Math.round(Number(finalAmount)));
    }
  }, [phase, finalAmount, speakNumber]);

  // POST /handover/:lot_id/confirm now requires a second photo + GPS fix
  // taken at this moment (see HandoverEvidenceScreen and the confirm-endpoint
  // comment in server/api/src/routes/handover.js) — it 400s without them.
  // Route there instead of confirming inline; onConfirmed lets this
  // still-mounted screen switch to the DONE phase once evidence has been
  // captured and the confirm actually succeeded.
  const handleCorrect = async () => {
    log.handover.info('collector agreed', { lotId, finalAmount });
    if (db && lotId) {
      try {
        await confirmHandover(db, { lotId, agree: true, protest: false });
        speak(t('handover_confirmed'));
        setPhase(PHASES.DONE);
      } catch (err) {
        log.handover.error('confirm failed', err);
      }
      return;
    }
    navigation.navigate('HandoverEvidence', {
      lotId,
      finalTotal: finalAmount,
      onConfirmed: () => {
        speak(t('handover_confirmed'));
        setPhase(PHASES.DONE);
      },
    });
  };

  // Disagreeing used to write only to a local database this build never
  // opens, so pressing "चूक" recorded nothing and moved straight to a screen
  // reading "पुष्टी झाली" — the collector was shown a confirmation for a
  // price they had just rejected. It now posts the protest and says so.
  const handleWrong = async () => {
    log.handover.warn('collector disputed', { lotId, finalAmount });
    setDisputed(true);
    try {
      if (db && lotId) {
        await confirmHandover(db, { lotId, agree: false, protest: true });
      } else if (apiUrl && lotId) {
        const res = await fetch(`${apiUrl}/handover/${lotId}/dispute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      speak(t('voice_dispute_recorded'));
      setPhase(PHASES.DONE);
    } catch (err) {
      log.handover.error('dispute failed', err);
      speak(t('voice_error_generic'));
      setDisputed(false);
    }
  };

  if (phase === PHASES.DONE) {
    return (
      <Screen style={styles.container}>
        <View style={styles.doneCard}>
          <Ionicons
            name={disputed ? 'alert-circle' : 'checkmark-circle'}
            size={72}
            color={disputed ? colors.danger : colors.primary}
            style={styles.doneIconView}
          />
          <Text variant="xl" style={disputed ? styles.disputeTitle : styles.doneTitle}>
            {disputed ? t('handover_disputed_title') : t('handover_confirmed')}
          </Text>
          <Text style={styles.doneSub}>{t('requests_reference', { code: referenceCode })}</Text>
          <Text variant="lg" style={disputed ? styles.disputeAmount : styles.doneAmount}>
            ₹{Math.round(Number(finalAmount ?? 0)).toLocaleString('en-IN')}
          </Text>
          {disputed && (
            <Text variant="sm" style={styles.disputeNote}>
              {t('handover_dispute_note')}
            </Text>
          )}
        </View>
        <Button title={t('accept_go_home')} onPress={() => navigation.navigate('Home')} />
      </Screen>
    );
  }

  if (phase === PHASES.CONFIRM) {
    return (
      <Screen style={styles.container}>
        <View style={styles.confirmCard}>
          <Text variant="sm" style={styles.confirmLabel}>{t('handover_recorded_amount')}</Text>
          <Text variant="3xl" style={styles.confirmAmount}>
            ₹{Math.round(Number(finalAmount ?? 0)).toLocaleString('en-IN')}
          </Text>
          <Text variant="sm" style={styles.confirmSub}>
            {t('handover_confirm_question')}
          </Text>
        </View>

        <View style={styles.confirmButtons}>
          <TouchableOpacity style={[styles.confirmBtn, styles.correctBtn]} onPress={handleCorrect}>
            <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
            <Text style={styles.correctText}>{t('handover_correct')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.confirmBtn, styles.wrongBtn]} onPress={handleWrong}>
            <Ionicons name="close-circle" size={28} color={colors.danger} />
            <Text style={styles.wrongText}>{t('handover_wrong')}</Text>
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
          {t('handover_qr_hint')}
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
          title={t('handover_check_amount', { amount: Math.round(Number(finalAmount)) })}
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
  disputeTitle: { fontWeight: '800', color: colors.danger },
  disputeAmount: { fontWeight: '700', color: colors.danger, marginTop: spacing[4] },
  disputeNote: { color: colors.textSecondary, marginTop: spacing[3], textAlign: 'center' },
});
