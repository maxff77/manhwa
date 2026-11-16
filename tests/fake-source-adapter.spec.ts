import { expect, test } from "@playwright/test";

import { FakeSourceAdapter, type FakeFixtures } from "../src/sources/fake";
import { SourceError } from "../src/sources/types";

const fixtures: FakeFixtures = {
  search: {
    "": {
      first: {
        items: [
          { externalId: "academia", title: "Academia de la Ascensión", url: "/series/academia" },
        ],
        nextCursor: "2",
      },
      "2": { items: [] },
    },
  },
  series: {
    academia: {
      externalId: "academia",
      title: "Academia de la Ascensión",
      url: "/series/academia",
      synopsis: "Una academia de magia.",
      status: "ongoing",
      genres: ["Acción"],
      authors: ["Autor"],
      year: 2024,
    },
  },
  chapters: {
    academia: [
      {
        externalId: "capitulo-1",
        number: 1,
        title: "El inicio",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        url: "/series/academia/capitulo/capitulo-1",
      },
      {
        externalId: "capitulo-2",
        number: null,
        publishedAt: new Date("2026-01-02T00:00:00.000Z"),
        url: "/series/academia/capitulo/capitulo-2",
      },
      {
        externalId: "capitulo-3",
        number: 3,
        publishedAt: new Date("2026-01-03T00:00:00.000Z"),
        url: "/series/academia/capitulo/capitulo-3",
      },
    ],
  },
  pages: {
    "academia/capitulo-1": [
      { position: 0, url: "https://media.example/1.webp" },
      { position: 1, url: "https://media.example/2.webp" },
    ],
  },
};

const adapter = new FakeSourceAdapter(fixtures);

test("search devuelve la página y el cursor de fixtures", async () => {
  const first = await adapter.search("");

  expect(first.items.map((item) => item.externalId)).toEqual(["academia"]);
  expect(first.nextCursor).toBe("2");

  const second = await adapter.search("", "2");

  expect(second.items).toEqual([]);
  expect(second.nextCursor).toBeUndefined();
});

test("getSeries devuelve el detalle y lanza NOT_FOUND si no existe", async () => {
  const series = await adapter.getSeries("academia");

  expect(series.genres).toEqual(["Acción"]);
  expect(series.authors).toEqual(["Autor"]);

  await expect(adapter.getSeries("inexistente")).rejects.toMatchObject({
    name: "SourceError",
    kind: "NOT_FOUND",
  });
  await expect(adapter.getSeries("inexistente")).rejects.toBeInstanceOf(SourceError);
});

test("listChapters conserva el orden de la Fuente y el número no parseable", async () => {
  const chapters = await adapter.listChapters("academia");

  expect(chapters.map((chapter) => chapter.externalId)).toEqual([
    "capitulo-1",
    "capitulo-2",
    "capitulo-3",
  ]);
  expect(chapters[1]?.number).toBeNull();
});

test("listRecentChapters devuelve los más recientes primero", async () => {
  const page = await adapter.listRecentChapters("academia");

  expect(page.items.map((chapter) => chapter.externalId)).toEqual([
    "capitulo-3",
    "capitulo-2",
    "capitulo-1",
  ]);
  expect(page.nextCursor).toBeUndefined();
});

test("getChapterPages devuelve las Páginas en orden y vacío si no hay listado", async () => {
  const pages = await adapter.getChapterPages("academia", "capitulo-1");

  expect(pages.map((page) => page.position)).toEqual([0, 1]);

  expect(await adapter.getChapterPages("academia", "capitulo-2")).toEqual([]);
});
