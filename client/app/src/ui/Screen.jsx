import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from './tokens.js';

/**
 * Screen — root layout wrapper for every screen in the app.
 *
 * Applies SafeAreaView so content avoids notches / home indicators,
 * sets the StatusBar style, and provides a standard background.
 *
 * Props:
 *   children       {ReactNode}          Screen content
 *   statusBarStyle {'dark'|'light'|'auto'}  (default: 'dark')
 *   style          {StyleProp<ViewStyle>}    Extra styles for the inner container
 */
export function Screen({ children, statusBarStyle = 'dark', style }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={statusBarStyle} />
      <View style={[styles.container, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.background,
  },
  container: {
    flex:    1,
    padding: spacing[4],
  },
});
