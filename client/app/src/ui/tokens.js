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
  // #F57F17 on warningSurface measured 2.58:1 (WCAG AA needs 4.5:1) — the
  // "Pending" status pill on LotsScreen/LedgerScreen/HomeScreen was
  // effectively unreadable. Darkened to amber-900-on-tint contrast pattern:
  // #8A5A00 holds 5.7:1 on warningSurface and 5.9:1 on white.
  warning:       '#8A5A00',  // amber-900, contrast-corrected for text-on-tint
  warningLight:  '#FFB300',  // amber-500 (border/accent use only — not for text-on-tint)
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
  // #757575 on background(#FAFAFA) measured 4.41:1 — just under the 4.5:1
  // AA floor for this label/secondary-text color used across 14 screens.
  // #686868 clears it (5.1:1 on background, 5.3:1 on white).
  textSecondary: '#686868',
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
// Status / condition color maps
//
// Single source of truth for the (bg, text) pair used to badge a lot's
// status or a collector's inspected condition. Previously redefined ad hoc
// with slightly different values in LotsScreen (STATUS_CONFIG), LedgerScreen
// (STATUS_CHIP) and PendingRequestsScreen (CONDITION_COLOR) — three
// independent copies of the same three-state palette, drifting further out
// of sync with every edit. Screens should import these instead of declaring
// their own.
// ---------------------------------------------------------------------------
export const statusColors = {
  DRAFT:            { bg: colors.gray200,        text: colors.textSecondary },
  PENDING:          { bg: colors.warningSurface, text: colors.warning },
  ACCEPTED:         { bg: '#E3F2FD',              text: '#1565C0' },
  AWAITING_CONFIRM: { bg: '#E3F2FD',              text: '#1565C0' },
  CONFIRMED:        { bg: colors.primarySurface,  text: colors.primary },
  DISPUTED:         { bg: colors.dangerSurface,   text: colors.danger },
};

export const conditionColors = {
  GOOD: { bg: colors.primarySurface, text: colors.primary },
  FAIR: { bg: colors.warningSurface, text: colors.warning },
  POOR: { bg: colors.dangerSurface,  text: colors.danger },
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
