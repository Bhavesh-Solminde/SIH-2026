import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from './tokens.js';

const VARIANT_STYLE = {
  primary: 'primary',
  danger: 'danger',
  ghost: 'ghost',
  secondary: 'ghost',
};

/**
 * Button — primary interactive element.
 *
 * Props:
 *   title     {string}                                   Button label
 *   onPress   {function}                                  Press handler
 *   variant   {'primary'|'danger'|'ghost'|'secondary'}     Visual style (default: 'primary')
 *   disabled  {boolean}                                    Disables interaction and dims the button
 *   style     {object|array}                               Layout overrides (flex, margins, minHeight)
 *
 * `style` used to be accepted at every call site and silently dropped here.
 * Twelve screens pass one — `flex: 2` / `flex: 1` on the Accept screen's
 * directions-and-share row, `minHeight` on the Home screen's main button —
 * and none of it applied, which is why side-by-side buttons overflowed their
 * row and collided with what followed them.
 */
export function Button({ title, onPress, variant = 'primary', disabled = false, style, textStyle }) {
  const resolved = VARIANT_STYLE[variant] ?? 'primary';
  const containerStyle = [
    styles.base,
    styles[resolved],
    disabled && (resolved === 'ghost' ? styles.disabledGhost : styles.disabled),
    style,
  ];

  const resolvedTextStyle = [
    styles.label,
    resolved === 'ghost' && styles.labelGhost,
    disabled && styles.labelDisabled,
    textStyle,
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
      <Text style={resolvedTextStyle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {title}
      </Text>
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
  ghost: {
    backgroundColor: colors.transparent,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  disabled: {
    backgroundColor: colors.gray300,
  },
  disabledGhost: {
    borderColor: colors.gray300,
  },
  label: {
    color:      colors.white,
    fontSize:   typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  labelGhost: {
    color: colors.primary,
  },
  labelDisabled: {
    color: colors.gray600,
  },
});
