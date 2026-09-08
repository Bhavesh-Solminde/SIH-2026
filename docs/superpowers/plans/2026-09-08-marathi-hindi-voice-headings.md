# Marathi & Hindi Spoken Headings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every spoken screen heading and status phrase audible in Marathi and Hindi, not just English, by moving them off device TTS onto the app's bundled clip pack.

**Architecture:** The app already has two voice paths — `expo-speech` (device TTS) for prose, and a bundled `.m4a` clip pack for category names, units and digits. Only the TTS path is language-fragile, and that is exactly the path every screen heading uses. This plan ships a second clip pack (one recording per spoken i18n key, in mr/hi/en), adds `useVoice().speakKey(key, params)` which plays a clip when one exists and falls back to TTS when it does not, and migrates all 26 `speak(t('…'))` call sites to it.

**Tech Stack:** React Native 0.76.5 / Expo SDK 52, `expo-av` 14 (clip playback), `expo-speech` 13 (TTS fallback), Jest 29 with the `unit` project (node env, `.m4a` stubbed by `test/__mocks__/fileMock.js`), macOS `say` + `afconvert` for clip generation.

---

## Diagnosis (why headings are English-only)

Evidence gathered from the codebase, not guessed:

1. Every screen announces itself with `speak(t('<key>'))` — [CategoryScreen.jsx:37](client/app/src/screens/CategoryScreen.jsx#L37), [QuantityScreen.jsx:35](client/app/src/screens/QuantityScreen.jsx#L35), and 24 more sites. `speak()` is the **TTS-only** entry point in [useVoice.js](client/app/src/hooks/useVoice.js).
2. `resolveSpeechLanguage()` ([useVoice.js:41-58](client/app/src/hooks/useVoice.js#L41-L58)) asks `Speech.getAvailableVoicesAsync()` for an installed voice whose language starts with `mr` / `hi`. That prefix check is **correct** — expo-speech 13's Android `LanguageUtils.getISOCode()` normalises `mar-IND` → `mr-IN` before returning it, verified in `node_modules/expo-speech/android/src/main/java/expo/modules/speech/LanguageUtils.kt`. So this is not a code bug in the matcher.
3. The real failure is the **fallback**. When no mr/hi voice is installed (Google TTS ships English by default; Hindi needs a user-initiated language-data download and Marathi is unavailable on many handsets entirely), `resolveSpeechLanguage()` returns `undefined` so the OS default voice speaks. The comment there argues "the wrong-language accent reading the text is still audible feedback". **That reasoning holds only for Latin script.** The text handed over is Devanagari (`प्रकार`, `चूक झाली, पुन्हा प्रयत्न करा`), and an English voice given Devanagari produces silence or a garbled character-name reading — the exact failure the fallback was written to avoid.
4. Categories, conditions, units and digits are unaffected in all three languages because they never touch TTS — they go through `playClips()` and the bundled 34-clip pack in [clips.js](client/app/src/audio/clips.js). The fix is to extend that already-working mechanism to cover phrases.

**The fix is therefore the one the codebase already chose for numbers**, stated in `clips.js`'s own header and in `scripts/generate-clips.sh`: ship guaranteed audio rather than depend on handset voice packs.

---

## Global Constraints

- Clip audio format is **mono, 22050 Hz, AAC-LC `.m4a`**, produced by `afconvert -f m4af -d aac@22050 -c 1 -b 28470`. Every new clip must match the existing pack exactly or playback behaviour diverges across packs.
- All three packs (`mr`, `hi`, `en`) must carry the **exact same set of clip names**. `test/audio/clips.test.js` already enforces this and must keep passing.
- Clip generation runs on **macOS only** (`say` + `afconvert`). Voices: `hi` → `Lekha` (hi_IN), `en` → `Rishi` (en_IN), `mr` → `Lekha` (no `mr_IN` voice exists on stock macOS; confirmed with `say -v '?'` on the dev machine — this matches how the existing mr pack was made).
- **Do not regenerate the existing 34 word clips.** `scripts/generate-clips.sh <lang>` overwrites reviewed recordings; the new phrase mode must write only the new files.
- `speakKey` must have a **stable identity across renders**. `useStrings()`'s doc comment records a real shipped bug ("it says प्रमाण again and again") caused by an unstable `t` in a `useFocusEffect` dependency array. `speakKey`'s `useCallback` deps must be only `[lang, t, speak, speakClips]`, all of which are themselves memoised on `lang`.
- Plural keys resolve with the same `_one` / `_other` rule `useStrings.js` uses, so the clip chosen matches the text that would have been spoken.
- No new npm dependencies.
- Run tests with `npx jest --selectProjects unit` from `client/app`.

---

## File Structure

**Create:**
- `client/app/src/audio/phrases.js` — the phrase clip pack (mr/hi/en `require()` maps) plus `resolvePhraseClips(key, params, lang)`. Kept separate from `clips.js` so the word pack that `composeNumber`/`composeDigits` index into stays readable on its own; `clips.js` merges the two into the exported `CLIPS`.
- `client/app/assets/audio/{mr,hi,en}/<key>.m4a` — 21 phrase clips × 3 languages = 63 files.
- `client/app/test/audio/phrase-assets.test.js` — asserts all 63 files exist on disk with a plausible size.
- `client/app/test/audio/phrases.test.js` — asserts pack parity and `resolvePhraseClips()` behaviour.
- `client/app/test/audio/spoken-keys.test.js` — regression gate: every `speakKey('…')` call site in `src/` has a clip, and no `speak(t(` remains in `src/screens/`.

**Modify:**
- `client/app/scripts/generate-clips.sh` — add a `phrases` mode with the mr/hi/en phrase arrays.
- `client/app/src/audio/clips.js` — merge `PHRASE_CLIPS` into each language's exported map.
- `client/app/src/hooks/useVoice.js` — add `speakKey()`; make `resolveSpeechLanguage()` report whether it matched so `speak()` can log the inaudible-fallback case.
- 13 screen files under `client/app/src/screens/` — 26 call sites migrated from `speak(t('k'))` to `speakKey('k')`.

**The 21 phrase clip names** (each is an i18n key from `src/i18n/strings.js`):

`accept_label`, `camera_prompt`, `category_label`, `condition_label`, `earnings_title`, `handover_confirmed`, `handover_label`, `home_title`, `price_board_title`, `quantity_label`, `report_problem_success`, `requests_pending_one`, `requests_pending_other`, `safety_title`, `source_label`, `subcategory_label`, `value_label`, `voice_accepted`, `voice_dispute_recorded`, `voice_error_generic`, `voice_handover_confirmed`

---

### Task 1: Generate the phrase clip pack

**Files:**
- Modify: `client/app/scripts/generate-clips.sh`
- Create: `client/app/assets/audio/{mr,hi,en}/*.m4a` (63 files)
- Test: `client/app/test/audio/phrase-assets.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: 63 `.m4a` files at `client/app/assets/audio/<lang>/<clipName>.m4a`, where `<clipName>` is one of the 21 names listed above and `<lang>` is `mr` | `hi` | `en`. Task 2 `require()`s these by exactly those paths.

- [ ] **Step 1: Write the failing test**

Create `client/app/test/audio/phrase-assets.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client/app && npx jest --selectProjects unit test/audio/phrase-assets.test.js`
Expected: FAIL — the second test lists all 63 files as missing.

- [ ] **Step 3: Add the phrases mode to the generation script**

In `client/app/scripts/generate-clips.sh`, replace the usage block and argument parsing at the top:

```bash
# Usage:
#   scripts/generate-clips.sh <lang> [phrases]
#
#   <lang> is one of: mr | hi | en
#   Passing the literal second argument `phrases` generates ONLY the phrase
#   pack (screen headings and spoken status lines, one clip per i18n key)
#   and leaves the 34 word clips untouched. Without it the original word pack
#   is generated, which OVERWRITES the existing reviewed recordings.
```

Change the argument handling from:

```bash
LANG_CODE="${1:-}"
if [[ -z "$LANG_CODE" ]]; then
  echo "Usage: $0 <mr|hi|en>" >&2
  exit 1
fi
```

to:

```bash
LANG_CODE="${1:-}"
MODE="${2:-words}"
if [[ -z "$LANG_CODE" ]]; then
  echo "Usage: $0 <mr|hi|en> [phrases]" >&2
  exit 1
fi
if [[ "$MODE" != "words" && "$MODE" != "phrases" ]]; then
  echo "Unknown mode '$MODE' — expected 'phrases' or nothing" >&2
  exit 1
fi
```

- [ ] **Step 4: Add the phrase arrays**

In the same file, immediately **after** the existing `MR_PHRASES=( … )` array and **before** the `case "$LANG_CODE" in` block that selects `PHRASES`, add:

```bash
# ---------------------------------------------------------------------------
# Phrase pack — one clip per i18n key spoken through useVoice().speakKey().
#
# These exist because expo-speech is silent on any handset with no mr-IN/hi-IN
# voice installed, which is most of them: the OS-default (English) voice given
# Devanagari text produces nothing. Screen headings therefore ship as bundled
# audio, exactly like the digits do. The clip NAME is the i18n key from
# src/i18n/strings.js; the spoken phrase is that key's translation.
#
# requests_pending_{one,other} deliberately omit the {count} placeholder —
# useVoice().speakKey() prepends the number as digit clips, and in all three
# languages the count is spoken first.
# ---------------------------------------------------------------------------
declare -a EN_SENTENCES=(
  "accept_label:Accept"
  "camera_prompt:Take Photo"
  "category_label:Category"
  "condition_label:Condition"
  "earnings_title:Total Earnings"
  "handover_confirmed:Confirmed"
  "handover_label:Handover"
  "home_title:Bhaav Collector"
  "price_board_title:Price Board"
  "quantity_label:Quantity"
  "report_problem_success:Report submitted"
  "requests_pending_one:request pending"
  "requests_pending_other:requests pending"
  "safety_title:Safety Guidelines"
  "source_label:Source"
  "subcategory_label:Sub-category"
  "value_label:Estimated Value"
  "voice_accepted:Accepted"
  "voice_dispute_recorded:Your objection has been recorded"
  "voice_error_generic:Something went wrong, please try again"
  "voice_handover_confirmed:Handover confirmed"
)

declare -a HI_SENTENCES=(
  "accept_label:स्वीकार करें"
  "camera_prompt:फ़ोटो लें"
  "category_label:प्रकार"
  "condition_label:स्थिति"
  "earnings_title:कुल कमाई"
  "handover_confirmed:पुष्टि हो गई"
  "handover_label:हस्तांतरण"
  "home_title:भाव संग्राहक"
  "price_board_title:दर पट्टिका"
  "quantity_label:मात्रा"
  "report_problem_success:शिकायत दर्ज की गई"
  "requests_pending_one:अनुरोध लंबित"
  "requests_pending_other:अनुरोध लंबित"
  "safety_title:सुरक्षा निर्देश"
  "source_label:स्रोत"
  "subcategory_label:उपप्रकार"
  "value_label:अनुमानित मूल्य"
  "voice_accepted:स्वीकार किया गया"
  "voice_dispute_recorded:आपकी आपत्ति दर्ज कर ली गई"
  "voice_error_generic:त्रुटि हुई, दोबारा प्रयास करें"
  "voice_handover_confirmed:हस्तांतरण की पुष्टि हो गई"
)

declare -a MR_SENTENCES=(
  "accept_label:स्वीकार करा"
  "camera_prompt:फोटो घ्या"
  "category_label:प्रकार"
  "condition_label:स्थिती"
  "earnings_title:एकूण कमाई"
  "handover_confirmed:पुष्टी झाली"
  "handover_label:हस्तांतरण"
  "home_title:भाव संग्राहक"
  "price_board_title:दर पत्रक"
  "quantity_label:प्रमाण"
  "report_problem_success:तक्रार नोंदवली"
  "requests_pending_one:विनंती प्रलंबित"
  "requests_pending_other:विनंत्या प्रलंबित"
  "safety_title:सुरक्षा सूचना"
  "source_label:स्रोत"
  "subcategory_label:उपप्रकार"
  "value_label:अंदाजे मूल्य"
  "voice_accepted:स्वीकारले"
  "voice_dispute_recorded:तुमचा आक्षेप नोंदवला"
  "voice_error_generic:चूक झाली, पुन्हा प्रयत्न करा"
  "voice_handover_confirmed:हस्तांतरण पुष्टी झाली"
)
```

- [ ] **Step 5: Wire the mode into the selection block**

Replace the existing selection block:

```bash
case "$LANG_CODE" in
  en) PHRASES=("${EN_PHRASES[@]}") ;;
  hi) PHRASES=("${HI_PHRASES[@]}") ;;
  mr) PHRASES=("${MR_PHRASES[@]}") ;;
