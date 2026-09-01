/** @type {import('jest').Config} */
module.exports = {
  projects: [
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
  ],
};
