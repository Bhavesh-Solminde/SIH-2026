import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../ui/Text.jsx';
import { colors } from '../ui/tokens.js';

/**
 * RecyclerAuthBadge — per-row authorisation evidence.
 *
 * A plain "✓ authorised" tick on a row that is already filtered to
 * `VALID` is decorative, not evidence. What a collector (or a judge) can
 * actually check is the MPCB registration number this authorisation rests
 * on, and the date it runs out — both come straight through from
 * GET /public/rates (`registrationNo`, `validityTo`), never invented here.
 *
 * Degrades gracefully: if either field is missing (older cached data,
 * a recycler record without them yet), falls back to the plain tick
 * rather than rendering a broken or misleading badge.
 */
export function RecyclerAuthBadge({ registrationNo, validityTo }) {
  if (!registrationNo || !validityTo) {
    return (
      <Text variant="sm" style={styles.chip} testID="auth-badge-fallback">
        ✓ अधिकृत
      </Text>
    );
  }

  const validDate = String(validityTo).slice(0, 10);

  return (
    <Text variant="sm" style={styles.chip} testID="auth-badge">
      ✓ MPCB #{registrationNo} · वैध पर्यंत {validDate}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: { color: colors.primary, fontWeight: '600', fontSize: 12 },
});
