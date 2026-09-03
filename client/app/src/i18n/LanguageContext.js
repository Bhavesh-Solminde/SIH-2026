import React, { createContext, useState, useContext } from 'react';

/**
 * LanguageContext — provides { lang, setLang } to the component tree.
 *
 * Default language is Marathi ('mr') per the product spec.
 * Valid values: 'mr' | 'hi'
 */

export const LanguageContext = createContext({
  lang: 'mr',
  setLang: () => {},
});

/**
 * LanguageProvider wraps the app (or a subtree) and stores the active
 * language in local component state so that setLang() triggers a re-render.
 */
export function LanguageProvider({ children, initialLang = 'mr' }) {
  const [lang, setLang] = useState(initialLang);
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
