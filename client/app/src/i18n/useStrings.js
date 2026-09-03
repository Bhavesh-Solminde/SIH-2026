import { useContext } from 'react';
import { LanguageContext } from './LanguageContext.js';
import strings from './strings.js';

/**
 * useStrings() — returns a t(key) translation function bound to the
 * currently active language from LanguageContext.
 *
 * Usage:
 *   const t = useStrings();
 *   <Text>{t('home_title')}</Text>
 *
 * Falls back to the Marathi string, then the raw key, when a string is
 * missing in the active language.
 */
export function useStrings() {
  const { lang } = useContext(LanguageContext);

  /**
   * @param {string} key  Semantic string key (e.g. 'home_title')
   * @returns {string}    Localised string
   */
  function t(key) {
    const langStrings = strings[lang] || strings['mr'];
    if (langStrings[key] !== undefined) {
      return langStrings[key];
    }
    // Fallback: try Marathi, then return the key itself
    if (strings['mr'][key] !== undefined) {
      return strings['mr'][key];
    }
    return key;
  }

  return t;
}
