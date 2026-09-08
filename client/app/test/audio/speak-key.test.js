import { voiceRouteFor } from '../../src/audio/phrases.js';
import { CLIPS } from '../../src/audio/clips.js';

/**
 * speakKey() routes each spoken i18n key to one of two voices: the bundled
 * clip pack (guaranteed audible in mr/hi/en) or expo-speech (audible only on
 * a handset that has a voice for the active language). Every key the app
 * actually speaks must take the clip route — the TTS route is the reason
 * headings were English-only. These tests pin the routing decision.
 */

describe('voiceRouteFor', () => {
  it('routes a recorded key to the clip pack', () => {
    expect(voiceRouteFor('category_label', undefined, 'mr'))
      .toEqual({ kind: 'clips', names: ['category_label'] });
  });

  it('routes a recorded plural key to clips with the count spoken first', () => {
    expect(voiceRouteFor('requests_pending', { count: 4 }, 'hi'))
      .toEqual({ kind: 'clips', names: ['four', 'requests_pending_other'] });
  });

  it('routes an unrecorded key to TTS so new strings still speak somehow', () => {
    expect(voiceRouteFor('nav_home', undefined, 'mr')).toEqual({ kind: 'tts' });
  });

  it('routes the same recorded key to clips in every language', () => {
    for (const lang of ['mr', 'hi', 'en']) {
      expect(voiceRouteFor('voice_error_generic', undefined, lang).kind).toBe('clips');
    }
  });
});

describe('CLIPS carries the phrase pack', () => {
  // voiceRouteFor names clips; playClips() then looks those names up in
  // CLIPS[lang]. If the merge in clips.js regressed to `{ mr, hi, en }`, every
  // route above would still pass while the app played nothing at all.
  it('resolves every routed clip name through CLIPS in every language', () => {
    const unresolvable = [];
    for (const lang of ['mr', 'hi', 'en']) {
      const route = voiceRouteFor('requests_pending', { count: 4 }, lang);
      for (const name of route.names) {
        if (!CLIPS[lang][name]) unresolvable.push(`${lang}.${name}`);
      }
    }
    expect(unresolvable).toEqual([]);
  });

  it('holds 55 clips per language — 34 words plus 21 phrases', () => {
    for (const lang of ['mr', 'hi', 'en']) {
      expect(Object.keys(CLIPS[lang])).toHaveLength(55);
    }
  });
});
