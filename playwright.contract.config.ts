import { defineConfig } from "@playwright/test";

/** Contrato del SourceAdapter y cableado del registry: sin app, sin DB y sin red. */
export default defineConfig({
  testDir: "./tests/contract",
  reporter: "list",
});
