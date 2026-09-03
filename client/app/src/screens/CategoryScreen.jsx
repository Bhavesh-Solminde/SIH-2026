import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { CategoryIcon } from '../components/CategoryIcon';
import { useStrings } from '../i18n/useStrings';
import { play } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';

/**
 * S2 — Category grid
 * 2×4 grid of drawn icons. Tap → speak name. Long-press or confirm arrow → select.
 * Categories requiring sub-type go to S3; others go straight to S4.
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
      <View style={styles.grid}>
        {PARENTS.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={styles.cell}
            onPress={() => handleTap(cat)}
            onLongPress={() => handleSelect(cat)}
            accessibilityLabel={t(`category_${cat.toLowerCase()}`)}
          >
            <CategoryIcon categoryId={cat} size={72} />
            <Text variant="sm" style={styles.label}>
              {t(`category_${cat.toLowerCase()}`)}
            </Text>
            {/* Confirm arrow */}
            <TouchableOpacity
              style={styles.arrow}
              onPress={() => handleSelect(cat)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.arrowText}>→</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[4] },
  title: { marginBottom: spacing[4], fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  cell: {
    width: '47%', aspectRatio: 1,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: spacing[2],
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  label: { marginTop: spacing[1], textAlign: 'center' },
  arrow: {
    position: 'absolute', bottom: spacing[1], right: spacing[2],
    backgroundColor: colors.primarySurface, borderRadius: 12,
    paddingHorizontal: spacing[2], paddingVertical: 2,
  },
  arrowText: { color: colors.primary, fontWeight: '700' },
});
