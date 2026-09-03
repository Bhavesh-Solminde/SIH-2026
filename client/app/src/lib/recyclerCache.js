/**
 * Recycler rate cache for the collector app.
 *
 * Stores the full /public/rates response (rates with lat, lng,
 * materialsAccepted, authorizationStatus) so the app works offline
 * after first load.
 *
 * Storage: AsyncStorage (persists across app restarts) with in-memory
 * fallback (persists for the current session).
 *
 * TTL: 24 hours. Stale cache is still used as fallback when API is
 * unreachable (better than showing nothing).
 */

const CACHE_KEY = 'bhaav_recycler_v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Attempt to load AsyncStorage — gracefully absent if not installed.
let AsyncStorage = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // Not installed — use in-memory only
}

// In-memory fallback (survives screen navigations but not app restarts)
let _mem = null;

export async function getCachedRates() {
  // Try AsyncStorage first (persistent)
  if (AsyncStorage) {
    try {
      const json = await AsyncStorage.getItem(CACHE_KEY);
      if (json) return JSON.parse(json);
    } catch { /* ignore */ }
  }
  // Fall back to in-memory
  return _mem;
}

export async function setCachedRates(payload) {
  // payload = { cachedAt: ISO string, rates: [...] }
  _mem = payload;
  if (AsyncStorage) {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }
  }
}

export function isCacheStale(cache) {
  if (!cache?.cachedAt) return true;
  return Date.now() - new Date(cache.cachedAt).getTime() > CACHE_TTL_MS;
}

export function cacheAgeMinutes(cache) {
  if (!cache?.cachedAt) return null;
  return Math.floor((Date.now() - new Date(cache.cachedAt).getTime()) / 60_000);
}

