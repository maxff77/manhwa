import { defineConfig } from "@playwright/test";

/**
 * Smoke manual contra Olympus (#20): sin app ni DB, pero CON red real.
 * Lo ejecuta una persona con `npm run smoke:olympus`; nunca el agente ni CI.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  reporter: "list",
  workers: 1,
  retries: 0,
});
