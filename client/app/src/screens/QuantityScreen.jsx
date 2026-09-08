import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { useVoice } from '../hooks/useVoice';
import { colors, spacing } from '../ui/tokens';

/**
 * S4 — Quantity input
 * Unit toggle first (KG / PIECE). Large numeric keypad.
 * Decimal for KG; integers only for PIECE.
 *
 * Spoken feedback is ONE digit per press — the digit that was just pressed,
 * nothing else. Reading the whole running total after every tap ("two", then
 * "twenty", then "two hundred four") is what made this screen unusable: the
 * collector heard the old number and the new one layered together and could
 * not tell which was which. A key press confirms the key; the running total
 * is on screen, and the collector can hear it read back on demand from the
 * display.
 */

const KEYS = ['7','8','9','4','5','6','1','2','3','.','0','⌫'];

export default function QuantityScreen({ navigation, route }) {
  const t = useStrings();
  const { speakKey, speakClips, speakNumber } = useVoice();
  const { category, subCategory, ...upstream } = route.params ?? {};

  useFocusEffect(
    useCallback(() => {
      speakKey('quantity_label');
    }, [speakKey])
  );
  const [unit, setUnit] = useState('KG');
  const [raw, setRaw] = useState('');

  const value = raw === '' ? '0' : raw;

  const DIGIT_CLIPS = ['zero','one','two','three','four','five','six','seven','eight','nine'];

  const handleKey = (key) => {
    if (key === '⌫') {
      setRaw((v) => v.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (unit === 'PIECE') return;          // integers only for pieces
      if (raw.includes('.')) return;
      setRaw((v) => (v === '' ? '0.' : v + '.'));
      return;
    }
    // Prevent leading zeros
    setRaw((v) => (v === '0' ? key : v + key));
    // Confirm the key that was pressed — nothing more.
    speakClips([DIGIT_CLIPS[Number(key)]]);
  };

  // Read the whole entered amount back, digit by digit, on demand.
  const readBackValue = () => {
    const n = parseFloat(value);
    if (!isNaN(n)) speakNumber(n);
  };

  const handleUnitToggle = (u) => {
    setUnit(u);
    if (u === 'PIECE' && raw.includes('.')) setRaw(Math.floor(parseFloat(raw)).toString());
  };

  const handleNext = () => {
    const qty = parseFloat(value);
    if (!qty || qty <= 0) return;
    navigation.navigate('Condition', { ...upstream, category, subCategory, quantity: qty, unit });
  };

  return (
    <Screen style={styles.container}>
      {/* Unit toggle */}
      <View style={styles.toggleRow}>
        {['KG','PIECE'].map((u) => (
          <TouchableOpacity
            key={u}
            style={[styles.toggle, unit === u && styles.toggleActive]}
            onPress={() => handleUnitToggle(u)}
          >
            <Text style={unit === u ? styles.toggleTextActive : styles.toggleText}>
              {u === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Display — tap to hear the whole number read back, digit by digit */}
      <TouchableOpacity
        style={styles.display}
        onPress={readBackValue}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('requests_listen_amount')}
      >
        <Text variant="3xl" style={styles.displayValue}>{value}</Text>
        <Text variant="md" style={styles.displayUnit}>
          {unit === 'KG' ? t('quantity_kg') : t('quantity_pieces')}
        </Text>
        <View style={styles.listenRow}>
          <Ionicons name="volume-medium-outline" size={14} color={colors.primary} />
          <Text variant="sm" style={styles.listenText}>{t('tap_to_listen')}</Text>
        </View>
      </TouchableOpacity>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.key, k === '.' && unit === 'PIECE' && styles.keyDisabled]}
            onPress={() => handleKey(k)}
            disabled={k === '.' && unit === 'PIECE'}
          >
            <Text variant="xl" style={styles.keyText}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button
        title={`${t('next')} →`}
        onPress={handleNext}
        style={styles.nextBtn}
        disabled={!parseFloat(value) || parseFloat(value) <= 0}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing[4] },
  toggleRow: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[4] },
  toggle: {
    flex: 1, padding: spacing[3], borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  toggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { color: colors.text },
  toggleTextActive: { color: '#fff', fontWeight: '700' },
  display: {
    alignItems: 'center', paddingVertical: spacing[6],
    backgroundColor: colors.surface, borderRadius: 12, marginBottom: spacing[4],
  },
  displayValue: { fontWeight: '700', color: colors.primary },
  displayUnit: { color: colors.textSecondary, marginTop: spacing[1] },
  listenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginTop: spacing[2] },
  listenText: { color: colors.primary, fontWeight: '600' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[4] },
  key: {
    width: '30%', aspectRatio: 1.5, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  keyDisabled: { opacity: 0.3 },
  keyText: { fontWeight: '600' },
  nextBtn: {},
});
