import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test in this package shares one bhaav_test database. Parallel
    // files would truncate each other's fixtures mid-assertion.
    fileParallelism: false,
    setupFiles: ["./test/setup.js"],
    testTimeout: 15_000,
  },
});
