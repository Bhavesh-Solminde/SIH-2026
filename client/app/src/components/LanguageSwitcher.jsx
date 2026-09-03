import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { useLanguage } from '../i18n/LanguageContext';
import { colors, spacing } from '../ui/tokens';

const LANGS = [
  { code: 'mr', label: 'म' },
  { code: 'hi', label: 'हि' },
  { code: 'en', label: 'EN' },
];

/**
 * Language switcher — 3 pill buttons (मराठी / हिंदी / English).
 * Place in any screen header or toolbar.
 * Uses LanguageContext so the entire app re-renders in the new language.
 */
export function LanguageSwitcher({ style }) {
  const { lang, setLang } = useLanguage();

  return (
    <View style={[styles.row, style]}>
      {LANGS.map(({ code, label }) => (
        <TouchableOpacity
          key={code}
          style={[styles.pill, lang === code && styles.pillActive]}
          onPress={() => setLang(code)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[styles.label, lang === code && styles.labelActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 32,
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelActive: {
    color: '#fff',
  },
});

