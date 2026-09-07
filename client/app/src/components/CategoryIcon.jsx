import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * CategoryIcon — the pictogram for each of the 8 e-waste categories.
 *
 * These were previously drawn by hand out of positioned <View> rectangles.
 * That produced shapes nobody could name without reading the label under
 * them: CABLE was a plain brown rectangle, PLASTIC and BATTERY were both
 * rounded blocks with two pale stripes, and OTHER's hand-built question mark
 * rendered as a fat exclamation point — so the "I'm not sure" tile read as a
 * warning. On a screen whose entire premise is that a collector who cannot
 * read the label still picks the right tile, that is the icon failing at its
 * only job.
 *
 * Each category is now a real material glyph from MaterialCommunityIcons —
 * a plug, a chip, a flat screen, a boxy CRT, a battery, a fan, a bottle —
 * drawn from the same icon family the rest of the app already ships, so
 * there is no new dependency and nothing to keep in sync by hand.
 *
 * Colour still carries a second, redundant channel of meaning: the same
 * category is always the same hue, so the grid stays learnable by position
 * and colour even before the shape is read.
 *
 * Props:
 *   categoryId  {string}  One of the CATEGORY_CODES from @bhaav/core/constants
 *   size        {number}  Bounding box size in dp (default: 48)
 *   color       {string}  Override the icon's accent color
 */

// glyph + accent, one row per category. Accents are unchanged from the
// hand-drawn set so nothing a collector already recognises shifts hue.
const ICONS = {
  CABLE:   { glyph: 'power-plug',              accent: '#795548' }, // brown
  PCB:     { glyph: 'chip',                    accent: '#2E7D32' }, // board green
  PANEL:   { glyph: 'monitor',                 accent: '#1565C0' }, // dark blue
  CRT:     { glyph: 'television-classic',      accent: '#37474F' }, // blue-grey
  BATTERY: { glyph: 'battery',                 accent: '#EF6C00' }, // amber
  MOTOR:   { glyph: 'fan',                     accent: '#6A1B9A' }, // deep purple
  PLASTIC: { glyph: 'bottle-soda-classic',     accent: '#0277BD' }, // light blue
  OTHER:   { glyph: 'dots-horizontal-circle',  accent: '#616161' }, // grey
};

export function CategoryIcon({ categoryId, size = 48, color }) {
  const spec = ICONS[categoryId] ?? ICONS.OTHER;
  const id = ICONS[categoryId] ? categoryId : 'OTHER';

  return (
    <View style={[styles.wrapper, { width: size, height: size }]} testID={`icon-${id}`}>
      <MaterialCommunityIcons
        name={spec.glyph}
        size={size}
        color={color || spec.accent}
      />
    </View>
  );
}

export const CATEGORY_IDS = Object.keys(ICONS);

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
