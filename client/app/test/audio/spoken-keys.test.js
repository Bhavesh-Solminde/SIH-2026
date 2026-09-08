import fs from 'fs';
import path from 'path';
import { PHRASE_CLIP_NAMES } from '../../src/audio/phrases.js';
import strings from '../../src/i18n/strings.js';

/**
 * Regression gate for "spoken headings only work in English".
 *
 * Two rules, both of which the app violated before the phrase pack existed:
 *
 * 1. No screen hands a resolved translation to speak(). That form always
 *    routes to expo-speech, which is silent on any handset with no voice
 *    installed for the active language — which is most handsets for mr-IN and
 *    many for hi-IN. Screens announce themselves with speakKey('…') instead.
 * 2. Every key passed to speakKey() has a recording in all three packs.
 *    A key with no clip silently falls back to TTS, which reintroduces the
 *    exact bug for that one string.
 */

const SRC_ROOT = path.resolve(__dirname, '../../src');

// useVoice.js IMPLEMENTS the TTS fallback — `speak(t(key, params))` is the
// one legitimate occurrence in the codebase. Exempted by name rather than by
// narrowing the scan, so the gate still covers every other file under src/.
const EXEMPT_FILES = new Set(['hooks/useVoice.js']);

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Scan CODE, not comments — same approach and same rationale as
// test/i18n/no-hardcoded-strings.test.js, which strips comments for exactly
// this reason. Both rules below concern real call sites, and a doc comment
// that explains the rule by quoting the form it describes is not a violation.
// clips.js's own comment ("e.g. speakKey('requests_pending', { count: 3 })")
// is the case that proved this necessary.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SOURCES = listSourceFiles(SRC_ROOT).map((file) => ({
  file: path.relative(SRC_ROOT, file),
  code: stripComments(fs.readFileSync(file, 'utf8')),
}));

describe('spoken i18n keys', () => {
  it('finds source files to scan', () => {
    expect(SOURCES.length).toBeGreaterThan(20);
  });

  it('no source file speaks a translated string through raw TTS', () => {
    const offenders = [];
    for (const { file, code } of SOURCES) {
      if (EXEMPT_FILES.has(file)) continue;
      if (/\bspeak\s*\(\s*t\s*\(/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('every speakKey() call site names a real i18n key', () => {
    const unknown = [];
    for (const { file, code } of SOURCES) {
      for (const [, key] of code.matchAll(/speakKey\(\s*'([A-Za-z0-9_]+)'/g)) {
        const known = key in strings
          || `${key}_one` in strings
          || `${key}_other` in strings;
        if (!known) unknown.push(`${file}: ${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every speakKey() call site has a bundled recording', () => {
    const recorded = new Set(PHRASE_CLIP_NAMES);
    const unrecorded = [];
    for (const { file, code } of SOURCES) {
      for (const [, key] of code.matchAll(/speakKey\(\s*'([A-Za-z0-9_]+)'/g)) {
        const covered = recorded.has(key)
          || (recorded.has(`${key}_one`) && recorded.has(`${key}_other`));
        if (!covered) unrecorded.push(`${file}: ${key}`);
      }
    }
    expect(unrecorded).toEqual([]);
  });

  it('finds the expected number of spoken call sites (guards a silent deletion)', () => {
    const total = SOURCES.reduce(
      (n, { code }) => n + [...code.matchAll(/speakKey\(\s*'/g)].length,
      0,
    );
    expect(total).toBe(26);
  });
});
