module.exports = function (api) {
  // jest-expo/android's preset (node_modules/jest-expo/jest-preset.js)
  // resolves this file as an explicit babel `configFile` and calls it with
  // `caller: { name: "metro", bundler: "metro", platform: "ios" }` — the
  // same caller identity a real Metro bundle uses. The other jest projects
  // ("node", "unit", "screens") invoke babel-jest directly with inline
  // `transform` options and no `caller` override, so babel-jest's own
  // default caller name ("babel-jest") applies there instead. That gives us
  // a reliable, environment-variable-free way to tell the "components"
  // project's RN/Expo test runs apart from the plain-node ones, since
  // `NODE_ENV=test` is identical across every jest project and can't be used
  // to distinguish them (a previous `BABEL_ENV=rn-test` scheme relying on
  // jest `globals` never worked, because `globals` only seeds the test VM's
  // global object, not process.env).
  const isMetroCaller = api.caller(
    (caller) => Boolean(caller) && caller.name === "metro"
  );

  // The cache key MUST depend on isMetroCaller: a single worker process
  // handles multiple jest projects, and `api.cache(true)` (unconditional,
  // ignoring arguments) would permanently memoize whichever branch ran
  // first for the lifetime of that worker, silently wrong for every other
  // caller sharing it.
  api.cache.using(() => isMetroCaller);

  // Component tests (A06 Button/Text, A07 CategoryIcon, A05 useStrings hook)
  // and real Metro bundles: use babel-preset-expo so that jest-expo's
  // Flow/RN-typed sources (e.g. @react-native/js-polyfills/error-guard.js)
  // parse, jest-expo's own setup files work correctly, and
  // process.env.EXPO_OS is inlined.
  if (isMetroCaller) {
    return {
      presets: ["babel-preset-expo"],
    };
  }

  // For tests that target the node environment (DB, repo, core-wiring tests),
  // use @babel/preset-env targeting Node. This avoids having to boot
  // the full React Native / jest-expo runtime just to test pure-JS logic.
  if (process.env.BABEL_ENV === "node-test" || process.env.NODE_ENV === "test") {
    return {
      presets: [
        [
          "@babel/preset-env",
          {
            targets: { node: "current" },
            modules: "commonjs",
          },
        ],
      ],
    };
  }

  // For the Expo dev build / Metro bundler
  return {
    presets: ["babel-preset-expo"],
  };
};
