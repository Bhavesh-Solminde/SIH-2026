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
      testMatch: [
        "<rootDir>/test/i18n/useStrings.test.js",
        "<rootDir>/test/ui/**/*.test.js",
        "<rootDir>/test/components/**/*.test.js",
      ],
      testEnvironmentOptions: {},
      // The previous `globals: { "babel-jest": { BABEL_ENV: "rn-test" } }` here
      // did nothing: jest `globals` only seeds the test VM's global object, it
      // never sets process.env, so babel.config.js's BABEL_ENV check never saw
      // it. Because jest itself sets NODE_ENV=test, babel.config.js's
      // `NODE_ENV === "test"` branch won, giving this project plain
      // @babel/preset-env — which cannot parse the Flow-typed
      // @react-native/js-polyfills sources jest-expo pulls in, and every suite
      // here died at transform time with "error-guard.js: Missing semicolon
      // (14:4)" without running a single test. Setting the transform directly
      // to babel-preset-expo (which understands Flow/RN sources) fixes this
      // regardless of what babel.config.js's env-based branching does.
      transform: {
        "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
      },
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

