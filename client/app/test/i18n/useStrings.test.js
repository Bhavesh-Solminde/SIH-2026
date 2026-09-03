import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { LanguageProvider } from '../../src/i18n/LanguageContext.js';
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