esac
```

with:

```bash
if [[ "$MODE" == "phrases" ]]; then
  case "$LANG_CODE" in
    en) PHRASES=("${EN_SENTENCES[@]}") ;;
    hi) PHRASES=("${HI_SENTENCES[@]}") ;;
    mr) PHRASES=("${MR_SENTENCES[@]}") ;;
  esac
else
  case "$LANG_CODE" in
    en) PHRASES=("${EN_PHRASES[@]}") ;;
    hi) PHRASES=("${HI_PHRASES[@]}") ;;
    mr) PHRASES=("${MR_PHRASES[@]}") ;;
  esac
fi
```

- [ ] **Step 6: Generate the 63 clips**

Run from `client/app`:

```bash
scripts/generate-clips.sh mr phrases
scripts/generate-clips.sh hi phrases
scripts/generate-clips.sh en phrases
```

Expected: each run prints 21 `wrote …` lines and ends with `Done: 21 clips written to …`.

Verify the count and the format of one new file:

```bash
ls assets/audio/mr/*.m4a | wc -l   # expect 55  (34 words + 21 phrases)
afinfo assets/audio/mr/category_label.m4a | grep -i "channels\|sample rate\|format"
```

Expected: `55`, and the `afinfo` output shows 1 channel at 22050 Hz AAC.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd client/app && npx jest --selectProjects unit test/audio/phrase-assets.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add client/app/scripts/generate-clips.sh \
        client/app/assets/audio/mr client/app/assets/audio/hi client/app/assets/audio/en \
        client/app/test/audio/phrase-assets.test.js
git commit -m "feat(voice): generate mr/hi/en phrase clip pack for spoken headings"
```

---

### Task 2: Phrase clip module and clip-name resolution

**Files:**
- Create: `client/app/src/audio/phrases.js`
- Test: `client/app/test/audio/phrases.test.js`

**Interfaces:**
- Consumes: the 63 `.m4a` assets from Task 1; `composeDigits(n, lang)` from `src/audio/numbers.js`, which returns one ones-digit clip name per digit (`43910` → `['four','three','nine','one','zero']`).
- Produces:
  - `PHRASE_CLIPS` — `{ mr: Record<string, any>, hi: …, en: … }`, keyed by the 21 clip names.
  - `PHRASE_CLIP_NAMES: string[]` — the 21 names, sorted.
  - `resolvePhraseClips(key: string, params?: {count?: number}, lang?: 'mr'|'hi'|'en'): string[] | null` — the clip-name sequence to play for an i18n key, or `null` when the key has no recording. Task 4 calls this.

- [ ] **Step 1: Write the failing test**

Create `client/app/test/audio/phrases.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client/app && npx jest --selectProjects unit test/audio/phrases.test.js`
Expected: FAIL — `Cannot find module '../../src/audio/phrases.js'`.

- [ ] **Step 3: Write the implementation**

Create `client/app/src/audio/phrases.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client/app && npx jest --selectProjects unit test/audio/phrases.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/audio/phrases.js client/app/test/audio/phrases.test.js
git commit -m "feat(voice): add phrase clip pack module and key-to-clip resolution"
```

---

### Task 3: Merge the phrase pack into CLIPS

**Files:**
- Modify: `client/app/src/audio/clips.js`
- Test: `client/app/test/audio/clips.test.js` (existing — must keep passing unmodified)

**Interfaces:**
- Consumes: `PHRASE_CLIPS` from `src/audio/phrases.js` (Task 2).
- Produces: the exported `CLIPS[lang]` now contains 55 names per language (34 words + 21 phrases). `playClips(names, lang)` in `src/audio/index.js` needs no change — it already looks names up in `CLIPS[lang]`.

- [ ] **Step 1: Run the existing parity test to confirm the baseline is green**

Run: `cd client/app && npx jest --selectProjects unit test/audio/clips.test.js`
Expected: PASS. This is the test that must still pass after the merge — it asserts all three packs carry identical name sets, which the merge preserves only because all three phrase packs are identical in shape (proved in Task 2).

- [ ] **Step 2: Merge the packs**

In `client/app/src/audio/clips.js`, add the import at the top of the file, immediately below the doc comment:

```js
import { PHRASE_CLIPS } from './phrases.js';
```

Then replace the final export line:

```js
export const CLIPS = { mr, hi, en };
```

with:

```js
// Words and phrases live in one lookup so playClips() can sequence a number
// and a phrase in a single utterance — e.g. speakKey('requests_pending',
// { count: 3 }) plays ['three', 'requests_pending_other']. They are authored
// in separate modules because they are separate vocabularies: these 34 names
// are indexed by position by composeNumber()/composeDigits(), the 21 in
// phrases.js are indexed by i18n key.
export const CLIPS = {
  mr: { ...mr, ...PHRASE_CLIPS.mr },
  hi: { ...hi, ...PHRASE_CLIPS.hi },
  en: { ...en, ...PHRASE_CLIPS.en },
};
```

Also update the file's doc comment: change `All three packs carry the exact same 34 clip names` to `All three packs carry the exact same 55 clip names (34 words + the 21 phrases merged in from phrases.js)`.

- [ ] **Step 3: Run the audio suite to verify nothing regressed**

Run: `cd client/app && npx jest --selectProjects unit test/audio`
Expected: PASS — `clips.test.js`, `numbers.test.js`, `phrases.test.js` and `phrase-assets.test.js` all green. In particular `clips.test.js`'s "every pack has the exact same set of clip names" must still pass with 55 names.

- [ ] **Step 4: Commit**

```bash
git add client/app/src/audio/clips.js
git commit -m "feat(voice): merge phrase clips into the CLIPS lookup"
```

---

### Task 4: `speakKey()` in useVoice

**Files:**
- Modify: `client/app/src/hooks/useVoice.js`
- Test: `client/app/test/audio/speak-key.test.js` (create)

**Interfaces:**
- Consumes: `resolvePhraseClips(key, params, lang)` from `src/audio/phrases.js` (Task 2); `useStrings()` from `src/i18n/useStrings.js`, which returns a `t(key, params)` memoised on `lang`.
- Produces: `useVoice()` now returns `speakKey(key, params?)` alongside the existing `speak`, `speakClips`, `speakNumber`, `stop`. Task 5 calls `speakKey`.

Note on testing: `useVoice` is a React hook that pulls in `expo-av` and `expo-speech`, neither of which loads in the `unit` project. The behaviour worth testing is the **decision** — clip path vs TTS path — so extract that decision into a plain exported function `voiceRouteFor(key, params, lang)` and test it directly. The hook then becomes a thin wrapper with no untested branching.

- [ ] **Step 1: Write the failing test**

Create `client/app/test/audio/speak-key.test.js`:

```js
import { voiceRouteFor } from '../../src/audio/phrases.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client/app && npx jest --selectProjects unit test/audio/speak-key.test.js`
Expected: FAIL — `voiceRouteFor is not a function`.

- [ ] **Step 3: Add `voiceRouteFor` to phrases.js**

Append to `client/app/src/audio/phrases.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client/app && npx jest --selectProjects unit test/audio/speak-key.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add `speakKey` to the hook**

In `client/app/src/hooks/useVoice.js`:

Add to the imports at the top:

```js
import { useStrings } from '../i18n/useStrings';
import { voiceRouteFor } from '../audio/phrases';
```

Replace `resolveSpeechLanguage` so it reports whether it matched (the caller needs to know, to log the inaudible case):

```js
const DEVANAGARI = /[ऀ-ॿ]/;

async function resolveSpeechLanguage(lang) {
  const wanted = LANG_CODE[lang] ?? 'mr-IN';
  const prefix = wanted.split('-')[0].toLowerCase();
  const voices = await getVoices();
  const hasMatch = voices.some((v) => v.language?.toLowerCase().startsWith(prefix));
  if (hasMatch) return { language: wanted, matched: true };

  if (!warnedMissingLang.has(wanted)) {
    warnedMissingLang.add(wanted);
    log.voice.warn('no installed TTS voice for language — falling back to device default', {
      wanted,
      installed: voices.map((v) => v.language),
    });
  }
  return { language: undefined, matched: false };
}
```

Replace the body of the `speak` callback:

```js
  const speak = useCallback(async (text) => {
    stopClips();
    if (!Speech?.speak) return;
    try {
      const { language, matched } = await resolveSpeechLanguage(lang);
      // The device-default-voice fallback above assumes a wrong accent is
      // better than silence. That holds for Latin script only: an English
      // voice handed Devanagari produces nothing at all. This is the exact
      // failure that made spoken headings English-only, so say so in the log
      // rather than letting it look like the utterance succeeded. The fix for
      // a phrase that hits this line is to record it — see speakKey().
      if (!matched && DEVANAGARI.test(String(text))) {
        log.voice.warn('speaking Devanagari with a non-matching voice — likely inaudible; add a phrase clip for this string', { lang });
      }
      Speech.stop();
      Speech.speak(String(text), {
        ...(language ? { language } : {}),
        rate: 0.85,
        onError: (err) => log.voice.warn('Speech.speak error', err),
      });
    } catch (err) {
      log.voice.warn('speak failed', err);
    }
  }, [lang]);
```

Add `t` at the top of the hook body, directly under `const { lang } = useLanguage();`:

```js
  const t = useStrings();
```

Add the `speakKey` callback after `speakNumber` and before `stop`:

```js
  /**
   * Speak an i18n key. Plays the bundled recording when one exists, and only
   * falls back to device TTS when it does not.
   *
   * This is the entry point every screen should use to announce itself.
   * Handing a resolved translation to speak() — what the screens did before —
   * always took the TTS path, which is silent on any handset with no mr-IN or
   * hi-IN voice installed. (Do not write that old form literally anywhere
   * under src/: test/audio/spoken-keys.test.js greps for it, comments
   * included, and a doc comment showing the anti-pattern fails the gate.)
   *
   * Identity is stable across renders: `lang` is the only changing input, and
   * `t`, `speak` and `speakClips` are each memoised on `lang` too. Screens put
   * this in the dependency array of the useCallback they hand to
   * useFocusEffect, and an unstable value there re-announces the screen name
   * on every keypress — see the doc comment in i18n/useStrings.js.
   */
  const speakKey = useCallback(async (key, params) => {
    const route = voiceRouteFor(key, params, lang);
    if (route.kind === 'clips') {
      await speakClips(route.names);
      return;
    }
    await speak(t(key, params));
  }, [lang, t, speak, speakClips]);
