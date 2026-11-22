import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/global-setup.ts',
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    channel: 'chrome',
    headless: true,
  },
  projects: [
    {
      name: 'Serial Settings Tests',
      testMatch: /.*(admin_role|leaderboard|vat_treatment)\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
    {
      name: 'Google Chrome',
      testIgnore: /.*(admin_role|leaderboard|vat_treatment)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
});
