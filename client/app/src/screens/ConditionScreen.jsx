import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { play } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing, conditionColors } from '../ui/tokens';

/**
 * S4b — Condition
 * Three full-width buttons: GOOD / FAIR / POOR.
 * Spoken on tap. Required, no skip.
 * Colour supports the pictogram — never replaces it.
 */

const CONDITIONS = [
  { value: 'GOOD', icon: 'checkmark-circle', bg: conditionColors.GOOD.bg, border: colors.primaryLight,  iconColor: colors.primary, clip: 'good' },
  { value: 'FAIR', icon: 'warning',          bg: conditionColors.FAIR.bg, border: colors.warningLight,  iconColor: colors.warningLight, clip: 'fair' },
  { value: 'POOR', icon: 'close-circle',     bg: conditionColors.POOR.bg, border: colors.dangerLight,   iconColor: colors.danger, clip: 'poor' },
];

export default function ConditionScreen({ navigation, route }) {
  const t = useStrings();
  const { speakKey } = useVoice();
  const { category, subCategory, quantity, unit, ...upstream } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speakKey('condition_label');
    }, [speakKey])
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
        {CONDITIONS.map(({ value, icon, bg, border, iconColor, clip }) => (
          <TouchableOpacity
            key={value}
            style={[styles.btn, { backgroundColor: bg, borderColor: border }]}
            onPress={() => handleSelect(value, clip)}
            accessibilityLabel={t(`condition_${value.toLowerCase()}`)}
          >
            <Ionicons name={icon} size={36} color={iconColor} style={styles.icon} />
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
  icon: { marginBottom: spacing[2] },
  btnLabel: { fontWeight: '700' },
  btnSub: { color: colors.textSecondary, marginTop: spacing[1] },
});
