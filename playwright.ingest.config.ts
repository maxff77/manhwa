import { defineConfig } from "@playwright/test";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://manhwa:manhwa@localhost:5433/manhwa_test?schema=public";
process.env.DATABASE_URL = DATABASE_URL;

/**
 * Tests de ingesta (#21): Postgres real y el adapter falso, sin app levantada.
 * El job no tiene superficie HTTP ni UI, así que no hay `webServer`.
 */
export default defineConfig({
  testDir: "./tests/ingest",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./tests/global-setup.ts",
});
