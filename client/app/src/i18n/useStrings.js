import { useContext, useMemo } from 'react';
import { LanguageContext } from './LanguageContext.js';
import strings from './strings.js';

/**
 * useStrings() — returns a t(key, params) translation function bound to the
 * currently active language from LanguageContext.
 *
 * Usage:
 *   const t = useStrings();
 *   <Text>{t('home_title')}</Text>
 *   <Text>{t('requests_pending', { count: requests.length })}</Text>
 *   <Text>{t('accept_will_notify', { name: recycler.name })}</Text>
 *
 * Two features beyond a plain lookup:
 *
 * - Interpolation: `{name}` placeholders in the catalogue string are filled
 *   from `params`.
 * - Pluralisation: when `params.count` is a number, `key` is resolved as
 *   `${key}_one` (count === 1) or `${key}_other` (otherwise) before falling
 *   back to the bare `key`. Catalogue entries that need this ship both
 *   suffixed variants — see strings.js.
 *
 * Falls back to the Marathi string, then the raw key, when a string is
 * missing in the active language.
 *
 * The returned function is memoised on `lang` only. That is not an
 * optimisation: every screen lists `t` in the dependency array of the
 * useCallback it hands to useFocusEffect. A fresh `t` on every render made
 * those effects re-run on every state change, so the screen re-announced its
 * own name after each keypad tap — the "it says प्रमाण again and again" bug.
 * Adding `params` as a call-time argument (not a hook input) keeps `t`'s
 * identity stable across renders — do not add anything else to the
 * useMemo dependency array.
 */
export function useStrings() {
  const { lang } = useContext(LanguageContext);

  return useMemo(() => {
    function lookup(key) {
      const entry = strings[key];
      if (entry === undefined) return undefined;
      if (entry[lang] !== undefined) return entry[lang];
      // Fallback: try Marathi, then signal "not found"
      return entry.mr;
    }

    function interpolate(template, params) {
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) => {
        return params[name] !== undefined ? String(params[name]) : match;
      });
    }

    /**
     * @param {string} key     Semantic string key (e.g. 'home_title')
     * @param {object} [params] Interpolation values; `params.count` also
     *                          selects the `_one`/`_other` plural variant.
     * @returns {string}       Localised, interpolated string
     */
    return function t(key, params) {
      let resolvedKey = key;
      if (params && typeof params.count === 'number') {
        const pluralKey = `${key}_${params.count === 1 ? 'one' : 'other'}`;
        if (strings[pluralKey] !== undefined) {
          resolvedKey = pluralKey;
        }
      }

      const value = lookup(resolvedKey);
      if (value !== undefined) {
        return interpolate(value, params);
      }
      return key;
    };
  }, [lang]);
}
