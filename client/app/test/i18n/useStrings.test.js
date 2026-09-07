import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { LanguageProvider, useLanguage } from '../../src/i18n/LanguageContext.js';
import { useStrings } from '../../src/i18n/useStrings.js';

// Helper component that renders t(key) output as text
function StringReader({ keyName }) {
  const t = useStrings();
  return <Text testID="output">{t(keyName)}</Text>;
}

describe('useStrings / t(key)', () => {
  describe('Marathi (mr) — default language', () => {
    it('returns the Marathi home_title', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <StringReader keyName="home_title" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('भाव संग्राहक');
    });

    it('returns the Marathi ok string', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <StringReader keyName="ok" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('ठीक आहे');
    });

    it('returns Marathi category_pcb', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <StringReader keyName="category_pcb" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('पीसीबी');
    });
  });

  describe('Hindi (hi)', () => {
    it('returns the Hindi ok string', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="hi">
          <StringReader keyName="ok" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('ठीक है');
    });

    it('returns Hindi home_new_lot', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="hi">
          <StringReader keyName="home_new_lot" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('नई प्रविष्टि');
    });

    it('returns Hindi category_battery', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="hi">
          <StringReader keyName="category_battery" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('बैटरी');
    });
  });

  // Screens list `t` in the dependency array of the useCallback they hand to
  // useFocusEffect. A `t` with a fresh identity on every render made those
  // effects re-run on every state change, so a screen re-announced its own
  // name over TTS after every keypad tap — the reported "it says प्रमाण
  // again and again". The identity is the contract; this guards it.
  describe('referential stability', () => {
    function IdentityProbe({ onRender }) {
      const t = useStrings();
      const { setLang } = useLanguage();
      const [count, setCount] = useState(0);
      onRender(t);
      return (
        <>
          <TouchableOpacity testID="bump" onPress={() => setCount((c) => c + 1)}>
            <Text testID="output">{t('ok')}{count}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="to-hindi" onPress={() => setLang('hi')}>
            <Text>switch</Text>
          </TouchableOpacity>
        </>
      );
    }

    it('returns the same t across re-renders that do not change the language', () => {
      const seen = [];
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <IdentityProbe onRender={(t) => seen.push(t)} />
        </LanguageProvider>
      );

      fireEvent.press(getByTestId('bump'));
      fireEvent.press(getByTestId('bump'));

      expect(seen.length).toBeGreaterThan(1);
      expect(new Set(seen).size).toBe(1);
    });

    it('still returns a new t when the language changes, so consumers re-run', () => {
      const seen = [];
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <IdentityProbe onRender={(t) => seen.push(t)} />
        </LanguageProvider>
      );

      // LanguageProvider seeds its state from initialLang once, so switching
      // has to go through setLang — re-rendering with a different prop does
      // not change the active language.
      fireEvent.press(getByTestId('to-hindi'));

      const distinct = [...new Set(seen)];
      expect(distinct).toHaveLength(2);
      const [mr, hi] = distinct;
      expect(mr('ok')).toBe('ठीक आहे');
      expect(hi('ok')).toBe('ठीक है');
    });
  });

  describe('interpolation and plurals', () => {
    function ParamReader({ keyName, params }) {
      const t = useStrings();
      return <Text testID="output">{t(keyName, params)}</Text>;
    }

    it('fills a {count} placeholder', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="en">
          <ParamReader keyName="home_sync_pending" params={{ count: 3 }} />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('3 pending');
    });

    it('selects the _one variant when count is 1', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="en">
          <ParamReader keyName="requests_pending" params={{ count: 1 }} />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('1 request pending');
    });

    it('selects the _other variant when count is not 1', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="en">
          <ParamReader keyName="requests_pending" params={{ count: 5 }} />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('5 requests pending');
    });

    it('selects the _other variant when count is 0', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <ParamReader keyName="requests_pending" params={{ count: 0 }} />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('0 विनंत्या प्रलंबित');
    });
  });

  describe('fallback behaviour', () => {
    it('returns the key itself for an unknown key', () => {
      const { getByTestId } = render(
        <LanguageProvider initialLang="mr">
          <StringReader keyName="nonexistent_key_xyz" />
        </LanguageProvider>
      );
      expect(getByTestId('output').props.children).toBe('nonexistent_key_xyz');
    });
  });
});
