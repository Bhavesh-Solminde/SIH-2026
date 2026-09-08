import { composeDigits } from './numbers.js';

/**
 * Phrase clip pack — one recording per spoken i18n key, in Marathi (mr),
 * Hindi (hi) and English (en).
 *
 * Why this exists: screen headings and status lines used to be read by
 * expo-speech (the OS text-to-speech engine). Most Android handsets ship only
 * an English voice — Hindi language data needs a user-initiated download and
 * Marathi is unavailable entirely on many devices — and an English voice given
 * Devanagari text produces silence, not an accented reading. The result was
 * that spoken headings worked in English and nowhere else, while categories,
 * units and digits worked in all three because they were already bundled
 * audio. This pack extends that same guarantee to phrases.
 *
 * Clip names ARE i18n keys from src/i18n/strings.js, so the recording and the
 * on-screen text can never drift apart silently. Files live in
 * assets/audio/{lang}/*.m4a — see scripts/generate-clips.sh (`phrases` mode).
 *
 * Kept out of clips.js on purpose: that file's map is the vocabulary that
 * composeNumber()/composeDigits() index into by position, and mixing 21
 * sentences into it makes the number vocabulary hard to read. clips.js merges
 * both into the exported CLIPS.
 */

const mr = {
  accept_label:             require('../../assets/audio/mr/accept_label.m4a'),
  camera_prompt:            require('../../assets/audio/mr/camera_prompt.m4a'),
  category_label:           require('../../assets/audio/mr/category_label.m4a'),
  condition_label:          require('../../assets/audio/mr/condition_label.m4a'),
  earnings_title:           require('../../assets/audio/mr/earnings_title.m4a'),
  handover_confirmed:       require('../../assets/audio/mr/handover_confirmed.m4a'),
  handover_label:           require('../../assets/audio/mr/handover_label.m4a'),
  home_title:               require('../../assets/audio/mr/home_title.m4a'),
  price_board_title:        require('../../assets/audio/mr/price_board_title.m4a'),
  quantity_label:           require('../../assets/audio/mr/quantity_label.m4a'),
  report_problem_success:   require('../../assets/audio/mr/report_problem_success.m4a'),
  requests_pending_one:     require('../../assets/audio/mr/requests_pending_one.m4a'),
  requests_pending_other:   require('../../assets/audio/mr/requests_pending_other.m4a'),
  safety_title:             require('../../assets/audio/mr/safety_title.m4a'),
  source_label:             require('../../assets/audio/mr/source_label.m4a'),
  subcategory_label:        require('../../assets/audio/mr/subcategory_label.m4a'),
  value_label:              require('../../assets/audio/mr/value_label.m4a'),
  voice_accepted:           require('../../assets/audio/mr/voice_accepted.m4a'),
  voice_dispute_recorded:   require('../../assets/audio/mr/voice_dispute_recorded.m4a'),
  voice_error_generic:      require('../../assets/audio/mr/voice_error_generic.m4a'),
  voice_handover_confirmed: require('../../assets/audio/mr/voice_handover_confirmed.m4a'),
};

const hi = {
  accept_label:             require('../../assets/audio/hi/accept_label.m4a'),
  camera_prompt:            require('../../assets/audio/hi/camera_prompt.m4a'),
  category_label:           require('../../assets/audio/hi/category_label.m4a'),
  condition_label:          require('../../assets/audio/hi/condition_label.m4a'),
  earnings_title:           require('../../assets/audio/hi/earnings_title.m4a'),
  handover_confirmed:       require('../../assets/audio/hi/handover_confirmed.m4a'),
  handover_label:           require('../../assets/audio/hi/handover_label.m4a'),
  home_title:               require('../../assets/audio/hi/home_title.m4a'),
  price_board_title:        require('../../assets/audio/hi/price_board_title.m4a'),
  quantity_label:           require('../../assets/audio/hi/quantity_label.m4a'),
  report_problem_success:   require('../../assets/audio/hi/report_problem_success.m4a'),
  requests_pending_one:     require('../../assets/audio/hi/requests_pending_one.m4a'),
  requests_pending_other:   require('../../assets/audio/hi/requests_pending_other.m4a'),
  safety_title:             require('../../assets/audio/hi/safety_title.m4a'),
  source_label:             require('../../assets/audio/hi/source_label.m4a'),
  subcategory_label:        require('../../assets/audio/hi/subcategory_label.m4a'),
  value_label:              require('../../assets/audio/hi/value_label.m4a'),
  voice_accepted:           require('../../assets/audio/hi/voice_accepted.m4a'),
  voice_dispute_recorded:   require('../../assets/audio/hi/voice_dispute_recorded.m4a'),
  voice_error_generic:      require('../../assets/audio/hi/voice_error_generic.m4a'),
  voice_handover_confirmed: require('../../assets/audio/hi/voice_handover_confirmed.m4a'),
};

