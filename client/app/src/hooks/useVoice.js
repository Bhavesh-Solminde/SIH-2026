import { useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { playClips, stopClips, composeDigits } from '../audio';
import { log } from '../lib/logger';

let Speech = null;
try { Speech = require('expo-speech'); } catch {}

const LANG_CODE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

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
// constraint entirely so the OS uses whatever voice it does have — the
// wrong-language accent reading the text is still audible feedback, which
// is what the product brief cares about; true silence is the actual failure.
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
  if (hasMatch) return wanted;

  if (!warnedMissingLang.has(wanted)) {
    warnedMissingLang.add(wanted);
    log.voice.warn('no installed TTS voice for language — falling back to device default', {
      wanted,
      installed: voices.map((v) => v.language),
    });
  }
  return undefined; // no `language` option → OS default voice, so something is heard
}

/**
 * useVoice — unified voice output hook.
 *
 * speak(text)           TTS a plain string (screen name, label, status)
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

  const speak = useCallback(async (text) => {
    stopClips();
    if (!Speech?.speak) return;
    try {
      const language = await resolveSpeechLanguage(lang);
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

  const stop = useCallback(() => {
    stopClips();
    if (Speech?.stop) try { Speech.stop(); } catch {}
  }, []);

  return { speak, speakClips, speakNumber, stop };
}
