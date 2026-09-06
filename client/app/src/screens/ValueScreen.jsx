import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { useLanguage } from '../i18n/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';
import { play, composeNumber } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';
import { rankRecyclers } from '@bhaav/core/ranking';
import { haversineKm } from '@bhaav/core/geo';
import { log } from '../lib/logger';
import { getCachedRates, setCachedRates, isCacheStale, cacheAgeMinutes } from '../lib/recyclerCache';

/**
 * S5 — Value & Ranked Recyclers
 *
 * Flow:
 *  1. Collector sees market rate range (min–max across all recyclers)
 *  2. App ranks recyclers on the AI.md section 2 score — 0.55·value
 *     − 0.30·distance + 0.10·pickup − 0.05·staleness — so a further
 *     recycler paying more per kg can win, which is the whole promise
 *  3. Collector can re-sort by pure value or pure distance and disagree
 *  4. Each row shows: value, rate, distance, ✓ Authorised, materials accepted
 *
 * No typed input on this screen: the collector is holding the material, not
 * negotiating with a keypad, and every extra field costs a low-literacy user.
 *
 * Data:
 *  - Tries AsyncStorage cache first (24h TTL)
 *  - Fetches from API if cache is stale
 *  - Falls back to stale cache if offline
 */

const SORT_LABELS = { score: 'सुचवलेले', rate: 'दर', distance: 'अंतर' };
const MATERIAL_LABELS = {
  CABLE: '🔌 Cable', PCB: '🖥️ PCB', PANEL: '⚡ Panel',
  CRT: '📺 CRT', BATTERY: '🔋 Battery', MOTOR: '⚙️ Motor',
  PLASTIC: '♻️ Plastic', OTHER: '📦 Other',
};

