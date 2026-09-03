import { useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { play, composeNumber } from '../audio';

let Speech = null;
try { Speech = require('expo-speech'); } catch {}

const LANG_CODE = { mr: 'mr-IN', hi: 'hi-IN', en: 'en-IN' };

/**
 * useVoice — unified voice output hook.
 *
 * speak(text)           TTS a plain string (screen name, label, status)
 * speakClips(names)     Play pre-recorded audio clips in sequence
 * speakNumber(n)        Compose + play number clips (e.g. 1500 → "one thousand five hundred")
 * stop()                Stop any ongoing TTS
 *
 * Falls back silently when expo-speech isn't installed.
 */
export function useVoice() {
  const { lang } = useLanguage();

  const speak = useCallback((text) => {
    if (!Speech?.speak) return;
    try {
      Speech.stop();
      Speech.speak(String(text), {
        language: LANG_CODE[lang] ?? 'mr-IN',
        rate: 0.85,
        onError: () => {},
      });
    } catch {}
  }, [lang]);

  const speakClips = useCallback(async (clipNames) => {
    for (const name of clipNames) {
      await play(name, lang).catch(() => {});
    }
  }, [lang]);

  const speakNumber = useCallback(async (n) => {
    const clips = composeNumber(Math.round(Number(n)), lang);
    for (const clip of clips) {
      await play(clip, lang).catch(() => {});
    }
  }, [lang]);

  const stop = useCallback(() => {
    if (Speech?.stop) try { Speech.stop(); } catch {}
  }, []);

  return { speak, speakClips, speakNumber, stop };
}
