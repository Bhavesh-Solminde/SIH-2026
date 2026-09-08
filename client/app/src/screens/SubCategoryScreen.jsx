import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { play } from '../audio';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';

/**
 * S3 — Sub-category clarifying question
 * Two large options + "I don't know" (always routes to the lower-value sub-type).
 */

// `a` (the two answer options) stay English regardless of language by design
// — these are widely recognised technical terms (e.g. "Laptop", "Inverter")
// rather than translated UI copy, the same way category_crt keeps "CRT" in
// its Marathi and Hindi forms. `qKey` resolves through the catalogue.
const SUB_MAP = {
  PCB:     { qKey: 'subcat_q_pcb',     a: ['Computer / Laptop', 'TV / Appliance'], codes: ['PCB_COMP', 'PCB_TV'],     icons: ['laptop-outline', 'tv-outline'],           unknown: 'PCB_TV' },
  BATTERY: { qKey: 'subcat_q_battery', a: ['Phone / Laptop',   'Inverter / UPS'], codes: ['BAT_LIGHT','BAT_HEAVY'],  icons: ['phone-portrait-outline', 'flash-outline'], unknown: 'BAT_HEAVY' },
  PANEL:   { qKey: 'subcat_q_panel',   a: ['Laptop / Monitor', 'Television'],      codes: ['PNL_SMALL','PNL_TV'],     icons: ['laptop-outline', 'tv-outline'],           unknown: 'PNL_TV' },
  MOTOR:   { qKey: 'subcat_q_motor',   a: ['Hard Disk',        'Fan / Pump Motor'],codes: ['MOT_HDD',  'MOT_FAN'],    icons: ['disc-outline', 'cog-outline'],            unknown: 'MOT_FAN' },
};

export default function SubCategoryScreen({ navigation, route }) {
  const t = useStrings();
  const { speakKey } = useVoice();
  const { category, ...upstream } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speakKey('subcategory_label');
    }, [speakKey])
  );
  const sub = SUB_MAP[category];

  const handleSelect = (code) => {
    play(code.toLowerCase()).catch(() => {});
    navigation.navigate('Quantity', { ...upstream, category, subCategory: code });
  };

  if (!sub) {
    navigation.navigate('Quantity', { ...upstream, category });
    return null;
  }

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.question}>{t(sub.qKey)}</Text>

      <View style={styles.options}>
        {sub.a.map((label, i) => (
          <TouchableOpacity
            key={sub.codes[i]}
            style={styles.option}
            onPress={() => handleSelect(sub.codes[i])}
          >
            <Ionicons name={sub.icons[i]} size={40} color={colors.primary} style={styles.optionIcon} />
            <Text variant="md" style={styles.optionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Always present: I don't know → lower-value sub-type */}
      <TouchableOpacity
        style={styles.unknown}
        onPress={() => handleSelect(sub.unknown)}
      >
        <Text style={styles.unknownText}>{t('subcat_unknown')}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[6] },
  question: { fontWeight: '700', marginBottom: spacing[8], textAlign: 'center' },
  options: { flexDirection: 'row', gap: spacing[4], flex: 1 },
  option: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', padding: spacing[4],
  },
  optionIcon: { marginBottom: spacing[3] },
  optionLabel: { textAlign: 'center', fontWeight: '600' },
  unknown: {
    marginTop: spacing[6], padding: spacing[4], alignItems: 'center',
    borderRadius: 8, backgroundColor: colors.gray100,
  },
  unknownText: { color: colors.textSecondary },
});
