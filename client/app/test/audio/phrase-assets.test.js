import fs from 'fs';
import path from 'path';

/**
 * The phrase pack is the fix for "spoken headings only work in English":
 * screen names and status phrases used to go through expo-speech, which is
 * silent on any handset without an mr-IN/hi-IN voice pack installed. They now
 * play bundled recordings instead. This test guards the assets themselves —
 * a missing .m4a makes Metro's require() throw at bundle time, which is a far
 * worse failure than the silence it replaced.
 */

const AUDIO_ROOT = path.resolve(__dirname, '../../assets/audio');
const LANGS = ['mr', 'hi', 'en'];

// Duplicated here on purpose: this test runs before src/audio/phrases.js
// exists, and it is the list the generation script must have produced.
// test/audio/phrases.test.js cross-checks it against the shipped module.
const PHRASE_CLIP_NAMES = [
  'accept_label',
  'camera_prompt',
  'category_label',
  'condition_label',
  'earnings_title',
  'handover_confirmed',
  'handover_label',
  'home_title',
  'price_board_title',
  'quantity_label',
  'report_problem_success',
  'requests_pending_one',
  'requests_pending_other',
  'safety_title',
  'source_label',
  'subcategory_label',
  'value_label',
  'voice_accepted',
  'voice_dispute_recorded',
  'voice_error_generic',
  'voice_handover_confirmed',
];

describe('phrase clip assets', () => {
  it('ships 21 phrase clips for every language', () => {
    expect(PHRASE_CLIP_NAMES).toHaveLength(21);
  });

  it('every phrase clip exists on disk in every language pack', () => {
    const missing = [];
    for (const lang of LANGS) {
      for (const name of PHRASE_CLIP_NAMES) {
        const file = path.join(AUDIO_ROOT, lang, `${name}.m4a`);
        if (!fs.existsSync(file)) missing.push(`${lang}/${name}.m4a`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no phrase clip is a zero-byte or truncated file', () => {
    const tooSmall = [];
    for (const lang of LANGS) {
      for (const name of PHRASE_CLIP_NAMES) {
        const file = path.join(AUDIO_ROOT, lang, `${name}.m4a`);
        if (!fs.existsSync(file)) continue;
        // The shortest real clip ("Source") is a few KB; anything under 1 KB
        // is a failed `say`/`afconvert` run that wrote a header and stopped.
        if (fs.statSync(file).size < 1024) tooSmall.push(`${lang}/${name}.m4a`);
      }
    }
    expect(tooSmall).toEqual([]);
  });
});
