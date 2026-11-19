import { defineConfig, devices } from "@playwright/test";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://manhwa:manhwa@localhost:5433/manhwa_test?schema=public";

process.env.DATABASE_URL = DATABASE_URL;

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/contract/**",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL,
      SOURCE_ADAPTER: "fake",
    },
  },
});
