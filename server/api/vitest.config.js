import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test in this package shares one bhaav_test database. Parallel
    // files would truncate each other's fixtures mid-assertion.
    // singleFork + fileParallelism:false forces all test files to run
    // sequentially in one process — the workspace runner respects this.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    setupFiles: ["./test/setup.js"],
    testTimeout: 15_000,
  },
});
