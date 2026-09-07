import fs from 'fs';
import path from 'path';

/**
 * Regression gate: every screen and component must resolve its Marathi/Hindi
 * text through the i18n catalogue (src/i18n/strings.js), never a hardcoded
 * literal. Before this test existed, the app shipped with roughly a third of
 * its UI text unreachable by the language switcher — a screen's copy stayed
 * in Marathi no matter what the collector chose in the header.
 *
 * The check: scan every source file's CODE (not its comments — a comment
 * explaining a past bug in Marathi, e.g. useStrings.js's own doc comment
 * about "प्रमाण again and again", is not user-facing text) for a Devanagari
 * codepoint. src/i18n/ itself is exempt (it IS the catalogue), and
 * LanguageSwitcher.jsx's pill labels ('म', 'हि') are exempt — those are
 * language endonyms, not translatable strings.
 */

const APP_ROOT = path.resolve(__dirname, '../..');
const DEVANAGARI = /[ऀ-ॿ]/;

const EXEMPT_FILES = new Set([
  path.join(APP_ROOT, 'src/components/LanguageSwitcher.jsx'),
]);

const EXEMPT_DIRS = [
  path.join(APP_ROOT, 'src/i18n'),
];

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated' || entry.name === 'generated-node') continue;
      listSourceFiles(full, out);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Strips // and /* */ comments (including JSDoc) before scanning. Deliberately
// simple — not a full JS parser — but sufficient for finding literal
// Devanagari runs a comment stripper would otherwise hide, and safe here
// because false negatives (missing a real violation inside something that
// looks like a comment but isn't) are far less likely in this codebase's
// style than false positives from doc comments about past bugs.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function collectViolations(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const codeOnly = stripComments(source);
  const violations = [];
  codeOnly.split('\n').forEach((line, i) => {
    if (DEVANAGARI.test(line)) {
      violations.push({ line: i + 1, text: line.trim() });
    }
  });
  return violations;
}

describe('no hardcoded Devanagari strings outside the i18n catalogue', () => {
  const files = [
    path.join(APP_ROOT, 'App.js'),
    ...listSourceFiles(path.join(APP_ROOT, 'src')),
  ].filter((f) => {
    if (EXEMPT_FILES.has(f)) return false;
    return !EXEMPT_DIRS.some((dir) => f.startsWith(dir + path.sep));
  });

  it('scanned more than a handful of files (sanity check on the scan itself)', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files.map((f) => [path.relative(APP_ROOT, f), f]))(
    '%s has no hardcoded Devanagari text',
    (_label, filePath) => {
      const violations = collectViolations(filePath);
      if (violations.length > 0) {
        const detail = violations.map((v) => `  line ${v.line}: ${v.text}`).join('\n');
        throw new Error(
          `Hardcoded Devanagari text found outside src/i18n/. Move it into ` +
          `src/i18n/strings.js and resolve it with t(key) instead:\n${detail}`
        );
      }
      expect(violations).toEqual([]);
    }
  );
});
