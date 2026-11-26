import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { loadFakeFixtures } from "../../src/sources/fake";

/** El arnés de v1 da datos a la app con `FAKE_FIXTURES_FILE`; las fechas ISO deben revivir a Date. */
test("loadFakeFixtures lee el JSON y revive publishedAt como Date", () => {
  const dir = mkdtempSync(join(tmpdir(), "manhwa-fixtures-"));
  const file = join(dir, "fixtures.json");
  writeFileSync(
    file,
    JSON.stringify({
      search: {},
      series: {
        academia: {
          externalId: "academia",
          title: "Academia de la Ascensión",
          url: "/series/academia",
          genres: ["Acción"],
          authors: [],
        },
      },
      chapters: {
        academia: [
          {
            externalId: "capitulo-1",
            number: 1,
            publishedAt: "2026-01-01T00:00:00.000Z",
            url: "/series/academia/capitulo/capitulo-1",
          },
        ],
      },
      pages: {},
    }),
  );

  const fixtures = loadFakeFixtures(file);

  expect(fixtures.series.academia.title).toBe("Academia de la Ascensión");
  const published = fixtures.chapters.academia[0].publishedAt;
  expect(published).toBeInstanceOf(Date);
  expect(published!.toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
