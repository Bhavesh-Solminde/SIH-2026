import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from './tokens.js';

/**
 * Button — primary interactive element.
 *
 * Props:
 *   title     {string}              Button label
 *   onPress   {function}            Press handler
 *   variant   {'primary'|'danger'}  Visual style (default: 'primary')
 *   disabled  {boolean}             Disables interaction and dims the button
 */
export function Button({ title, onPress, variant = 'primary', disabled = false }) {
  const containerStyle = [
    styles.base,
    variant === 'danger' ? styles.danger : styles.primary,
    disabled && styles.disabled,
  ];

  const textStyle = [
    styles.label,
    disabled && styles.labelDisabled,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={textStyle}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical:   spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius:      borderRadius.md,
    alignItems:        'center',
    justifyContent:    'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  disabled: {
    backgroundColor: colors.gray300,
  },
  label: {
    color:      colors.white,
    fontSize:   typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  labelDisabled: {
    color: colors.gray600,
  },
});
