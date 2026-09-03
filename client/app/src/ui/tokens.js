/**
 * Design tokens for the Bhaav Collector app.
 *
 * Single source of truth for colors, spacing, typography, and shape.
 * Import these in components rather than hard-coding values.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
export const colors = {
  // Primary brand green (eco / recycling theme)
  primary:       '#2E7D32',  // green-800
  primaryLight:  '#4CAF50',  // green-500
  primaryDark:   '#1B5E20',  // green-900
  primarySurface:'#E8F5E9',  // green-50  (backgrounds, chips)

  // Danger / destructive
  danger:        '#C62828',  // red-800
  dangerLight:   '#EF5350',  // red-400
  dangerSurface: '#FFEBEE',  // red-50

  // Warning
  warning:       '#F57F17',  // amber-900
  warningSurface:'#FFFDE7',  // yellow-50

  // Neutrals
  gray900:       '#212121',
  gray800:       '#424242',
  gray700:       '#616161',
  gray600:       '#757575',
  gray500:       '#9E9E9E',
  gray400:       '#BDBDBD',
  gray300:       '#E0E0E0',
  gray200:       '#EEEEEE',
  gray100:       '#F5F5F5',
  gray50:        '#FAFAFA',

  // Semantic aliases
  text:          '#212121',
  textSecondary: '#757575',
  textDisabled:  '#BDBDBD',
  textInverse:   '#FFFFFF',

  background:    '#FAFAFA',
  surface:       '#FFFFFF',
  border:        '#E0E0E0',
  divider:       '#EEEEEE',

  white:         '#FFFFFF',
  black:         '#000000',
  transparent:   'transparent',
};

// ---------------------------------------------------------------------------
// Spacing scale (4-pt base grid)
// ---------------------------------------------------------------------------
export const spacing = {
  0:   0,
  1:   4,
  2:   8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
};

// Convenience aliases
export const space = spacing;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const typography = {
  // Font sizes
  size: {
    xs:   11,
    sm:   13,
    base: 15,
    md:   17,
    lg:   20,
    xl:   24,
    '2xl':28,
    '3xl':34,
  },

  // Font weights (React Native uses string values)
  weight: {
    regular: '400',
    medium:  '500',
    semibold:'600',
    bold:    '700',
  },

  // Line heights (absolute, pairs with the size above)
  lineHeight: {
    xs:   16,
    sm:   20,
    base: 22,
    md:   24,
    lg:   28,
    xl:   32,
    '2xl':36,
    '3xl':40,
  },
};

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------
export const borderRadius = {
  none:  0,
  sm:    4,
  md:    8,
  lg:   12,
  xl:   16,
  full: 9999,
};

// ---------------------------------------------------------------------------
// Elevation / shadow presets (Android elevation + iOS shadow)
// ---------------------------------------------------------------------------
export const elevation = {
  none: {
    elevation: 0,
    shadowOpacity: 0,
  },
  sm: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  md: {
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
};
