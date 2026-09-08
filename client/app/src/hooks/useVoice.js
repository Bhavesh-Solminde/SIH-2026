import { useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useStrings } from '../i18n/useStrings';
import { playClips, stopClips, composeDigits } from '../audio';
import { voiceRouteFor } from '../audio/phrases';
import { log } from '../lib/logger';

let Speech = null;
try { Speech = require('expo-speech'); } catch {}

const LANG_CODE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };
// Written as escapes, not literal characters (U+0900–U+097F). This is a script
// detector, not display text, but test/i18n/no-hardcoded-strings.test.js scans
// source for literal Devanagari and would flag the character class itself.
const DEVANAGARI = /[\u0900-\u097F]/;

// expo-speech uses the OS text-to-speech engine, and mr-IN/hi-IN voice
// packs are far from guaranteed on a given Android handset — the phone may
// ship only an English voice. Asking Speech.speak() for a locale the engine
// has no voice for does not reliably throw or call onError; on many devices
// it just produces nothing, which reads as "the app is silent" rather than
// "this phone has no Marathi voice installed" (see docs/superpowers/plans/
// 2026-09-01-02-collector-app.md task 4 — this exact risk is why numbers use
// pre-recorded clips instead of TTS).
//
// getAvailableVoicesAsync() lets us check before speaking rather than guess:
// if no installed voice matches the requested language, drop the `language`
// constraint entirely so the OS uses whatever voice it does have.
//
// That fallback was originally justified as "a wrong-language accent is still
// audible feedback; true silence is the real failure". It does not hold for
// Devanagari — an English voice given `प्रकार` says nothing at all — and that
// is precisely why spoken screen headings shipped working in English only.
// Phrases the app actually speaks no longer come through here: they are
// bundled recordings resolved by src/audio/phrases.js and played by
// useVoice().speakKey(). This path is now the fallback for keys with no
// recording, and speak() logs a warning when it is handed script the chosen
// voice cannot render, so the next silent string is visible in the log
// instead of invisible on the device.
let voicesPromise = null;
function getVoices() {
  if (!Speech?.getAvailableVoicesAsync) return Promise.resolve([]);
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync().catch((err) => {
      log.voice.warn('getAvailableVoicesAsync failed', err);
      voicesPromise = null; // allow a retry on the next speak() call
      return [];
    });
  }
  return voicesPromise;
}

const warnedMissingLang = new Set();

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
  // No `language` option → OS default voice. See the caller: that only
  // produces sound for Latin script.
  return { language: undefined, matched: false };
}

/**
 * useVoice — unified voice output hook.
 *
 * speak(text)           TTS a plain string (screen name, label, status)
 * speakKey(key, params) Speak an i18n key — bundled clip if recorded, else TTS
 * speakClips(names)     Play pre-recorded audio clips in sequence
 * speakNumber(n)        Speak a number as digits: 43910 → "four three nine one zero"
 * stop()                Stop any ongoing TTS *and* clip playback
 *
 * Every entry point cancels whatever is already sounding. Two voice sources
 * run in this app (device TTS and the recorded clip pack), and before this
 * they could talk over each other — a screen would announce its own name via
 * TTS while a number played through the clips. One utterance at a time is the
 * rule; the newest request wins.
 *
 * Falls back silently when expo-speech isn't installed.
 */
export function useVoice() {
  const { lang } = useLanguage();
  const t = useStrings();

  const speak = useCallback(async (text) => {
    stopClips();
    if (!Speech?.speak) return;
    try {
      const { language, matched } = await resolveSpeechLanguage(lang);
      // The device-default-voice fallback in resolveSpeechLanguage assumes a
      // wrong accent beats silence. That holds for Latin script only: an
      // English voice handed Devanagari produces nothing at all. This is the
      // exact failure that made spoken headings English-only, so say so in the
      // log rather than letting it look like the utterance succeeded. The fix
      // for a phrase that reaches this line is to record it — see speakKey().
      if (!matched && DEVANAGARI.test(String(text))) {
        log.voice.warn(
          'speaking Devanagari with a non-matching voice — likely inaudible; add a phrase clip for this string',
          { lang },
        );
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

  const speakClips = useCallback(async (clipNames) => {
    if (Speech?.stop) { try { Speech.stop(); } catch {} }
    await playClips(clipNames, lang).catch(() => {});
  }, [lang]);

  // Digit-by-digit, not grammatical composition. See composeDigits() for why.
  const speakNumber = useCallback(async (n) => {
    if (Speech?.stop) { try { Speech.stop(); } catch {} }
    await playClips(composeDigits(n, lang), lang).catch(() => {});
  }, [lang]);

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

  const stop = useCallback(() => {
    stopClips();
    if (Speech?.stop) try { Speech.stop(); } catch {}
  }, []);

  return { speak, speakKey, speakClips, speakNumber, stop };
}
