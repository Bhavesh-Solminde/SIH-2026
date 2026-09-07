import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';

/**
 * LanguageContext — provides { lang, setLang } to the component tree.
 *
 * Default language is Marathi ('mr') per the product spec.
 * Valid values: 'mr' | 'hi' | 'en'
 */

const STORAGE_KEY = 'bhaav.lang';
const VALID_LANGS = ['mr', 'hi', 'en'];

// Loaded lazily via require(), matching the pattern in src/lib/deviceId.js and
// src/lib/recyclerCache.js: AsyncStorage is a native module, so importing it
// statically breaks the plain-node "screens" jest project (no RN runtime).
// Every screen reaches this file through useStrings()/useLanguage(), so it
// has to survive that environment too.
let AsyncStorage = null;
try {
  // The real package's compiled CJS build exports a `.default`; the
  // package's own Jest mock (used by test/i18n/LanguageContext.test.js)
  // exports the storage object directly with no `.default` — fall back to
  // the bare module so both shapes resolve to a working client.
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod?.default ?? mod;
} catch {
  // Not available in this environment — language choice just won't persist.
}

export const LanguageContext = createContext({
  lang: 'mr',
  setLang: () => {},
});

/**
 * LanguageProvider wraps the app (or a subtree) and stores the active
 * language in local component state so that setLang() triggers a re-render.
 *
 * Persistence: the last-chosen language is written to AsyncStorage on every
 * setLang() call and read back once on mount. The initial render always uses
 * `initialLang` synchronously (screens and tests render immediately, with no
 * "loading" gate) — the stored value, if any, is applied a moment later via
 * a normal state update. On a fresh install `initialLang` and the eventual
 * stored value are almost always the same ('mr'), so in practice there is
 * nothing to see; only a returning hi/en collector gets a very brief mr
 * frame before the persisted choice applies, and speak() fires from a
 * useFocusEffect after mount by which point the swap has already happened.
 */
export function LanguageProvider({ children, initialLang = 'mr' }) {
  const [lang, setLangState] = useState(initialLang);
  const hydratedFromStorage = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!AsyncStorage) return undefined;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        hydratedFromStorage.current = true;
        if (VALID_LANGS.includes(stored)) {
          setLangState(stored);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Only ever read the stored value once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((next) => {
    if (!VALID_LANGS.includes(next)) return;
    setLangState(next);
    if (AsyncStorage) {
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Convenience hook: returns the raw { lang, setLang } context value.
 */
export function useLanguage() {
  return useContext(LanguageContext);
}
