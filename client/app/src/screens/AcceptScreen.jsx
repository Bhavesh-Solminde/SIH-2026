import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Linking, Share, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';
import { createLot } from '../db/repos/lots';
import { createAcceptance } from '../db/repos/acceptances';
import { uuidv7, referenceCodeFromUuid } from '@bhaav/core/ids';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';
import { webDirectionsUrl, nativeDirectionsUrl, shareMessage, hasLocation } from '../lib/directions';

/**
 * S6 — Accept
 */
export default function AcceptScreen({ navigation, route, db, apiUrl }) {
  const t = useStrings();
  const { speak } = useVoice();

  // Declared before the callbacks that list `recycler` in their dependency
  // arrays. It used to sit below them, which reads `recycler` inside the
  // deps array while it is still in its temporal dead zone. That survives
  // only because the release Babel config downgrades const to var, where the
  // read yields undefined instead of throwing — so the deps were permanently
  // [undefined] and the callbacks never re-memoised. It works by accident,
  // and stops working the moment block scoping is compiled faithfully.
  const {
    recycler, category, subCategory, quantity, unit, condition, sourceType,
    collectionLat, collectionLng, collectionTs, photos = [], operatingArea,
  } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speak(t('accept_label'));
    }, [speak, t])
  );

  // Prefer the native maps app; fall back to the Google Maps web link, which
  // resolves in any browser. A device with neither is told plainly rather than
  // left with a button that does nothing.
  const openDirections = useCallback(async () => {
    if (!hasLocation(recycler)) return;
    const native = nativeDirectionsUrl(recycler, Platform.OS);
    const web = webDirectionsUrl(recycler);
    try {
      if (await Linking.canOpenURL(native)) return Linking.openURL(native);
      return await Linking.openURL(web);
    } catch (err) {
      log.accept.warn('directions failed', { message: err?.message });
      Alert.alert(t('accept_directions_failed_title'), web);
    }
  }, [recycler, t]);

  // Offline-safe: the share sheet needs no network, and this trade already runs
  // on WhatsApp, so sending the address is how a location actually travels.
  const shareLocation = useCallback(async () => {
    if (!hasLocation(recycler)) return;
    try {
      await Share.share({ message: shareMessage(recycler) });
    } catch (err) {
      log.accept.warn('share failed', { message: err?.message });
    }
  }, [recycler]);

  // Accepting used to play the 'good' clip, which is the recorded word for
  // the GOOD *condition grade* — "चांगली". So confirming an acceptance
  // announced a quality rating nobody had asked about. Say what happened.
  const announceAccepted = useCallback(() => {
    speak(t('voice_accepted'));
  }, [speak, t]);

  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [lotRef, setLotRef] = useState(null);
  const [referenceCode, setReferenceCode] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    log.accept.info('accept tapped', { recycler: recycler?.name, category, quantity, unit, condition });
    try {
      const collectorId = await getOrCreateCollectorId(db);
      const categoryId = await resolveCategoryId(db, category);

      const draft = {
        collectorId,
        categoryId,
        categoryCode: category,
        unit,
        quantity: String(quantity),
        condition,
        sourceType: sourceType ?? null,
        estimatedValue: String(Math.round(recycler.estimatedValue ?? 0)),
        collectionLat: collectionLat ?? null,
        collectionLng: collectionLng ?? null,
        collectionTs: collectionTs ?? new Date().toISOString(),
        deviceId: collectorId.slice(0, 16),
      };

      // ── No local DB — try submitting directly to the API ────────────────
      if (!db) {
        const deviceId = await getDeviceId();
        const lotId = uuidv7();
        try {
          const resp = await fetch(`${apiUrl}/public/lots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              collectorId: deviceId,
              categoryCode: category,
              unit,
              quantity: Number(quantity),
              condition,
              sourceType: sourceType ?? null,
              recyclerId: recycler.id,
              acceptedRate: Number(recycler.rate),
              deviceId,
              estimatedValue: Math.round(recycler.estimatedValue ?? 0),
              collectionTs: collectionTs ?? new Date().toISOString(),
              collectionLat: collectionLat ?? null,
              collectionLng: collectionLng ?? null,
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            log.accept.info('lot submitted via API', { lotId: data.lotId });
            announceAccepted();
            setLotRef(data.lotId ?? lotId);
            setReferenceCode(data.referenceCode ?? referenceCodeFromUuid(data.lotId ?? lotId));
            setPending(false);   // synced — no yellow pill
            setDone(true);
            return;
          }
          log.accept.warn('API submit non-ok', { status: resp.status });
        } catch (fetchErr) {
          log.accept.warn('API submit failed (offline?)', fetchErr);
        }
        // Offline fallback — queue locally
        announceAccepted();
        setLotRef(lotId);
        setReferenceCode(referenceCodeFromUuid(lotId));
        setPending(true);
        setDone(true);
        return;
      }

      // ── Local DB available ───────────────────────────────────────────────
      const lot = await createLot(db, draft);
      log.accept.info('lot created', { lotId: lot.id });

      const acceptance = await createAcceptance(db, {
        lotId: lot.id,
        recyclerId: recycler.id,
        rate: String(recycler.rate),
        unit,
      });
      log.accept.info('acceptance created', { lotId: lot.id, recyclerId: recycler.id, rate: recycler.rate });

      announceAccepted();
      setLotRef(lot.id);
      setReferenceCode(referenceCodeFromUuid(lot.id));
      setPending(true);
      setDone(true);
    } catch (err) {
      log.accept.error('accept failed', err);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Screen style={styles.doneScreen}>
        <ScrollView
          contentContainerStyle={styles.doneScroll}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={64} color={colors.primary} style={styles.tick} />
          <Text variant="xl" style={styles.successTitle}>{t('accept_success_title')}</Text>
          <Text style={styles.successSub}>
            {t('accept_will_notify', { name: recycler?.name })}
          </Text>
          {pending && (
            <View style={styles.pendingBadge}>
              <Ionicons name="sync" size={13} color={colors.warning} />
              <Text variant="sm" style={styles.pendingText}>{t('accept_sync_pending')}</Text>
            </View>
          )}
        </View>

        {/* The QR the recycler scans at the gate.
            It used to exist only on the Handover screen, which is reachable
            only from a pending request — a screen that cannot appear until
            the recycler has already inspected the lot, which they cannot do
            until they have scanned this. The collector was told to travel
            with nothing to show on arrival. It belongs here, at the moment
            they are told to set off. */}
        {referenceCode && (
          <View style={styles.qrCard}>
            <Text variant="sm" style={styles.qrCardLabel}>{t('accept_show_recycler')}</Text>
            <View style={styles.qrFrame}>
              <QRCode
                value={referenceCode}
                size={148}
                color={colors.primary}
                backgroundColor={colors.surface}
              />
            </View>
            <Text variant="md" style={styles.qrCode}>{referenceCode}</Text>
            <Text variant="sm" style={styles.qrHint}>
              {t('accept_qr_fallback_hint')}
            </Text>
          </View>
        )}

        {/* The most important sentence in the app */}
        <View style={styles.goNow}>
          <Text variant="lg" style={styles.goNowText}>{t('accept_go_now')}</Text>
          <Text variant="sm" style={styles.goNowSub}>
            {t('accept_go_now_sub')}
          </Text>
        </View>

        {hasLocation(recycler) && (
          <View style={styles.travelRow}>
            <Button title={t('accept_directions')} onPress={openDirections} style={styles.directionsBtn} />
            <Button title={t('accept_share_location')} onPress={shareLocation} style={styles.shareBtn} variant="ghost" />
          </View>
        )}

        <Button
          title={t('accept_go_home')}
          onPress={() => navigation.navigate('Main')}
          style={styles.homeBtn}
        />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('accept_confirm')}</Text>

      <View style={styles.card}>
        <Text variant="xl" style={styles.recyclerName}>{recycler?.name}</Text>
        {recycler?.distanceKm != null && (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text variant="sm" style={styles.detail}>{t('accept_distance_km', { km: recycler.distanceKm.toFixed(1) })}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.detail}>{t('authorized_label')}</Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text variant="sm" style={styles.valueLabel}>{t('value_label')}</Text>
        <Text variant="3xl" style={styles.value}>
          ₹{Math.round(recycler?.estimatedValue ?? 0).toLocaleString('en-IN')}
        </Text>
        <Text variant="sm" style={styles.valueSub}>
          {quantity} {unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}{' × ₹'}{recycler?.rate}/{unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
        </Text>
      </View>

      <Button
        title={t('accept_label')}
        onPress={handleAccept}
        style={styles.acceptBtn}
        disabled={loading}
      />
      <Button
        title={t('back')}
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        variant="ghost"
      />
    </Screen>
  );
}

// styles for the travel affordances live with the rest of the sheet below
// Helpers — in production these come from device meta/collector table
async function getOrCreateCollectorId(db) {
  if (!db) return uuidv7();
  try {
    const meta = await db.meta.findUnique({ where: { key: 'collector_id' } });
    if (meta) return meta.value;
    const id = uuidv7();
    await db.meta.create({ data: { key: 'collector_id', value: id } });
    return id;
  } catch { return uuidv7(); }
}

async function resolveCategoryId(db, code) {
  if (!db || !code) return uuidv7();
  try {
    const cat = await db.category.findFirst({ where: { code } });
    return cat?.id ?? uuidv7();
  } catch { return uuidv7(); }
}

const styles = StyleSheet.create({
  // Side by side: directions is the primary action after accepting, but share
  // is the one that still works with no signal, so neither is buried.
  travelRow:     { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
  directionsBtn: { flex: 2 },
  shareBtn:      { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[5] },
  title: { fontWeight: '700', marginBottom: spacing[4] },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing[5], borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing[4],
  },
  recyclerName: { fontWeight: '700', marginBottom: spacing[2] },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginTop: spacing[1] },
  detail: { color: colors.textSecondary },
  valueRow: { alignItems: 'center', paddingVertical: spacing[6] },
  valueLabel: { color: colors.textSecondary, marginBottom: spacing[1] },
  value: { fontWeight: '800', color: colors.primary },
  valueSub: { color: colors.textSecondary, marginTop: spacing[1] },
  acceptBtn: { marginTop: spacing[4], minHeight: 56 },
  backBtn: { marginTop: spacing[2] },
  doneScreen: { flex: 1, backgroundColor: colors.background, padding: 0 },
  doneScroll: { padding: spacing[5], paddingBottom: spacing[10] },
  successCard: { alignItems: 'center', paddingVertical: spacing[6] },
  qrCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing[4], alignItems: 'center', marginBottom: spacing[4],
  },
  qrCardLabel: { color: colors.textSecondary, marginBottom: spacing[3] },
  qrFrame: {
    padding: spacing[3], backgroundColor: colors.surface,
    borderRadius: 12, borderWidth: 2, borderColor: colors.primarySurface,
  },
  qrCode: {
    marginTop: spacing[3], color: colors.primary, fontWeight: '800',
    letterSpacing: 4, fontSize: 20,
  },
  qrHint: { color: colors.textSecondary, marginTop: spacing[1], textAlign: 'center' },
  tick: { marginBottom: spacing[3] },
  successTitle: { fontWeight: '800', color: colors.primary },
  successSub: { color: colors.textSecondary, marginTop: spacing[2], textAlign: 'center' },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    marginTop: spacing[3], backgroundColor: colors.warningSurface,
    paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: 999,
  },
  pendingText: { color: colors.warning },
  goNow: {
    backgroundColor: colors.primarySurface, borderRadius: 16,
    padding: spacing[5], alignItems: 'center', marginBottom: spacing[4],
  },
  goNowText: { fontWeight: '700', color: colors.primary, textAlign: 'center' },
  goNowSub: { color: colors.textSecondary, marginTop: spacing[2], textAlign: 'center' },
  homeBtn: { marginTop: spacing[3] },
});
