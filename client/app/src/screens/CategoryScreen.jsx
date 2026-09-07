import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { CategoryIcon } from '../components/CategoryIcon';
import { useStrings } from '../i18n/useStrings';
import { play } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';

/**
 * S2 — Category grid
 * 2×4 grid of material glyphs. Tap → speak the name. "निवडा" → select.
 * Categories requiring sub-type go to S3; others go straight to S4.
 *
 * The confirm control used to be a bare "→" chip, which said nothing about
 * what it did or how it differed from tapping the tile — two controls on one
 * card, one of them wordless. It now carries the word "निवडा" and a tick, and
 * a line above the grid states the two gestures outright. The split itself is
 * deliberate and stays: tapping hears the name, confirming commits to it, so
 * a collector who cannot read the label can check what a tile is before
 * choosing it.
 */

const PARENTS = ['CABLE', 'PCB', 'PANEL', 'CRT', 'BATTERY', 'MOTOR', 'PLASTIC', 'OTHER'];
const NEEDS_SUB = new Set(['PCB', 'BATTERY', 'PANEL', 'MOTOR']);

export default function CategoryScreen({ navigation, route }) {
  const t = useStrings();
  const { speak } = useVoice();
  const upstream = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speak(t('category_label'));
    }, [speak, t])
  );

  const handleTap = (cat) => {
    play(cat.toLowerCase()).catch(() => {});
  };

  const handleSelect = (cat) => {
    play(cat.toLowerCase()).catch(() => {});
    const next = NEEDS_SUB.has(cat) ? 'SubCategory' : 'Quantity';
    navigation.navigate(next, { ...upstream, category: cat });
  };

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('category_label')}</Text>
      <View style={styles.hintRow}>
        <Ionicons name="volume-medium-outline" size={14} color={colors.textSecondary} />
        <Text variant="sm" style={styles.hint}>
          {t('category_hint')}
        </Text>
      </View>
      <View style={styles.grid}>
        {PARENTS.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={styles.cell}
            onPress={() => handleTap(cat)}
            onLongPress={() => handleSelect(cat)}
            accessibilityLabel={t(`category_${cat.toLowerCase()}`)}
          >
            <CategoryIcon categoryId={cat} size={64} />
            <Text variant="sm" style={styles.label}>
              {t(`category_${cat.toLowerCase()}`)}
            </Text>
            {/* Confirm — labelled, not a bare arrow */}
            <TouchableOpacity
              style={styles.confirm}
              onPress={() => handleSelect(cat)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('category_select_a11y', { name: t(`category_${cat.toLowerCase()}`) })}
            >
              <Ionicons name="checkmark" size={13} color="#fff" />
              <Text style={styles.confirmText}>{t('select_label')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[4] },
  title: { marginBottom: spacing[2], fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  cell: {
    width: '47%', aspectRatio: 1,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: spacing[2],
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginBottom: spacing[3] },
  hint: { color: colors.textSecondary, flex: 1 },
  label: { marginTop: spacing[1], textAlign: 'center', fontWeight: '600' },
  confirm: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    position: 'absolute', bottom: spacing[2], right: spacing[2],
    backgroundColor: colors.primary, borderRadius: 999,
    paddingHorizontal: spacing[2], paddingVertical: 3,
  },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