export default function ValueScreen({ navigation, route, db, apiUrl }) {
  const t = useStrings();
  const { speak } = useVoice();
  const { lang } = useLanguage();

  useFocusEffect(
    useCallback(() => {
      speak(t('value_label'));
    }, [speak, t])
  );

  const {
    category, subCategory, quantity, unit, condition, sourceType,
    collectionLat, collectionLng, ...upstream
  } = route.params ?? {};

  const categoryCode = subCategory ?? category ?? '';
  // Rates are seeded at parent level; subcategories share the parent's rate pool.
  const rankingCode = category ?? subCategory ?? '';
  const factorMap = { GOOD: 1.0, FAIR: 0.85, POOR: 0.70 };
  const conditionFactor = factorMap[condition] ?? 1.0;
  const qty = parseFloat(quantity) || 0;
  const collectorFrom = (collectionLat && collectionLng)
    ? { lat: collectionLat, lng: collectionLng } : null;

  const [allRates, setAllRates]           = useState([]);   // raw rates from cache/API
  const [ranked, setRanked]               = useState([]);
  // The filtering, stated. Every recycler below is authorised, so a tick on each
  // row says nothing — the informative number is how many were withheld.
  const [authorisation, setAuthorisation] = useState(null);
  const [sortMode, setSortMode]           = useState('score');
  const [marketMin, setMarketMin]         = useState(null);
  const [marketMax, setMarketMax]         = useState(null);
  const [cacheAge, setCacheAge]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [offline, setOffline]             = useState(false);

  const hasAudio = lang === 'mr' || lang === 'hi';

  // ── Load recycler data (cache → API fallback) ─────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      let rates = [];

      // 1. Try cache
      const cached = await getCachedRates();
      if (cached && !isCacheStale(cached)) {
        log.value.info('using cache', { age: cacheAgeMinutes(cached) });
        rates = cached.rates;
        setCacheAge(cacheAgeMinutes(cached));
        setOffline(false);
      } else {
        // 2. Fetch from API
        if (apiUrl) {
          try {
            const url = `${apiUrl}/public/rates`;
            log.value.info('fetching rates', { url });
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              rates = data.rates ?? [];
              await setCachedRates({ cachedAt: new Date().toISOString(), rates });
              setCacheAge(0);
              setOffline(false);
              log.value.info('rates fetched and cached', { count: rates.length });
            } else {
              log.value.warn('rates fetch not ok', { status: res.status });
            }
          } catch (err) {
            log.value.error('fetch failed', { message: err?.message });
          }
        }

        // 3. Fall back to stale cache if API failed
        if (rates.length === 0 && cached?.rates?.length > 0) {
          rates = cached.rates;
          setCacheAge(cacheAgeMinutes(cached));
          setOffline(true);
          log.value.warn('using stale cache as fallback', { age: cacheAgeMinutes(cached) });
        }
      }

      setAllRates(rates);
      setLoading(false);

      // Compute market rate range for this category (use parent code)
      const catRates = rates
        .filter((r) => r.categoryCode === rankingCode)
        .map((r) => r.price);
      if (catRates.length > 0) {
        setMarketMin(Math.min(...catRates));
        setMarketMax(Math.max(...catRates));
      }
    })();
  }, [apiUrl, categoryCode]);

  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/public/authorisation`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setAuthorisation(body);
      } catch (err) {
        // Non-fatal: the list still works, it just goes unannotated.
        log.value.warn('authorisation fetch failed', { message: err?.message });
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl]);

  // ── Re-rank whenever rates, condition, quantity or sortMode changes ───
  useEffect(() => {
    if (allRates.length === 0) return;

    // Build recycler + rate structures for rankRecyclers
    // Group rates by recyclerId
    const recyclerMap = {};
    for (const r of allRates) {
      if (!recyclerMap[r.recyclerId]) {
        recyclerMap[r.recyclerId] = {
          id:                  r.recyclerId,
          name:                r.recyclerName,
          lat:                 r.lat,
          lng:                 r.lng,
          authorizationStatus: r.authorizationStatus ?? 'VALID',
          materialsAccepted:   r.materialsAccepted ?? [],
          serviceAreaKm:       r.serviceAreaKm ?? 25,
          pickupAvailable:     r.pickupAvailable === true,
          address:             r.address ?? null,
        };
      }
    }
    const recyclers = Object.values(recyclerMap);

    const rates = allRates.map((r) => ({
      recyclerId:   r.recyclerId,
      categoryCode: r.categoryCode,
      price:        r.price,
      unit:         r.unit,
      validFrom:    r.validFrom,
    }));

    const lot = {
      categoryCode: rankingCode,
      quantity: qty,
      unit,
      condition,
      collectionLat,
      collectionLng,
    };

    log.value.info('ranking inputs', { rankingCode, recyclerCount: recyclers.length, rateCount: rates.length, serviceAreaKm: recyclers[0]?.serviceAreaKm });
    let results;
    try {
      results = rankRecyclers({
        lot,
        recyclers,
        rates,
        from: collectorFrom,
        asOf: new Date().toISOString(),
        sortBy: sortMode,
      });
    } catch (err) {
      log.value.error('ranking failed', { message: err?.message });
      results = [];
    }

    setRanked(results);

    // Speak the top recycler's estimated value
    if (results.length > 0 && hasAudio) {
      const est = results[0].value;
      composeNumber(Math.round(est)).forEach((clip) => play(clip).catch(() => {}));
    }

    log.value.info('ranked', { total: results.length, sortMode });
  }, [allRates, sortMode, condition, qty]);

  const handleSelectRecycler = (rec) => {
    navigation.navigate('Accept', {
      ...upstream, category, subCategory, quantity, unit, condition, sourceType,
      collectionLat, collectionLng,
      recycler: {
        id:             rec.recyclerId,
        name:           rec.name,
        rate:           rec.unitPrice,
        estimatedValue: rec.value,
        distanceKm:     rec.distanceKm ?? null,
        materialsAccepted: rec.materialsAccepted,
        // Needed by AcceptScreen to offer directions — without these the
        // collector is told to travel 9 km and given no way to get there.
        lat:            rec.lat ?? null,
        lng:            rec.lng ?? null,
        address:        rec.address ?? null,
      },
    });
  };

  const topEstimate = ranked[0]?.value ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen style={styles.container}>

        {/* Offline / stale cache banner */}
        {offline && (
          <View style={styles.offlineBanner}>
            <Text variant="sm" style={styles.offlineText}>
              📡 ऑफलाइन — कॅश डेटा ({cacheAge != null ? `${cacheAge} मिनिटे जुना` : 'जुना'})
            </Text>
          </View>
        )}

        {authorisation?.listed > 0 && (
          <View style={styles.authRow}>
            <Text variant="sm" style={styles.authText}>
              ✓ {authorisation.listed} पैकी {authorisation.valid} अधिकृत — {authorisation.hiddenFromApp} वगळले
            </Text>
            <Text variant="sm" style={styles.authSource}>
              MPCB · {authorisation.source?.fetchedOn}
            </Text>
          </View>
        )}

        {/* ── Market rate range + headline estimate ───────────────────── */}
        <View style={styles.hero}>
          {/* Market rate range */}
          {marketMin != null && (
            <View style={styles.marketRow}>
              <Text variant="sm" style={styles.marketLabel}>बाजार दर:</Text>
              <Text variant="sm" style={styles.marketRange}>
                ₹{marketMin}–₹{marketMax} / {unit === 'KG' ? 'किलो' : 'नग'}
              </Text>
            </View>
          )}

          {/* Estimated value (based on top ranked recycler) */}
          <Text variant="3xl" style={styles.heroValue}>
            ₹{Math.round(topEstimate).toLocaleString('en-IN')}
          </Text>
          <Text variant="sm" style={styles.heroSub}>
            {qty} {unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
            {ranked[0] ? ` × ₹${ranked[0].unitPrice}/${unit === 'KG' ? 'किलो' : 'नग'}` : ''}
          </Text>
          {loading && <Text variant="sm" style={styles.loadingText}>लोड होत आहे…</Text>}
        </View>

        {/* ── Sort tabs ─────────────────────────────────────────────────── */}
        <View style={styles.sortRow}>
          {Object.entries(SORT_LABELS).map(([mode, label]) => (
            <TouchableOpacity
              key={mode}
              style={[styles.sortBtn, sortMode === mode && styles.sortBtnActive]}
              onPress={() => setSortMode(mode)}
            >
              <Text variant="sm" style={sortMode === mode ? styles.sortBtnTextActive : null}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Recycler list ─────────────────────────────────────────────── */}
        {ranked.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {loading ? 'लोड होत आहे…' : 'कोणताही अधिकृत पुनर्वापरकर्ता उपलब्ध नाही'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={ranked}
            keyExtractor={(item) => item.recyclerId}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const isTop = index === 0 && sortMode === 'score';
              const mats = (item.materialsAccepted ?? []).slice(0, 3);
              return (
                <TouchableOpacity
                  style={[styles.row, isTop && styles.rowTop]}
                  onPress={() => handleSelectRecycler(item)}
                >
                  {isTop && (
                    <View style={styles.badge}>
                      <Text variant="sm" style={styles.badgeText}>⭐ सुचवलेले</Text>
                    </View>
                  )}

                  <View style={styles.rowMain}>
                    <Text variant="md" style={styles.recyclerName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="xl" style={styles.recyclerValue}>
                      ₹{Math.round(item.value).toLocaleString('en-IN')}
                    </Text>
                  </View>

                  {/* Rate + distance + auth — one line */}
                  <View style={styles.metaRow}>
                    <Text variant="sm" style={styles.metaChip}>
                      ₹{item.unitPrice}/{unit === 'KG' ? 'kg' : 'pc'}
                    </Text>
                    {item.distanceKm != null && (
                      <Text variant="sm" style={styles.metaChip}>
                        📍 {item.distanceKm.toFixed(1)} km
                      </Text>
                    )}
                    <Text variant="sm" style={[styles.metaChip, styles.authChip]}>
                      ✓ अधिकृत
                    </Text>
                  </View>

                  {/* Materials accepted */}
                  {mats.length > 0 && (
                    <View style={styles.matRow}>
                      {mats.map((m) => (
                        <View key={m} style={[styles.matChip, m === categoryCode && styles.matChipMatch]}>
                          <Text variant="sm" style={m === categoryCode ? styles.matChipTextMatch : styles.matChipText}>
                            {MATERIAL_LABELS[m] ?? m}
                          </Text>
                        </View>
                      ))}
                      {item.materialsAccepted.length > 3 && (
                        <Text variant="sm" style={styles.matMore}>+{item.materialsAccepted.length - 3}</Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  offlineBanner: { backgroundColor: '#FFF3CD', padding: spacing[2], alignItems: 'center' },
  offlineText:   { color: colors.warning },

  hero: {
    backgroundColor: colors.primarySurface, padding: spacing[4],
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  authRow:       { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'center', marginBottom: spacing[2] },
  authText:      { color: colors.primary, fontWeight: '700' },
  authSource:    { color: colors.textSecondary },

  marketRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[2] },
  marketLabel:   { color: colors.textSecondary },
  marketRange:   { color: colors.primary, fontWeight: '700' },

  heroValue:   { fontWeight: '800', color: colors.primary, textAlign: 'center', marginTop: spacing[1] },
  heroSub:     { color: colors.textSecondary, textAlign: 'center', marginTop: spacing[1] },
  loadingText: { color: colors.textDisabled, textAlign: 'center', marginTop: spacing[1] },

  sortRow:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  sortBtn:          { flex: 1, padding: spacing[3], alignItems: 'center' },
  sortBtnActive:    { borderBottomWidth: 2, borderBottomColor: colors.primary },
  sortBtnTextActive:{ color: colors.primary, fontWeight: '700' },

  list: { flex: 1 },
  row:  { padding: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  rowTop: { backgroundColor: colors.primarySurface },
  badge: {
    alignSelf: 'flex-start', backgroundColor: colors.primary,
    paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 999, marginBottom: spacing[1],
  },
  badgeText: { color: '#fff' },

  rowMain:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  recyclerName:  { fontWeight: '600', flex: 1 },
  recyclerValue: { color: colors.primary, fontWeight: '700' },

  metaRow:  { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[1], flexWrap: 'wrap' },
  metaChip: { color: colors.textSecondary, fontSize: 12 },
  authChip: { color: colors.primary, fontWeight: '600' },

  matRow:  { flexDirection: 'row', gap: spacing[1], flexWrap: 'wrap', marginTop: spacing[1] },
  matChip: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: colors.gray200,
  },
  matChipMatch:     { backgroundColor: colors.primarySurface, borderWidth: 1, borderColor: colors.primary },
  matChipText:      { color: colors.textSecondary, fontSize: 11 },
  matChipTextMatch: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  matMore:          { color: colors.textDisabled, fontSize: 11, alignSelf: 'center' },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[8] },
  emptyText: { color: colors.textSecondary, textAlign: 'center' },
});
