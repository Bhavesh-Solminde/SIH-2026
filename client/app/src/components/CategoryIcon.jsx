import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * CategoryIcon — View-based icon for each of the 8 e-waste categories.
 *
 * Uses only View + StyleSheet (rectangles, circles, composed shapes) so
 * it works without a native SVG build. Each icon is visually distinct
 * through shape composition and a unique accent color.
 *
 * Props:
 *   categoryId  {string}  One of the CATEGORY_CODES from @bhaav/core/constants
 *   size        {number}  Bounding box size in dp (default: 48)
 *   color       {string}  Override the icon's accent color
 */
export function CategoryIcon({ categoryId, size = 48, color }) {
  const iconFn = ICONS[categoryId] || ICONS.OTHER;
  return iconFn({ size, color });
}

// ---------------------------------------------------------------------------
// Individual icon renderers
// Each receives { size, color } and returns a <View> element.
// ---------------------------------------------------------------------------

// CABLE — two horizontal bars connected by thin vertical lines (wires)
function CableIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#795548'; // brown
  const s = size;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-CABLE">
      {/* Top wire */}
      <View style={[styles.cableBar, { backgroundColor: accent, width: s * 0.8, height: s * 0.12, top: s * 0.25, left: s * 0.1 }]} />
      {/* Bottom wire */}
      <View style={[styles.cableBar, { backgroundColor: accent, width: s * 0.8, height: s * 0.12, top: s * 0.63, left: s * 0.1 }]} />
      {/* Connector left */}
      <View style={[styles.cableBar, { backgroundColor: accent, width: s * 0.12, height: s * 0.5, top: s * 0.25, left: s * 0.1, borderRadius: s * 0.04 }]} />
      {/* Connector right */}
      <View style={[styles.cableBar, { backgroundColor: accent, width: s * 0.12, height: s * 0.5, top: s * 0.25, left: s * 0.78, borderRadius: s * 0.04 }]} />
    </View>
  );
}

// PCB — grid of small squares on a green rectangle
function PcbIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#388E3C'; // PCB green
  const s = size;
  const dotSize = s * 0.12;
  const dots = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      dots.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize * 0.2,
            backgroundColor: '#A5D6A7',
            top:  s * 0.18 + r * (s * 0.25),
            left: s * 0.15 + c * (s * 0.25),
          }}
        />
      );
    }
  }
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-PCB">
      <View style={{ position: 'absolute', width: s * 0.85, height: s * 0.85, top: s * 0.075, left: s * 0.075, backgroundColor: accent, borderRadius: s * 0.08 }} />
      {dots}
    </View>
  );
}

// PANEL — large rectangle with a smaller inner rectangle (screen frame)
function PanelIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#1565C0'; // dark blue
  const s = size;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-PANEL">
      {/* Outer frame */}
      <View style={{ position: 'absolute', width: s * 0.9, height: s * 0.75, top: s * 0.08, left: s * 0.05, backgroundColor: accent, borderRadius: s * 0.06 }} />
      {/* Inner screen area */}
      <View style={{ position: 'absolute', width: s * 0.72, height: s * 0.54, top: s * 0.17, left: s * 0.14, backgroundColor: '#90CAF9', borderRadius: s * 0.04 }} />
      {/* Stand */}
      <View style={{ position: 'absolute', width: s * 0.18, height: s * 0.14, top: s * 0.83, left: s * 0.41, backgroundColor: accent, borderRadius: s * 0.02 }} />
    </View>
  );
}

// CRT — rounded-front boxy shape (deep body) with a trapezoidal screen
function CrtIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#37474F'; // blue-grey
  const s = size;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-CRT">
      {/* Main body — tall and wide */}
      <View style={{ position: 'absolute', width: s * 0.9, height: s * 0.82, top: s * 0.05, left: s * 0.05, backgroundColor: accent, borderRadius: s * 0.1 }} />
      {/* Screen — centered circle-ish */}
      <View style={{ position: 'absolute', width: s * 0.6, height: s * 0.52, top: s * 0.17, left: s * 0.2, backgroundColor: '#B0BEC5', borderRadius: s * 0.08 }} />
      {/* Knob dot bottom-right */}
      <View style={{ position: 'absolute', width: s * 0.09, height: s * 0.09, top: s * 0.74, left: s * 0.78, backgroundColor: '#78909C', borderRadius: s * 0.045 }} />
    </View>
  );
}

