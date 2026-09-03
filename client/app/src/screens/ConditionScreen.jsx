import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { play } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';

/**
 * S4b — Condition
 * Three full-width buttons: GOOD / FAIR / POOR.
 * Spoken on tap. Required, no skip.
 * Colour supports the pictogram — never replaces it.
 */

const CONDITIONS = [
  { value: 'GOOD', icon: '✅', bg: colors.primarySurface, border: colors.primaryLight, clip: 'good' },
  { value: 'FAIR', icon: '⚠️', bg: '#FFF8E1',              border: '#FFB300',           clip: 'fair' },
  { value: 'POOR', icon: '❌', bg: colors.dangerSurface,   border: colors.dangerLight,  clip: 'poor' },
];

export default function ConditionScreen({ navigation, route }) {
  const t = useStrings();
  const { speak } = useVoice();
  const { category, subCategory, quantity, unit, ...upstream } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speak(t('condition_label'));
    }, [speak, t])
  );

  const handleSelect = (condition, clip) => {
    play(clip).catch(() => {});
    navigation.navigate('Source', { ...upstream, category, subCategory, quantity, unit, condition });
  };

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('condition_label')}</Text>
      <Text variant="sm" style={styles.sub}>
        {quantity} {unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')} · {t(`category_${category?.toLowerCase()}`)}
      </Text>

      <View style={styles.buttons}>
        {CONDITIONS.map(({ value, icon, bg, border, clip }) => (
          <TouchableOpacity
            key={value}
            style={[styles.btn, { backgroundColor: bg, borderColor: border }]}
            onPress={() => handleSelect(value, clip)}
            accessibilityLabel={t(`condition_${value.toLowerCase()}`)}
          >
            <Text style={styles.icon}>{icon}</Text>
            <Text variant="xl" style={styles.btnLabel}>
              {t(`condition_${value.toLowerCase()}`)}
            </Text>
            <Text variant="sm" style={styles.btnSub}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[4] },
  title: { fontWeight: '700', marginBottom: spacing[1] },
  sub: { color: colors.textSecondary, marginBottom: spacing[6] },
  buttons: { flex: 1, gap: spacing[3] },
  btn: {
    flex: 1, borderRadius: 16, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', padding: spacing[4],
  },
  icon: { fontSize: 36, lineHeight: 44, marginBottom: spacing[2] },
  btnLabel: { fontWeight: '700' },
  btnSub: { color: colors.textSecondary, marginTop: spacing[1] },
});
