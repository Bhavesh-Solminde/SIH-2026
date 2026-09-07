import { CLIPS } from '../../src/audio/clips.js';
import { composeNumber, composeDigits } from '../../src/audio/numbers.js';

const LANGS = ['mr', 'hi', 'en'];

describe('CLIPS — audio clip pack parity', () => {
  it('ships mr, hi and en packs', () => {
    for (const lang of LANGS) {
      expect(CLIPS).toHaveProperty(lang);
    }
  });

  it('every pack has the exact same set of clip names', () => {
    const [first, ...rest] = LANGS.map((lang) => Object.keys(CLIPS[lang]).sort());
    for (const keys of rest) {
      expect(keys).toEqual(first);
    }
  });

  it('every clip name in every pack resolves to a truthy asset reference', () => {
    const missing = [];
    for (const lang of LANGS) {
      for (const [name, asset] of Object.entries(CLIPS[lang])) {
        if (!asset) missing.push(`${lang}.${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has no pack with a clip name absent from the others (asymmetric drift)', () => {
    const allNames = new Set();
    for (const lang of LANGS) Object.keys(CLIPS[lang]).forEach((k) => allNames.add(k));
    const gaps = [];
    for (const lang of LANGS) {
      for (const name of allNames) {
        if (!(name in CLIPS[lang])) gaps.push(`${lang} missing ${name}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  // The real point of parity: composeNumber/composeDigits emit clip names
  // built purely from position (ones/tens/hundreds/thousands), independent
  // of language — so every name either scheme can produce for 0-9999 must
  // exist in every pack, or CLIPS[lang] ?? CLIPS.mr in src/audio/index.js
  // silently plays the wrong language instead of the number the collector
  // just typed.
  describe('every composed clip name resolves in every language pack', () => {
    const samples = [0, 1, 7, 9, 10, 11, 15, 20, 23, 45, 90, 99, 100, 101, 115,
      200, 999, 1000, 1001, 1500, 4999, 9999];

    it('composeNumber output', () => {
      const missing = [];
      for (const n of samples) {
        for (const lang of LANGS) {
          for (const name of composeNumber(n, lang)) {
            if (!(name in CLIPS[lang])) missing.push(`${lang}: composeNumber(${n}) -> ${name}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it('composeDigits output', () => {
      const missing = [];
      for (const n of samples) {
        for (const lang of LANGS) {
          for (const name of composeDigits(n, lang)) {
            if (!(name in CLIPS[lang])) missing.push(`${lang}: composeDigits(${n}) -> ${name}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  });
});
