// https://docs.expo.dev/guides/using-eslint/
//
// The `npm run lint` script (see package.json) only points this at
// src/screens, src/components and App.js — not the whole repo. Two reasons:
//
// 1. src/db/generated and src/db/generated-node are the Prisma client
//    output (see docs/superpowers/plans/2026-09-01-02-collector-app.md,
//    "Add the generated output to lint/format ignore") — generated code
//    should never be linted, and it alone accounts for the vast majority of
//    findings if this config is ever pointed at the full tree.
// 2. This config's purpose is a translation regression gate: catching a
//    hardcoded JSX text literal in a screen or component before it ships
//    untranslated. It is not (yet) a repo-wide lint adoption — the test/
//    tree has its own pre-existing style debt (missing jest globals, etc.)
//    that is a separate, unscoped cleanup and shouldn't block this gate.
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*', 'src/db/generated/**', 'src/db/generated-node/**'],
  // The 'expo' preset's env doesn't include these timer/fetch globals, so
  // linting src/screens for the first time surfaced pre-existing no-undef
  // noise unrelated to this rule — declaring them here is a config fix, not
  // a code change.
  globals: {
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    AbortSignal: 'readonly',
  },
  overrides: [
    {
      files: ['src/screens/**/*.jsx', 'src/components/**/*.jsx'],
      rules: {
        // The gate itself: a bare JSX text literal in a screen or component
        // is exactly the shape of the bug this whole i18n pass fixed (137
        // hardcoded Marathi strings the language switcher couldn't reach).
        // Punctuation/symbols that appear alongside t()-resolved text are
        // allowed through rather than forcing them into the catalogue too.
        'react/jsx-no-literals': ['error', {
          allowedStrings: ['₹', '·', '→', '–', '—', '/', '×', ':', '%', '…', '(', ')'],
          ignoreProps: true,
        }],
      },
    },
  ],
};