// BATTERY — rectangle body with a terminal nub on top
function BatteryIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#F57F17'; // amber
  const s = size;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-BATTERY">
      {/* Body */}
      <View style={{ position: 'absolute', width: s * 0.72, height: s * 0.82, top: s * 0.12, left: s * 0.14, backgroundColor: accent, borderRadius: s * 0.08 }} />
      {/* Terminal nub */}
      <View style={{ position: 'absolute', width: s * 0.22, height: s * 0.1, top: s * 0.04, left: s * 0.39, backgroundColor: accent, borderRadius: s * 0.04 }} />
      {/* Charge lines */}
      <View style={{ position: 'absolute', width: s * 0.45, height: s * 0.1, top: s * 0.36, left: s * 0.275, backgroundColor: '#FFF9C4', borderRadius: s * 0.02 }} />
      <View style={{ position: 'absolute', width: s * 0.45, height: s * 0.1, top: s * 0.54, left: s * 0.275, backgroundColor: '#FFF9C4', borderRadius: s * 0.02 }} />
    </View>
  );
}

// MOTOR — circle with inner concentric ring (winding coil)
function MotorIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#6A1B9A'; // deep purple
  const s = size;
  const half = s / 2;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-MOTOR">
      {/* Outer housing */}
      <View style={{ position: 'absolute', width: s * 0.88, height: s * 0.88, top: s * 0.06, left: s * 0.06, backgroundColor: accent, borderRadius: half * 0.88 }} />
      {/* Inner ring */}
      <View style={{ position: 'absolute', width: s * 0.58, height: s * 0.58, top: s * 0.21, left: s * 0.21, backgroundColor: '#CE93D8', borderRadius: half * 0.58 }} />
      {/* Core */}
      <View style={{ position: 'absolute', width: s * 0.26, height: s * 0.26, top: s * 0.37, left: s * 0.37, backgroundColor: accent, borderRadius: half * 0.26 }} />
      {/* Shaft — thin horizontal line protruding right */}
      <View style={{ position: 'absolute', width: s * 0.18, height: s * 0.07, top: s * 0.465, left: s * 0.82, backgroundColor: '#9C4DCC', borderRadius: s * 0.02 }} />
    </View>
  );
}

// PLASTIC — a simple rounded rectangle (generic plastic item / bag shape)
function PlasticIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#0277BD'; // light blue
  const s = size;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-PLASTIC">
      {/* Outer container */}
      <View style={{ position: 'absolute', width: s * 0.8, height: s * 0.72, top: s * 0.18, left: s * 0.1, backgroundColor: accent, borderRadius: s * 0.14 }} />
      {/* Handle top-left */}
      <View style={{ position: 'absolute', width: s * 0.2, height: s * 0.16, top: s * 0.06, left: s * 0.22, backgroundColor: accent, borderRadius: s * 0.06 }} />
      {/* Handle top-right */}
      <View style={{ position: 'absolute', width: s * 0.2, height: s * 0.16, top: s * 0.06, left: s * 0.58, backgroundColor: accent, borderRadius: s * 0.06 }} />
      {/* Recycle symbol stub — horizontal stripe */}
      <View style={{ position: 'absolute', width: s * 0.45, height: s * 0.09, top: s * 0.5, left: s * 0.275, backgroundColor: '#B3E5FC', borderRadius: s * 0.02 }} />
    </View>
  );
}

// OTHER — question mark circle
function OtherIcon({ size, color: colorOverride }) {
  const accent = colorOverride || '#9E9E9E'; // grey
  const s = size;
  const half = s / 2;
  return (
    <View style={[styles.wrapper, { width: s, height: s }]} testID="icon-OTHER">
      {/* Circle */}
      <View style={{ position: 'absolute', width: s * 0.9, height: s * 0.9, top: s * 0.05, left: s * 0.05, backgroundColor: accent, borderRadius: half }} />
      {/* Q-mark top arc (two overlapping rects) */}
      <View style={{ position: 'absolute', width: s * 0.28, height: s * 0.28, top: s * 0.22, left: s * 0.36, backgroundColor: '#F5F5F5', borderRadius: s * 0.12 }} />
      <View style={{ position: 'absolute', width: s * 0.14, height: s * 0.22, top: s * 0.36, left: s * 0.43, backgroundColor: '#F5F5F5', borderRadius: s * 0.04 }} />
      {/* Dot */}
      <View style={{ position: 'absolute', width: s * 0.12, height: s * 0.12, top: s * 0.62, left: s * 0.44, backgroundColor: '#F5F5F5', borderRadius: s * 0.06 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Icon map — keyed by CATEGORY_CODE
// ---------------------------------------------------------------------------
const ICONS = {
  CABLE:   (props) => <CableIcon   {...props} />,
  PCB:     (props) => <PcbIcon     {...props} />,
  PANEL:   (props) => <PanelIcon   {...props} />,
  CRT:     (props) => <CrtIcon     {...props} />,
  BATTERY: (props) => <BatteryIcon {...props} />,
  MOTOR:   (props) => <MotorIcon   {...props} />,
  PLASTIC: (props) => <PlasticIcon {...props} />,
  OTHER:   (props) => <OtherIcon   {...props} />,
};

export const CATEGORY_IDS = Object.keys(ICONS);

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  cableBar: {
    position: 'absolute',
  },
});
