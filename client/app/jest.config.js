/** @type {import('jest').Config} */
module.exports = {
  projects: [
    // -----------------------------------------------------------------------
    // node — DB, core-wiring tests (A01–A03)
    // -----------------------------------------------------------------------
    {
      displayName: "node",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/test/core-wiring.test.js",
        "<rootDir>/test/db/**/*.test.js",
      ],
      // test/db/repos.test.js pulls in src/db/repos/lots.js -> src/lib/logger.js,
      // which reads the RN/Metro global __DEV__ at module-load time. This
      // project's plain node testEnvironment never defines it (unlike the
      // "components" project's jest-expo preset), so the suite died before a
      // single test ran with "ReferenceError: __DEV__ is not defined".
      globals: {
        __DEV__: false,
      },
      transform: {
        "^.+\\.[jt]sx?$": [
          "babel-jest",
          {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: { node: "current" },
                  modules: "commonjs",
                },
              ],
            ],
          },
        ],
      },
      transformIgnorePatterns: [
        // Transform @bhaav/core (ESM) — everything else in node_modules stays as-is
        "node_modules/(?!(@bhaav/core))",
      ],
      moduleNameMapper: {
        "\\.(m4a|mp3|png|jpg)$": "<rootDir>/test/__mocks__/fileMock.js",
      },
      moduleDirectories: ["node_modules"],
    },

    // -----------------------------------------------------------------------
    // unit — pure-JS logic tests that don't need a React Native runtime
    // (A04 number composition, A05 string table)
    // -----------------------------------------------------------------------
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/test/audio/**/*.test.js",
        "<rootDir>/test/i18n/strings.test.js",
        "<rootDir>/test/lib/**/*.test.js",
      ],
      transform: {
        "^.+\\.[jt]sx?$": [
          "babel-jest",
          {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: { node: "current" },
                  modules: "commonjs",
                },
              ],
            ],
          },
        ],
      },
      transformIgnorePatterns: [
        "node_modules/(?!(@bhaav/core))",
      ],
      moduleNameMapper: {
        "\\.(m4a|mp3|png|jpg)$": "<rootDir>/test/__mocks__/fileMock.js",
      },
      moduleDirectories: ["node_modules"],
    },

    // -----------------------------------------------------------------------
    // screens — A08-A21 screen and sync engine tests
    // Pure logic tests: no React Native runtime needed. Screens render nothing
    // that requires a real RN environment (mocked or trivial assertions).
    // JSX screen tests that use @testing-library/react-native go to 'components'.
    // -----------------------------------------------------------------------
    {
      displayName: "screens",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/test/screens/**/*.test.js",
      ],
      // test/screens/SyncEngine.test.js requires src/screens/SyncEngine.js ->
      // src/lib/logger.js, which reads the RN/Metro global __DEV__ at
      // module-load time. Same cause as the "node" project above and unrelated
      // to the Flow-transform failure in "components" — this project's plain
      // node testEnvironment never defines __DEV__.
      globals: {
        __DEV__: false,
      },
      transform: {
        "^.+\\.[jt]sx?$": [
          "babel-jest",
          {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: { node: "current" },
                  modules: "commonjs",
                },
              ],
              ["@babel/preset-react"],
            ],
          },
        ],
      },
      transformIgnorePatterns: [
        "node_modules/(?!(@bhaav/core))",
      ],
      moduleNameMapper: {
        "\\.(m4a|mp3|png|jpg)$": "<rootDir>/test/__mocks__/fileMock.js",
        // Mock React Native modules not available in node env
        "^react-native$": "<rootDir>/test/__mocks__/react-native.js",
        "^react-native/(.*)$": "<rootDir>/test/__mocks__/react-native.js",
        "^@react-navigation/(.*)$": "<rootDir>/test/__mocks__/react-native.js",
        "^expo-(.*)$": "<rootDir>/test/__mocks__/fileMock.js",
      },
      moduleDirectories: ["node_modules"],
    },

    // -----------------------------------------------------------------------
    // components — React Native / Expo component tests
    // (A05 useStrings hook, A06 Button + Text, A07 CategoryIcon)
    //
    // Uses jest-expo/android preset for the RN test environment and setupFiles.
    // -----------------------------------------------------------------------
    {
      displayName: "components",
      preset: "jest-expo/android",
      // Jest auto-applies ANY `__mocks__/<pkg>.js` file found while crawling
      // a project's `roots` as a manual mock for a same-named node_modules
      // package — no `jest.mock()` call needed, and this bypasses the
      // "screens" project's own explicit moduleNameMapper scoping entirely.
      // Since `roots` defaults to the whole `<rootDir>`, this project was
      // picking up `test/__mocks__/react-native.js` (a deliberately minimal
      // fake built for the "screens" project's plain-node tests: 20 exports,
      // no Modal/Switch/many others) and silently substituting it for the
      // real `react-native` package here too. `detectHostComponentNames`
      // renders View+Text+TextInput+Image+Switch+ScrollView+Modal in one
      // tree to auto-detect RN's host component names; with the fake
      // react-native in place, `Switch` and `Modal` were `undefined`, so
      // React threw "Element type is invalid ... got: undefined" for every
      // render() call in all four suites here — regardless of whether the
      // component under test used Switch or Modal at all. Scoping `roots` to
      // this project's own test/source directories (excluding
      // `test/__mocks__`) keeps Jest's mock-discovery crawl from ever seeing
      // that file, so `require("react-native")` resolves to the real
      // package, as jest-expo/android's setupFiles (react-native/jest/setup.js
      // + jest-expo/src/preset/setup.js) expect.
      roots: [
        "<rootDir>/src",
        "<rootDir>/test/ui",
        "<rootDir>/test/components",
        "<rootDir>/test/i18n",
      ],
      testMatch: [
        "<rootDir>/test/i18n/useStrings.test.js",
        "<rootDir>/test/ui/**/*.test.js",
        "<rootDir>/test/components/**/*.test.js",
      ],
      testEnvironmentOptions: {},
      // No `transform` override here on purpose. jest-expo/android's own
      // preset (node_modules/jest-expo/jest-preset.js) already wires up its
      // own babel-jest transform for this project — an earlier attempt
      // additionally set a project-level `transform` key to force
      // `{ presets: ["babel-preset-expo"] }`, fully replacing that transform
      // key from the preset (project config keys always win over a preset's
      // same key; note this project deliberately never sets `setupFiles`, so
      // the preset's setupFiles were never at risk of being replaced this
      // way — that hypothesis was checked and ruled out). Confirmed
      // experimentally: removing that override while keeping the preset
      // reintroduced the original Flow-parse crash ("error-guard.js: Missing
      // semicolon"), because babel.config.js selected its @babel/preset-env
      // branch under jest's NODE_ENV=test for this project too. The correct
      // fix is in babel.config.js, not here: it now branches on
      // `api.caller(...caller.name === "metro")`, which is true only when
      // jest-expo/android's own transform invokes it (it always passes a
      // `metro` caller) — so this project reliably gets babel-preset-expo via
      // the preset's own transform, with no override needed, while the other
      // projects' inline `transform:` configs (default "babel-jest" caller)
      // keep getting @babel/preset-env. That fix alone was not sufficient:
      // see the `roots` comment above for the second, independent cause of
      // the `detectHostComponentNames` failures.
      transformIgnorePatterns: [
        // Transform react-native, expo, and @bhaav/core (all ship ESM or Flow/TS).
        "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@bhaav/core|react-navigation|@react-navigation))",
        "/node_modules/react-native-reanimated/plugin/",
        "/node_modules/@react-native/babel-preset/",
      ],
      moduleNameMapper: {
        "\\.(m4a|mp3|png|jpg)$": "<rootDir>/test/__mocks__/fileMock.js",
      },
      moduleDirectories: ["node_modules"],
    },
  ],
};

