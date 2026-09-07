import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguageProvider, useLanguage } from '../../src/i18n/LanguageContext.js';

const STORAGE_KEY = 'bhaav.lang';

function Probe() {
  const { lang, setLang } = useLanguage();
  return (
    <>
      <Text testID="lang">{lang}</Text>
      <TouchableOpacity testID="to-en" onPress={() => setLang('en')}>
        <Text>switch</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="to-bogus" onPress={() => setLang('xx')}>
        <Text>switch</Text>
      </TouchableOpacity>
    </>
  );
}

describe('LanguageProvider — persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders initialLang synchronously, before any storage read resolves', () => {
    const { getByTestId } = render(
      <LanguageProvider initialLang="mr">
        <Probe />
      </LanguageProvider>
    );
    expect(getByTestId('lang').props.children).toBe('mr');
  });

  it('persists a language change to AsyncStorage', async () => {
    const { getByTestId } = render(
      <LanguageProvider initialLang="mr">
        <Probe />
      </LanguageProvider>
    );

    fireEvent.press(getByTestId('to-en'));
    expect(getByTestId('lang').props.children).toBe('en');

    await waitFor(async () => {
      expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('en');
    });
  });

  it('ignores an invalid language passed to setLang', () => {
    const { getByTestId } = render(
      <LanguageProvider initialLang="mr">
        <Probe />
      </LanguageProvider>
    );

    fireEvent.press(getByTestId('to-bogus'));
    expect(getByTestId('lang').props.children).toBe('mr');
  });

  it('adopts a previously-stored language shortly after mount', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'hi');

    const { getByTestId } = render(
      <LanguageProvider initialLang="mr">
        <Probe />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(getByTestId('lang').props.children).toBe('hi');
    });
  });

  it('ignores a corrupted stored value and keeps initialLang', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'not-a-real-lang');

    const { getByTestId } = render(
      <LanguageProvider initialLang="mr">
        <Probe />
      </LanguageProvider>
    );

    // Give the async read a chance to resolve and confirm it did NOT apply.
    await act(async () => { await Promise.resolve(); });
    expect(getByTestId('lang').props.children).toBe('mr');
  });
});
