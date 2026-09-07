import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { useVoice } from '../hooks/useVoice';
import { useLanguage } from '../i18n/LanguageContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { play, composeNumber } from '../audio';
import { colors, spacing } from '../ui/tokens';
import { loadReference, rateAgeDays } from '../db/repos/reference';

/**
 * Price board — standalone, reachable from S0
 * Plain table of current rates per category with the date.
 * Speaker button reads the whole board aloud in sequence.
 * Rate staleness strip shown if > 3 days old.
 *
 * When db is null, fetches from the public API.
 */

// toLocaleDateString locale per active language — this used to be hardcoded
// to 'mr-IN' regardless of the collector's chosen language.
const DATE_LOCALE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

export default function PriceBoardScreen({ db, apiUrl }) {
  const API_BASE = apiUrl ?? 'http://192.168.0.102:4000';
  const t = useStrings();
  const { speak } = useVoice();
  const { lang } = useLanguage();

  useFocusEffect(
    useCallback(() => {
      speak(t('price_board_title'));
    }, [speak, t])
  );
  // All three languages now ship a clip pack (see src/audio/clips.js), so the
  // read-aloud button is no longer restricted to mr/hi.
  const hasAudio = lang === 'mr' || lang === 'hi' || lang === 'en';
  const [rates, setRates] = useState([]);
  const [ageDays, setAgeDays] = useState(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // ── Path A: local DB ────────────────────────────────────────────────────
    if (db) {
      (async () => {
        const [ref, age] = await Promise.all([loadReference(db), rateAgeDays(db)]);
        setAgeDays(age);
        const rateMap = {};
        ref.rates.forEach((r) => {
          if (!rateMap[r.categoryCode] || new Date(r.validFrom) > new Date(rateMap[r.categoryCode].validFrom)) {
            rateMap[r.categoryCode] = r;
          }
        });
        const cats = ref.categories.filter((c) => !c.parent_code);
        setRates(cats.map((c) => ({
          code: c.code,
          nameMr: c.name_mr,
          nameEn: c.name_en,
          price: rateMap[c.code]?.price ?? null,
          unit: rateMap[c.code]?.unit ?? 'KG',
          validFrom: rateMap[c.code]?.validFrom ?? null,
        })));
      })().catch(() => {});
      return;
    }

    // ── Path B: fetch all rates from public API ─────────────────────────────
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/rates`);
        if (!res.ok) return;
        const data = await res.json();
        const apiRates = data.rates ?? [];

        // Group by categoryCode — pick lowest price across recyclers for display
        const map = {};
        for (const r of apiRates) {
          if (!r.categoryCode) continue;
          if (!map[r.categoryCode] || r.price < map[r.categoryCode].price) {
            map[r.categoryCode] = r;
          }
        }

        const rows = Object.values(map).map((r) => ({
          code: r.categoryCode,
          nameMr: r.categoryNameMr ?? r.categoryCode,
          nameEn: r.categoryNameEn ?? r.categoryCode,
          price: r.price,
          unit: r.unit ?? 'KG',
          validFrom: r.validFrom,
        }));

        setRates(rows);
        if (rows.length > 0 && rows[0].validFrom) {
          const ageDaysCalc = Math.floor(
            (Date.now() - new Date(rows[0].validFrom).getTime()) / 86_400_000
          );
          setAgeDays(ageDaysCalc);
        }
      } catch {
        // Offline — leave empty
      }
    })();
  }, [db]);

  const readAllAloud = async () => {
    if (speaking || rates.length === 0 || !hasAudio) return;
    setSpeaking(true);
    for (const r of rates) {
      if (r.price != null) {
        await play(r.code.toLowerCase(), lang).catch(() => {});
        const clips = composeNumber(Math.round(r.price));
        for (const clip of clips) await play(clip, lang).catch(() => {});
      }
    }
    setSpeaking(false);
  };

  const isStale = ageDays != null && ageDays >= 3;
  const rateDate = rates.find((r) => r.validFrom)?.validFrom;

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <CategoryIcon categoryId={item.code} size={36} />
      <View style={styles.rowBody}>
        <Text variant="md" style={styles.catName}>
          {lang === 'mr' || lang === 'hi' ? item.nameMr : item.nameEn}
        </Text>
        <Text variant="sm" style={styles.unitLabel}>
          {item.unit === 'KG' ? t('price_board_per_kg') : t('price_board_per_pc')}
        </Text>
      </View>
      <Text variant="xl" style={styles.price}>
        {item.price != null ? `₹${item.price}` : '—'}
      </Text>
    </View>
  );

  return (
    <Screen style={styles.container}>
      {isStale && rateDate && (
        <View style={[styles.strip, ageDays >= 14 && styles.stripAmber]}>
          {ageDays >= 14 && <Ionicons name="warning" size={14} color={colors.warning} style={styles.stripIcon} />}
          <Text variant="sm" style={styles.stripText}>
            {ageDays >= 14
              ? t('price_board_stale')
              : t('price_board_as_of', { date: new Date(rateDate).toLocaleDateString(DATE_LOCALE[lang] ?? 'mr-IN') })}
          </Text>
        </View>
      )}

      <View style={styles.topRow}>
        <Text variant="lg" style={styles.title}>{t('price_board_title')}</Text>
        {hasAudio && (
          <TouchableOpacity
            style={styles.speakBtn}
            onPress={readAllAloud}
            disabled={speaking || rates.length === 0}
          >
            <Ionicons
              name={speaking ? 'volume-high' : 'volume-high-outline'}
              size={26}
              color={speaking ? colors.textDisabled : colors.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      {rates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('price_board_loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={rates}
          keyExtractor={(item) => item.code}
          renderItem={renderItem}
          style={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  strip: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: colors.gray200, padding: spacing[2], justifyContent: 'center' },
  stripAmber: { backgroundColor: colors.warningSurface },
  stripIcon: {},
  stripText: { color: colors.warning },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing[4], backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontWeight: '700' },
  speakBtn: { padding: spacing[2] },
  list: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    padding: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowBody: { flex: 1 },
  catName: { fontWeight: '600' },
  unitLabel: { color: colors.textSecondary, marginTop: 2 },
  price: { fontWeight: '700', color: colors.primary },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.textSecondary },
});
