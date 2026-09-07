import { Audio } from 'expo-av';
import { composeNumber, composeDigits } from './numbers.js';
import { CLIPS } from './clips.js';

let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
  } catch {}
}

// ---------------------------------------------------------------------------
// Playback serialisation
//
// Clips used to be fired with `composeNumber(n).forEach(play)`, which starts
// every clip in the same tick — "twenty" and "three" played on top of each
// other. Worse, the next keypress started its own overlapping set while the
// previous one was still sounding, which is what made the quantity keypad
// read out a jumble of the old and new numbers at once.
//
// Everything now goes through one queue with a generation counter. Starting a
// new sequence cancels the one in flight: the latest thing the collector
// pressed is the only thing they hear.
// ---------------------------------------------------------------------------
let generation = 0;
let activeSound = null;

async function unloadActive() {
  const sound = activeSound;
  activeSound = null;
  if (!sound) return;
  try { await sound.stopAsync(); } catch {}
  try { await sound.unloadAsync(); } catch {}
}

/** Cancel whatever clip sequence is currently playing. Safe to call anytime. */
export async function stopClips() {
  generation += 1;
  await unloadActive();
}

async function playOne(clipName, lang, myGeneration) {
  const langMap = CLIPS[lang] ?? CLIPS.mr;
  const source = langMap[clipName];
  if (source == null) return;

  await ensureAudioMode();
  if (myGeneration !== generation) return;

  let sound;
  try {
    ({ sound } = await Audio.Sound.createAsync(source));
    if (myGeneration !== generation) {
      await sound.unloadAsync().catch(() => {});
      return;
    }
    activeSound = sound;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish || s.error) finish();
      });
      // Safety cap: resolve after 10 s even if callback never fires
      sound.playAsync().then(() => setTimeout(finish, 10_000)).catch(finish);
    });
  } catch {
    // Audio is enhancement only — fail silently
  } finally {
    if (activeSound === sound) activeSound = null;
    await sound?.unloadAsync().catch(() => {});
  }
}

/**
 * Play a single clip, cancelling anything already sounding.
 * Kept for callers that speak one word (a category name, a condition).
 */
export async function play(clipName, lang = 'mr') {
  return playClips([clipName], lang);
}

/**
 * Play clips in order, one after another. Cancels any sequence already in
 * flight, so the newest request always wins.
 *
 * @param {string[]} clipNames
 * @param {'mr'|'hi'} lang
 */
export async function playClips(clipNames, lang = 'mr') {
  generation += 1;
  const myGeneration = generation;
  await unloadActive();

  for (const name of clipNames) {
    if (myGeneration !== generation) return;
    await playOne(name, lang, myGeneration);
  }
}

export { composeNumber, composeDigits } from './numbers.js';
export { CLIPS } from './clips.js';
