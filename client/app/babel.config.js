module.exports = function (api) {
  // Cache the configuration - improves build performance
  api.cache(true);

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
