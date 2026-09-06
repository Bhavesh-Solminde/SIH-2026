import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    // Playwright owns test/e2e/*.spec.js and runs them in a real browser.
    // Without an explicit scope vitest also collects them, and they fail every
    // run on Playwright-only globals — noise that hides real failures.
    include: ["test/**/*.test.{js,jsx}"],
    exclude: ["node_modules/**", "test/e2e/**"],
  },
});