const en = {
  accept_label:             require('../../assets/audio/en/accept_label.m4a'),
  camera_prompt:            require('../../assets/audio/en/camera_prompt.m4a'),
  category_label:           require('../../assets/audio/en/category_label.m4a'),
  condition_label:          require('../../assets/audio/en/condition_label.m4a'),
  earnings_title:           require('../../assets/audio/en/earnings_title.m4a'),
  handover_confirmed:       require('../../assets/audio/en/handover_confirmed.m4a'),
  handover_label:           require('../../assets/audio/en/handover_label.m4a'),
  home_title:               require('../../assets/audio/en/home_title.m4a'),
  price_board_title:        require('../../assets/audio/en/price_board_title.m4a'),
  quantity_label:           require('../../assets/audio/en/quantity_label.m4a'),
  report_problem_success:   require('../../assets/audio/en/report_problem_success.m4a'),
  requests_pending_one:     require('../../assets/audio/en/requests_pending_one.m4a'),
  requests_pending_other:   require('../../assets/audio/en/requests_pending_other.m4a'),
  safety_title:             require('../../assets/audio/en/safety_title.m4a'),
  source_label:             require('../../assets/audio/en/source_label.m4a'),
  subcategory_label:        require('../../assets/audio/en/subcategory_label.m4a'),
  value_label:              require('../../assets/audio/en/value_label.m4a'),
  voice_accepted:           require('../../assets/audio/en/voice_accepted.m4a'),
  voice_dispute_recorded:   require('../../assets/audio/en/voice_dispute_recorded.m4a'),
  voice_error_generic:      require('../../assets/audio/en/voice_error_generic.m4a'),
  voice_handover_confirmed: require('../../assets/audio/en/voice_handover_confirmed.m4a'),
};

export const PHRASE_CLIPS = { mr, hi, en };

/** The 21 phrase clip names, sorted. Used by the regression gate test. */
export const PHRASE_CLIP_NAMES = Object.keys(mr).sort();

/**
 * Resolve an i18n key to the clip sequence that speaks it.
 *
 * Plural selection mirrors useStrings.js exactly (`_one` when count === 1,
 * `_other` otherwise, falling back to the bare key) so the clip played is the
 * recording of the string that would have been rendered.
 *
 * When `params.count` is a number, the count is spoken first, digit by digit,
 * then the phrase. Marathi, Hindi and English all put the count before the
 * noun ("{count} विनंत्या प्रलंबित" / "{count} अनुरोध लंबित" /
 * "{count} requests pending"), so one order serves all three.
 *
 * @param {string} key                 An i18n key from src/i18n/strings.js
 * @param {{count?: number}} [params]  Same params object passed to t()
 * @param {'mr'|'hi'|'en'} [lang]
 * @returns {string[]|null}  Clip names to play, or null when this key has no
 *                           recording — the caller should fall back to TTS.
 */
export function resolvePhraseClips(key, params, lang = 'mr') {
  const pack = PHRASE_CLIPS[lang] ?? PHRASE_CLIPS.mr;
  const count = params?.count;
  const hasCount = typeof count === 'number' && Number.isFinite(count);

  let resolvedKey = key;
  if (hasCount) {
    const pluralKey = `${key}_${count === 1 ? 'one' : 'other'}`;
    if (pluralKey in pack) resolvedKey = pluralKey;
  }
  if (!(resolvedKey in pack)) return null;

  return hasCount
    ? [...composeDigits(count, lang), resolvedKey]
    : [resolvedKey];
}

/**
 * Which voice should speak this key?
 *
 * Split out from useVoice() so the routing decision is testable without an
 * expo-av / expo-speech runtime. `kind: 'clips'` is the guaranteed-audible
 * path; `kind: 'tts'` only speaks on a handset that has a voice for the
 * active language, so any key landing there is a candidate for the next
 * round of recordings.
 *
 * @returns {{kind: 'clips', names: string[]} | {kind: 'tts'}}
 */
export function voiceRouteFor(key, params, lang = 'mr') {
  const names = resolvePhraseClips(key, params, lang);
  return names ? { kind: 'clips', names } : { kind: 'tts' };
}
