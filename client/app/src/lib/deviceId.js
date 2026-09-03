import { uuidv7 } from '@bhaav/core/ids';

const STORAGE_KEY = 'bhaav_device_id';
let _cached = null;

let AsyncStorage = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

/**
 * Returns a stable UUID that persists across app restarts (via AsyncStorage).
 * Falls back to a session-scoped UUID when AsyncStorage is unavailable.
 * Used as both collectorId and deviceId for lots submitted without local DB.
 */
export async function getDeviceId() {
  if (_cached) return _cached;

  if (AsyncStorage) {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        _cached = stored;
        return _cached;
      }
      const id = uuidv7();
      await AsyncStorage.setItem(STORAGE_KEY, id);
      _cached = id;
      return _cached;
    } catch {}
  }

  _cached = uuidv7();
  return _cached;
}
