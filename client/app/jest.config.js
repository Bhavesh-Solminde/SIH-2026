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
    // Sets BABEL_ENV=rn-test so babel.config.js selects "babel-preset-expo"
    // instead of the node-test path, which correctly inlines EXPO_OS and
    // makes jest-expo's setup.js work properly.
    // -----------------------------------------------------------------------
    {
      displayName: "components",
      preset: "jest-expo/android",
      testMatch: [
        "<rootDir>/test/i18n/useStrings.test.js",
        "<rootDir>/test/ui/**/*.test.js",
        "<rootDir>/test/components/**/*.test.js",
      ],
      // Tell babel.config.js to use babel-preset-expo (not @babel/preset-env).
      testEnvironmentOptions: {},
      globals: {
        "babel-jest": { BABEL_ENV: "rn-test" },
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

