import { defineConfig, devices } from "@playwright/test";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://manhwa:manhwa@localhost:5433/manhwa_test?schema=public";

process.env.DATABASE_URL = DATABASE_URL;

// El arnés sirve las Páginas de fixture desde un origen local y la CSP debe
// admitirlo (v1.md). Se fija aquí, no en `webServer.env`: Next hornea los
// headers en `next build` dentro de routes-manifest.json, así que la variable
// tiene que estar presente al construir, no solo al arrancar el servidor.
process.env.TEST_IMAGE_ORIGIN ??= "http://127.0.0.1:* http://localhost:*";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  // El smoke contra Olympus (tests/smoke) usa red real y lo corre una persona:
  // nunca entra en la suite de la app ni en CI. La ingesta (tests/ingest) tiene
  // su propia config sin app levantada (#21).
  testIgnore: ["**/contract/**", "**/smoke/**", "**/ingest/**"],
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
      // El arnés sirve las imágenes de fixture desde un origen local; la CSP
      // lo permite solo con esta variable (v1.md), nunca en producción real.
      TEST_IMAGE_ORIGIN: "http://127.0.0.1:* http://localhost:*",
    },
  },
});
