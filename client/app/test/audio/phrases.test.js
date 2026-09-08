import { PHRASE_CLIPS, PHRASE_CLIP_NAMES, resolvePhraseClips } from '../../src/audio/phrases.js';

const LANGS = ['mr', 'hi', 'en'];

describe('PHRASE_CLIPS — phrase pack parity', () => {
  it('ships mr, hi and en packs', () => {
    for (const lang of LANGS) expect(PHRASE_CLIPS).toHaveProperty(lang);
  });

  it('every pack has the exact same set of clip names', () => {
    const [first, ...rest] = LANGS.map((lang) => Object.keys(PHRASE_CLIPS[lang]).sort());
    for (const keys of rest) expect(keys).toEqual(first);
  });

  it('PHRASE_CLIP_NAMES matches the keys actually shipped', () => {
    expect([...PHRASE_CLIP_NAMES].sort()).toEqual(Object.keys(PHRASE_CLIPS.mr).sort());
  });

  it('every clip name in every pack resolves to a truthy asset reference', () => {
    const missing = [];
    for (const lang of LANGS) {
      for (const [name, asset] of Object.entries(PHRASE_CLIPS[lang])) {
        if (!asset) missing.push(`${lang}.${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('resolvePhraseClips', () => {
  it('returns the key itself for a recorded key with no params', () => {
    expect(resolvePhraseClips('category_label', undefined, 'mr')).toEqual(['category_label']);
  });

  it('returns null for a key with no recording, so the caller can fall back to TTS', () => {
    expect(resolvePhraseClips('nav_home', undefined, 'mr')).toBeNull();
  });

  it('selects the _one plural variant when count is 1', () => {
    expect(resolvePhraseClips('requests_pending', { count: 1 }, 'mr'))
      .toEqual(['one', 'requests_pending_one']);
  });

  it('selects the _other plural variant for any other count', () => {
    expect(resolvePhraseClips('requests_pending', { count: 3 }, 'mr'))
      .toEqual(['three', 'requests_pending_other']);
  });

  it('speaks a multi-digit count digit by digit before the phrase', () => {
    expect(resolvePhraseClips('requests_pending', { count: 12 }, 'hi'))
      .toEqual(['one', 'two', 'requests_pending_other']);
  });

  it('speaks zero as a digit rather than dropping it', () => {
    expect(resolvePhraseClips('requests_pending', { count: 0 }, 'en'))
      .toEqual(['zero', 'requests_pending_other']);
  });

  it('ignores a non-numeric count instead of emitting junk clip names', () => {
    expect(resolvePhraseClips('voice_accepted', { count: 'many' }, 'mr'))
      .toEqual(['voice_accepted']);
  });

  it('resolves against the mr pack for an unknown language rather than throwing', () => {
    expect(resolvePhraseClips('category_label', undefined, 'ta')).toEqual(['category_label']);
  });
});