```

Update the return statement:

```js
  return { speak, speakKey, speakClips, speakNumber, stop };
```

And update the hook's doc comment block, adding a line under `speak(text)`:

```
 * speakKey(key, params) Speak an i18n key — bundled clip if recorded, TTS otherwise
```

- [ ] **Step 6: Run the full unit and components suites**

Run: `cd client/app && npx jest --selectProjects unit --selectProjects components`
Expected: PASS. `useVoice` now imports `useStrings`, which reads `LanguageContext` — the same context `useVoice` already consumed via `useLanguage`, so there is no new provider requirement and no import cycle (`useStrings` imports only `LanguageContext` and `strings`).

- [ ] **Step 7: Commit**

```bash
git add client/app/src/hooks/useVoice.js client/app/src/audio/phrases.js client/app/test/audio/speak-key.test.js
git commit -m "feat(voice): add speakKey() routing spoken i18n keys to bundled clips"
```

---

### Task 5: Migrate all 26 call sites and gate the regression

**Files:**
- Modify (13 screens):
  - `client/app/src/screens/AcceptScreen.jsx:25,41,76-77`
  - `client/app/src/screens/CameraScreen.jsx:51`
  - `client/app/src/screens/CategoryScreen.jsx:32,37-38`
  - `client/app/src/screens/ConditionScreen.jsx:27,32-33`
  - `client/app/src/screens/HandoverEvidenceScreen.jsx:41,128,139,170,174`
  - `client/app/src/screens/HandoverScreen.jsx:26,35-36,71,82,106,110`
  - `client/app/src/screens/HomeScreen.jsx:27`
  - `client/app/src/screens/LedgerScreen.jsx:75,86,170`
  - `client/app/src/screens/PendingRequestsScreen.jsx:133,180,184`
  - `client/app/src/screens/PriceBoardScreen.jsx:41`
  - `client/app/src/screens/QuantityScreen.jsx:30,35-36`
  - `client/app/src/screens/SafetyScreen.jsx:44`
  - `client/app/src/screens/SourceScreen.jsx:23,28-29`
  - `client/app/src/screens/SubCategoryScreen.jsx:30,35-36`
  - `client/app/src/screens/ValueScreen.jsx:78`
- Test: `client/app/test/audio/spoken-keys.test.js` (create)

(Line numbers are from the pre-change tree and will shift as you edit; find the call sites by pattern, not by line.)

**Interfaces:**
- Consumes: `useVoice().speakKey(key, params)` from Task 4; `PHRASE_CLIP_NAMES` from Task 2.
- Produces: no new exports. After this task no `speak(t(` call remains in `src/screens/`.

- [ ] **Step 1: Write the failing test**

Create `client/app/test/audio/spoken-keys.test.js`:

```js
import fs from 'fs';
import path from 'path';
import { PHRASE_CLIP_NAMES } from '../../src/audio/phrases.js';
import strings from '../../src/i18n/strings.js';

/**
 * Regression gate for "spoken headings only work in English".
 *
 * Two rules, both of which the app violated before the phrase pack existed:
 *
 * 1. No screen calls speak(t('…')). That form always routes to expo-speech,
 *    which is silent on any handset with no voice installed for the active
 *    language — which is most handsets for mr-IN and many for hi-IN. Screens
 *    announce themselves with speakKey('…') instead.
 * 2. Every key passed to speakKey() has a recording in all three packs.
 *    A key with no clip silently falls back to TTS, which reintroduces the
 *    exact bug for that one string.
 */

const SRC_ROOT = path.resolve(__dirname, '../../src');

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SOURCES = listSourceFiles(SRC_ROOT).map((file) => ({
  file: path.relative(SRC_ROOT, file),
  code: fs.readFileSync(file, 'utf8'),
}));

describe('spoken i18n keys', () => {
  it('no source file speaks a translated string through raw TTS', () => {
    const offenders = [];
    for (const { file, code } of SOURCES) {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client/app && npx jest --selectProjects unit test/audio/spoken-keys.test.js`
Expected: FAIL — the first test lists 13 screens, and the last reports `0` instead of `26`.

- [ ] **Step 3: Migrate the simple screens (one announce call each)**

In each of these files, change the destructure and the call. `CameraScreen.jsx`, `HomeScreen.jsx`, `PriceBoardScreen.jsx`, `SafetyScreen.jsx`, `ValueScreen.jsx`:

```js
// before
const { speak } = useVoice();
…
speak(t('camera_prompt'));

// after
const { speakKey } = useVoice();
…
speakKey('camera_prompt');
```

Key per file: `CameraScreen` → `camera_prompt`, `HomeScreen` → `home_title`, `PriceBoardScreen` → `price_board_title`, `SafetyScreen` → `safety_title`, `ValueScreen` → `value_label`.

Each of these calls sits inside a `useFocusEffect(useCallback(…, [speak, t]))`. Update that dependency array to `[speakKey]` — `t` is no longer referenced by the callback. Example, from `CategoryScreen.jsx`:

```js
// before
useFocusEffect(
  useCallback(() => {
    speak(t('category_label'));
  }, [speak, t])
);

// after
useFocusEffect(
  useCallback(() => {
    speakKey('category_label');
  }, [speakKey])
);
```

Leave `const t = useStrings()` in place where the screen still renders text with it; remove it only if the file has no other `t(` use.

- [ ] **Step 4: Migrate the screens that also keep other voice methods**

`CategoryScreen.jsx` (`category_label`), `ConditionScreen.jsx` (`condition_label`), `SourceScreen.jsx` (`source_label`), `SubCategoryScreen.jsx` (`subcategory_label`) follow the exact pattern in Step 3.

`QuantityScreen.jsx` keeps `speakClips` and `speakNumber`:

```js
const { speakKey, speakClips, speakNumber } = useVoice();
…
useFocusEffect(
  useCallback(() => {
    speakKey('quantity_label');
  }, [speakKey])
);
```

`LedgerScreen.jsx` has two sites:

```js
const { speakKey } = useVoice();
…
speakKey('earnings_title');       // was speak(t('earnings_title'))
…
speakKey('report_problem_success'); // was speak(t('report_problem_success'))
```

`AcceptScreen.jsx` has two:

```js
const { speakKey } = useVoice();
…
speakKey('accept_label');   // in the useFocusEffect, deps become [speakKey]
…
const onAccepted = useCallback(() => {
  speakKey('voice_accepted');
}, [speakKey]);              // was [speak, t]
```

- [ ] **Step 5: Migrate the handover and requests screens**

`HandoverScreen.jsx` — five sites, `speakNumber` stays:

```js
const { speakKey, speakNumber } = useVoice();
…
speakKey('handover_label');          // useFocusEffect, deps [speakKey]
…
speakKey('handover_confirmed');      // both occurrences
…
speakKey('voice_dispute_recorded');
…
speakKey('voice_error_generic');
```

`HandoverEvidenceScreen.jsx` — four sites:

```js
const { speakKey } = useVoice();
…
speakKey('voice_handover_confirmed');
speakKey('voice_error_generic');     // both occurrences
speakKey('voice_dispute_recorded');
```

`PendingRequestsScreen.jsx` — three sites, one of which carries a count:

```js
const { speakKey } = useVoice();
…
speakKey('requests_pending', { count: awaitingCount });
…
speakKey('voice_dispute_recorded');
speakKey('voice_error_generic');
```

The `requests_pending` call now plays the count digit by digit followed by the phrase clip — `{ count: 3 }` in Marathi plays `three` then `विनंत्या प्रलंबित`. Confirm the surrounding `useCallback`/`useFocusEffect` dependency array lists `speakKey` and `awaitingCount`, not `speak` and `t`.

- [ ] **Step 6: Verify no call site was missed**

Run:

```bash
cd client/app && grep -rn "speak(t(" src ; echo "exit=$?"
```

Expected: no output, `exit=1` (grep found nothing).

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd client/app && npx jest --selectProjects unit test/audio/spoken-keys.test.js`
Expected: PASS, 4 tests — including the count check reporting exactly 26 `speakKey(` sites.

- [ ] **Step 8: Run the whole suite and the linter**

Run:

```bash
cd client/app && npx jest && npm run lint
```

Expected: all projects PASS, lint clean. Watch specifically for `react-hooks/exhaustive-deps` warnings on the dependency arrays edited in Steps 3–5 — a leftover `t` or a missing `speakKey` shows up here.

- [ ] **Step 9: Commit**

```bash
git add client/app/src/screens client/app/test/audio/spoken-keys.test.js
git commit -m "fix(voice): speak screen headings from bundled clips in mr/hi/en"
```

---

### Task 6: Verify on device and document

**Files:**
- Modify: `client/app/src/audio/clips.js` (doc comment only, if Task 3 left it stale)
- Modify: `docs/superpowers/plans/2026-09-01-02-collector-app.md` (task 4 note)

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: no code interface; a recorded manual-verification result.

- [ ] **Step 1: Build and run on a handset with no Indic TTS voice**

Run:

```bash
cd client/app && npx expo run:android
```

The verification only means something on a device **without** mr-IN/hi-IN voice data — that is the failing configuration. On the handset, check under Settings → System → Languages & input → Text-to-speech output → install voice data, and confirm Marathi and Hindi are **not** installed before testing.

- [ ] **Step 2: Walk the flow in each language**

For each of Marathi, Hindi and English (switch with the header language pills):

1. Home — hear the app name on focus.
2. New lot → Category → Sub-category → Condition → Source → Quantity → Value — hear each screen's name on focus.
3. Quantity keypad — type `123`, hear the digits (this already worked; it confirms the clip queue still serialises correctly now that phrases share it).
4. My Lots — hear the pending count followed by the phrase.
5. Handover → confirm — hear the confirmation.

Expected: audio in all three languages at every step. Before this change, steps 1, 2, 4 and 5 were silent in Marathi and Hindi.

- [ ] **Step 3: Confirm one utterance at a time still holds**

On the Quantity screen, tap keypad digits rapidly, then navigate away mid-sequence. Expected: the new screen's name interrupts the digits cleanly — no overlap. `speakKey` goes through `speakClips` → `playClips`, which bumps the generation counter, so this is the same cancellation path the digits already used; the check is that phrases did not introduce a second, uncancelled source.

- [ ] **Step 4: Check the log for the inaudible-TTS warning**

With the app running, watch `adb logcat` (or the Metro console) while walking the flow. Expected: the warning added in Task 4 — `speaking Devanagari with a non-matching voice` — **never fires**, because every spoken string now has a clip. If it does fire, the key it names needs a recording: add it to the three `*_SENTENCES` arrays in `scripts/generate-clips.sh`, regenerate, and add it to `phrases.js`.

- [ ] **Step 5: Update the collector-app plan note**

In `docs/superpowers/plans/2026-09-01-02-collector-app.md`, find the task 4 note about TTS voice availability that `clips.js` and `generate-clips.sh` both cite. Append:

```markdown
**Update (2026-09-08):** the risk noted here was realised — spoken screen
headings were audible only in English, because they went through expo-speech
while only numbers used bundled clips. An English voice given Devanagari
produces silence, so the "wrong accent is better than nothing" fallback in
useVoice.js did not hold. Headings and status phrases now ship as bundled
clips too (src/audio/phrases.js, `scripts/generate-clips.sh <lang> phrases`),
and useVoice().speakKey() is the entry point every screen uses. TTS remains
only as the fallback for keys with no recording, and logs a warning when it
is handed Devanagari it cannot speak. See
docs/superpowers/plans/2026-09-08-marathi-hindi-voice-headings.md.
```

- [ ] **Step 6: Refresh the i18n catalogue header comment**

`client/app/src/i18n/strings.js`'s header says `voice_` keys are "spoken through `useVoice().speak()`" and warns that "the TTS locale follows the active language". Both are now stale. Replace those two sentences with:

```
 * Keys prefixed `nav_` are navigator titles; `voice_` are phrases spoken
 * rather than rendered. Both must be catalogued. Every key the app speaks
 * also needs a recording in src/audio/phrases.js — speech goes through
 * useVoice().speakKey(), which plays the bundled clip and only falls back to
 * device TTS (silent on handsets with no mr-IN/hi-IN voice) when there is no
 * recording. test/audio/spoken-keys.test.js enforces that pairing.
```

- [ ] **Step 7: Run the full suite one last time**

Run: `cd client/app && npx jest`
Expected: all projects PASS. `test/i18n/strings.test.js` and `test/i18n/no-hardcoded-strings.test.js` in particular, since the comment edited above sits in a file the latter scans (it strips comments before scanning, so the Devanagari-free replacement above is safe either way).

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-09-01-02-collector-app.md \
        client/app/src/audio/clips.js client/app/src/i18n/strings.js
git commit -m "docs(voice): record the mr/hi heading fix and its verification"
```

---

## Notes and known limitations

- **Marathi recordings use a Hindi voice.** Stock macOS has no `mr_IN` voice (`say -v '?'` on the dev machine lists `Lekha` hi_IN, `Rishi`/`Aman`/`Tara` en_IN, `Vani` ta_IN, `Piya` bn_IN — no Marathi). Single Marathi words came through acceptably in the existing pack; the longer phrases here (`चूक झाली, पुन्हा प्रयत्न करा`) will read with a Hindi accent. It is intelligible and, unlike today, audible. If a native Marathi speaker is available before the demo, re-record just `assets/audio/mr/*.m4a` for the 21 phrase names — nothing in the code changes, and `phrase-assets.test.js` keeps guarding the result.
- **`{count}` word order** is assumed to be count-first in all three languages, which holds for the one plural key in the catalogue. Any future plural key with the count elsewhere in the sentence needs its own handling in `resolvePhraseClips`.
- **Bundle size:** 63 additional mono 22 kHz AAC clips at roughly 8–20 KB each — under 1 MB total, in line with the 102 clips already shipped.
- **TTS is not removed.** `speak()` stays for any future string with no recording, and the new warning makes the "this one is silent in Marathi" case visible in the log instead of invisible on the device.
