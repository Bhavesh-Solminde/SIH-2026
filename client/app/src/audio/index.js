import { Audio } from 'expo-av';
import { composeNumber } from './numbers.js';
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

export async function play(clipName, lang = 'mr') {
  const langMap = CLIPS[lang] ?? CLIPS.mr;
  const source = langMap[clipName];
  if (source == null) return;

  await ensureAudioMode();

  let sound;
  try {
    ({ sound } = await Audio.Sound.createAsync(source));
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
    await sound?.unloadAsync().catch(() => {});
  }
}

export { composeNumber } from './numbers.js';
export { CLIPS } from './clips.js';
