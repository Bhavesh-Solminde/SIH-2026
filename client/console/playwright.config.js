import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});

