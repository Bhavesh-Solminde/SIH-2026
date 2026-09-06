import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../ui/Text.jsx';
import { colors, spacing } from '../ui/tokens.js';

/**
 * AuthorisationPanel — the filtering, made visible.
 *
 * Every recycler on ValueScreen is already `authorizationStatus: VALID`, so a
 * tick on each row carries zero information. What is demonstrable is the
 * filtering itself: how many facilities the MPCB list carries, and how many
 * the app refuses to route a collector to. All numbers here come from the
 * `authorisation` prop (GET /public/authorisation) — never hardcoded.
 *
 * Honesty rule (README.md ground rule 1): `LAPSED_IN_LIST` is not the same as
 * unlawful. It means the published MPCB record shows an expired validity
 * date — many such businesses will have renewed without MPCB republishing
 * the list. This copy must never say or imply "illegal", "unauthorised
 * operator" or "banned" — only that a lapsed listing is hidden from the app.
 *
 * Renders nothing when there is no data yet (first load, or the fetch
 * failed and nothing was ever cached) — never an error state, and never
 * anything that would block or hide the recycler list above/below it.
 */
export function AuthorisationPanel({ authorisation }) {
  if (!authorisation || !authorisation.listed) return null;

  const { listed, valid, lapsed, hiddenFromApp } = authorisation;
  const fetchedOn = authorisation.source?.fetchedOn ?? null;

  return (
    <View style={styles.container} testID="authorisation-panel">
      <Text variant="sm" style={styles.headline}>
        MPCB यादीतील {listed} पैकी {valid} पुनर्वापरकर्ते सध्या अधिकृत आहेत —{' '}
        {lapsed ?? hiddenFromApp} ची यादीतील मुदत संपली असून ते वगळले आहेत.
      </Text>
      {fetchedOn && (
        <Text variant="sm" style={styles.provenance}>
          स्रोत: MPCB · यादी शेवटची अद्ययावत: {fetchedOn}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.primarySurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headline: { color: colors.primary, fontWeight: '700' },
  provenance: { color: colors.textSecondary, marginTop: spacing[1] },
});
