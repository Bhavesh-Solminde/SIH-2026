// AsyncStorage's mock keeps its `__INTERNAL_MOCK_STORAGE__` alive for the
// whole test FILE (module registries are isolated per file, not per test),
// so a write in one `it()` block otherwise leaks into the next one. That bit
// LanguageContext's persistence: a test earlier in the same file called
// setLang('hi') and persisted it; a later test's fresh <LanguageProvider>
// mount then read that stale value back during its own hydration effect and
// applied it asynchronously, after the test had already finished asserting —
// "Warning: ... not wrapped in act(...)" and a real risk of one test's
// language choice bleeding into the next.
//
// Registered as this project's setupFilesAfterEnv, so every test file in the
// "components" project starts each test with clean storage.
afterEach(async () => {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    const AsyncStorage = mod?.default ?? mod;
    await AsyncStorage.clear();
  } catch {
    // AsyncStorage not mocked/available for this project — nothing to clean.
  }
});
