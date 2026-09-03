import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { colors, typography } from './tokens.js';

/**
 * Text — token-styled text component.
 *
 * Props:
 *   variant   {'heading'|'body'|'label'}  Visual style (default: 'body')
 *   children  {ReactNode}
 *   style     {StyleProp<TextStyle>}      Additional styles (override or extend)
 */
export function Text({ variant = 'body', children, style, ...rest }) {
  const variantStyle = styles[variant] || styles.body;
  return (
    <RNText style={[styles.base, variantStyle, style]} {...rest}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.text,
  },
  heading: {
    fontSize:   typography.size['2xl'],
    fontWeight: typography.weight.bold,
    lineHeight: typography.lineHeight['2xl'],
    color:      colors.gray900,
  },
  body: {
    fontSize:   typography.size.base,
    fontWeight: typography.weight.regular,
    lineHeight: typography.lineHeight.base,
    color:      colors.text,
  },
  label: {
    fontSize:   typography.size.sm,
    fontWeight: typography.weight.medium,
    lineHeight: typography.lineHeight.sm,
    color:      colors.textSecondary,
  },
});
