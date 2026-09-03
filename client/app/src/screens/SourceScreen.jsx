import React, { useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';

/**
 * S4c — Source (optional, skippable)
 * Row of chips: household / shop / office / institutional / street / other.
 * Auto-advances after AUTO_ADVANCE_MS if nothing is tapped.
 * Never blocks the collector.
 */

const AUTO_ADVANCE_MS = 6000;
const SOURCES = ['household','shop','office','institutional','street','other'];

export default function SourceScreen({ navigation, route }) {
  const t = useStrings();
  const { speak } = useVoice();
  const { category, subCategory, quantity, unit, condition, ...upstream } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speak(t('source_label'));
    }, [speak, t])
  );
  const timerRef = useRef(null);

  const goNext = (sourceType = null) => {
    clearTimeout(timerRef.current);
    navigation.navigate('Value', { ...upstream, category, subCategory, quantity, unit, condition, sourceType });
  };

  // Auto-advance — skips source if collector is not paying attention
  useEffect(() => {
    timerRef.current = setTimeout(() => goNext(null), AUTO_ADVANCE_MS);
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('source_label')}</Text>
      <Text variant="sm" style={styles.hint}>हे ऐच्छिक आहे — ६ सेकंदात आपोआप पुढे जाईल</Text>

      <View style={styles.chips}>
        {SOURCES.map((s) => (
          <TouchableOpacity
            key={s}
            style={styles.chip}
            onPress={() => goNext(s.toUpperCase())}
          >
            <Text variant="md" style={styles.chipText}>
              {ICONS[s]} {t(`source_${s}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.skip} onPress={() => goNext(null)}>
        <Text style={styles.skipText}>वगळा (Skip)</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const ICONS = {
  household: '🏠', shop: '🏪', office: '🏢',
  institutional: '🏫', street: '🛣️', other: '📦',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[6] },
  title: { fontWeight: '700', marginBottom: spacing[2] },
  hint: { color: colors.textSecondary, marginBottom: spacing[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], flex: 1, alignContent: 'flex-start' },
  chip: {
    paddingHorizontal: spacing[5], paddingVertical: spacing[4],
    backgroundColor: colors.surface, borderRadius: 99,
    borderWidth: 1, borderColor: colors.border,
  },
  chipText: { fontWeight: '500' },
  skip: {
    alignSelf: 'center', padding: spacing[4],
    backgroundColor: colors.gray100, borderRadius: 8,
    marginBottom: spacing[4],
  },
  skipText: { color: colors.textSecondary },
});
