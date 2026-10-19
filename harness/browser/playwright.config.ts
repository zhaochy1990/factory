import { defineConfig } from '@playwright/test';
import path from 'node:path';

// Real-stack browser suite. No mocks, no route interception, no vite dev
// server: BASE_URL is the prebuilt admin-dashboard container of the local
// compose stack; DB assertions hit the stack's MySQL over TCP.
//
// Results go to ../results/browser-results.json — the harness report generator
// (harness/report/generate.mjs) renders the qa1 markdown report from it.
// Per-case steps/expected/actual/evidence travel via test.annotations.
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false, // real stack: keep login traffic sequential + rate-limit friendly
  workers: 1,
  retries: 0,
  globalSetup: require.resolve('./global-setup'),
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: path.resolve(__dirname, '../results/browser-results.json') },
    ],
  ],
  use: {
    baseURL: process.env.HARNESS_DASHBOARD_BASE_URL || 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: path.resolve(__dirname, 'test-results'),
});
