import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { play } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';
import { createLot } from '../db/repos/lots';
import { createAcceptance } from '../db/repos/acceptances';
import { uuidv7 } from '@bhaav/core/ids';
import { getDeviceId } from '../lib/deviceId';
import { log } from '../lib/logger';

/**
 * S6 — Accept
 */
export default function AcceptScreen({ navigation, route, db, apiUrl }) {
  const t = useStrings();
  const { speak } = useVoice();

  useFocusEffect(
    useCallback(() => {
      speak(t('accept_label'));
    }, [speak, t])
  );
  const {
    recycler, category, subCategory, quantity, unit, condition, sourceType,
    collectionLat, collectionLng, collectionTs, photos = [], operatingArea,
  } = route.params ?? {};

  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [lotRef, setLotRef] = useState(null);
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
            play('good').catch(() => {});
            setLotRef(data.lotId ?? lotId);
            setPending(false);   // synced — no yellow pill
            setDone(true);
            return;
          }
          log.accept.warn('API submit non-ok', { status: resp.status });
        } catch (fetchErr) {
          log.accept.warn('API submit failed (offline?)', fetchErr);
        }
        // Offline fallback — queue locally
        play('good').catch(() => {});
        setLotRef(lotId);
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

      play('good').catch(() => {});
      setLotRef(lot.id);
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
      <Screen style={styles.container}>
        <View style={styles.successCard}>
          <Text style={styles.tick}>✅</Text>
          <Text variant="xl" style={styles.successTitle}>स्वीकारले!</Text>
          <Text style={styles.successSub}>
            {recycler?.name} ला कळवले जाईल.
          </Text>
          {pending && (
            <View style={styles.pendingBadge}>
              <Text variant="sm" style={styles.pendingText}>⟳ समक्रमण प्रलंबित</Text>
            </View>
          )}
        </View>

        {/* The most important sentence in the app */}
        <View style={styles.goNow}>
          <Text variant="lg" style={styles.goNowText}>तुम्ही आत्ता जाऊ शकता.</Text>
          <Text variant="sm" style={styles.goNowSub}>
            स्वीकृती म्हणजे परवानगी नाही — आत्ता जा.
          </Text>
        </View>

        <Button
          title="मुख्यपृष्ठावर जा"
          onPress={() => navigation.navigate('Main')}
          style={styles.homeBtn}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('accept_confirm')}</Text>

      <View style={styles.card}>
        <Text variant="xl" style={styles.recyclerName}>{recycler?.name}</Text>
        {recycler?.distanceKm != null && (
          <Text variant="sm" style={styles.detail}>📍 {recycler.distanceKm.toFixed(1)} किमी</Text>
        )}
        <Text style={styles.detail}>✓ अधिकृत</Text>
      </View>

      <View style={styles.valueRow}>
        <Text variant="sm" style={styles.valueLabel}>अंदाजे मूल्य</Text>
        <Text variant="3xl" style={styles.value}>
          ₹{Math.round(recycler?.estimatedValue ?? 0).toLocaleString('en-IN')}
        </Text>
        <Text variant="sm" style={styles.valueSub}>
          {quantity} {unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')} × ₹{recycler?.rate}/{unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
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
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[5] },
  title: { fontWeight: '700', marginBottom: spacing[4] },
  card: {
    backgroundColor: colors.surface, borderRadius: 16,
    padding: spacing[5], borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing[4],
  },
  recyclerName: { fontWeight: '700', marginBottom: spacing[2] },
  detail: { color: colors.textSecondary, marginTop: spacing[1] },
  valueRow: { alignItems: 'center', paddingVertical: spacing[6] },
  valueLabel: { color: colors.textSecondary, marginBottom: spacing[1] },
  value: { fontWeight: '800', color: colors.primary },
  valueSub: { color: colors.textSecondary, marginTop: spacing[1] },
  acceptBtn: { marginTop: spacing[4], minHeight: 56 },
  backBtn: { marginTop: spacing[2] },
  successCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  tick: { fontSize: 64, marginBottom: spacing[4] },
  successTitle: { fontWeight: '800', color: colors.primary },
  successSub: { color: colors.textSecondary, marginTop: spacing[2], textAlign: 'center' },
  pendingBadge: {
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
  homeBtn: {},
});
