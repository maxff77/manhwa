import { expect, test } from "@playwright/test";

import type { FakeFixtures } from "../../src/sources/fake";
import {
  SourceError,
  type SourceAdapter,
  type SourceErrorKind,
} from "../../src/sources/types";

/** Un fallo del contrato es siempre un `SourceError` del `kind` pedido. */
export async function expectSourceError(promise: Promise<unknown>, kind: SourceErrorKind) {
  await expect(promise).rejects.toBeInstanceOf(SourceError);
  await expect(promise).rejects.toMatchObject({ kind });
}

const chapter = (n: number) => ({
  externalId: `capitulo-${n}`,
  number: n,
  url: `/series/larga/capitulo/capitulo-${n}`,
});

/** Fixtures canónicas del contrato: cualquier adapter real debe servir estos mismos datos. */
export const contractFixtures: FakeFixtures = {
  search: {
    "": {
      first: {
        items: [
          { externalId: "academia", title: "Academia de la Ascensión", url: "/series/academia" },
          { externalId: "bruma", title: "Bruma del Norte", url: "/series/bruma" },
        ],
        nextCursor: "2",
      },
      "2": {
        items: [{ externalId: "ceniza", title: "Ceniza y Oro", url: "/series/ceniza" }],
      },
    },
    academia: {
      first: {
        items: [
          { externalId: "academia", title: "Academia de la Ascensión", url: "/series/academia" },
        ],
      },
    },
  },
  series: {
    academia: {
      externalId: "academia",
      title: "Academia de la Ascensión",
      coverUrl: "https://media.example/academia.webp",
      url: "/series/academia",
      synopsis: "Una academia de magia.",
      status: "ongoing",
      genres: ["Acción", "Fantasía"],
      authors: ["Autora Uno"],
      year: 2024,
    },
    bruma: {
      externalId: "bruma",
      title: "Bruma del Norte",
      url: "/series/bruma",
      genres: [],
      authors: [],
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
      {
        externalId: "capitulo-3-bis",
        number: 3,
        publishedAt: new Date("2026-01-04T00:00:00.000Z"),
        url: "/series/academia/capitulo/capitulo-3-bis",
      },
    ],
    larga: Array.from({ length: 45 }, (_, i) => chapter(i + 1)),
  },
  pages: {
    "academia/capitulo-1": [
      { position: 0, url: "https://media.example/1.webp" },
      { position: 1, url: "https://media.example/2.webp" },
    ],
    "academia/capitulo-2": [],
  },
};

/**
 * Suite de contrato del `SourceAdapter`: la corre el fake y la correrá cualquier
 * adapter real construido sobre estas mismas fixtures. Sin red y sin DB.
 */
export function sourceAdapterContract(name: string, createAdapter: () => SourceAdapter) {
  test.describe(name, () => {
    test("search con query vacía recorre el Catálogo y pagina hasta el cursor final", async () => {
      const adapter = createAdapter();

      const first = await adapter.search("");

      expect(first.items.map((series) => series.externalId)).toEqual(["academia", "bruma"]);
      // El cursor es opaco: solo se comprueba que existe y se devuelve tal cual.
      expect(typeof first.nextCursor).toBe("string");

      const second = await adapter.search("", first.nextCursor);

      expect(second.items.map((series) => series.externalId)).toEqual(["ceniza"]);
      expect(second.nextCursor).toBeUndefined();
    });

    test("search con query devuelve los resultados de la Fuente", async () => {
      const page = await createAdapter().search("academia");

      expect(page.items.map((series) => series.externalId)).toEqual(["academia"]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("search sin resultados devuelve una página vacía", async () => {
      const page = await createAdapter().search("zzz-sin-resultados");

      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("getSeries devuelve todos los campos del detalle", async () => {
      // Copia independiente de las fixtures a propósito: el fake devuelve el objeto
      // de fixtures, así que afirmar contra él pasaría por construcción.
      expect(await createAdapter().getSeries("academia")).toEqual({
        externalId: "academia",
        title: "Academia de la Ascensión",
        coverUrl: "https://media.example/academia.webp",
        url: "/series/academia",
        synopsis: "Una academia de magia.",
        status: "ongoing",
        genres: ["Acción", "Fantasía"],
        authors: ["Autora Uno"],
        year: 2024,
      });
    });

    test("getSeries admite los campos opcionales ausentes", async () => {
      const series = await createAdapter().getSeries("bruma");

      expect(series.genres).toEqual([]);
      expect(series.authors).toEqual([]);
      expect(series.coverUrl).toBeUndefined();
      expect(series.synopsis).toBeUndefined();
      expect(series.status).toBeUndefined();
      expect(series.year).toBeUndefined();
    });

    test("getSeries lanza NOT_FOUND para una Serie inexistente", async () => {
      await expectSourceError(createAdapter().getSeries("inexistente"), "NOT_FOUND");
    });

    test("listChapters conserva el orden, el número no parseable y el duplicado", async () => {
      const chapters = await createAdapter().listChapters("academia");

      expect(chapters.map((chapter) => chapter.externalId)).toEqual([
        "capitulo-1",
        "capitulo-2",
        "capitulo-3",
        "capitulo-3-bis",
      ]);
      expect(chapters.map((chapter) => chapter.number)).toEqual([1, null, 3, 3]);
    });

    test("listRecentChapters devuelve los más recientes primero con cursor final", async () => {
      const page = await createAdapter().listRecentChapters("academia");

      expect(page.items.map((chapter) => chapter.externalId)).toEqual([
        "capitulo-3-bis",
        "capitulo-3",
        "capitulo-2",
        "capitulo-1",
      ]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("listRecentChapters pagina con cursor hasta el final", async () => {
      const adapter = createAdapter();

      const first = await adapter.listRecentChapters("larga");

      expect(first.items).toHaveLength(40);
      expect(first.items[0]?.externalId).toBe("capitulo-45");
      expect(first.items.at(-1)?.externalId).toBe("capitulo-6");
      expect(typeof first.nextCursor).toBe("string");

      const second = await adapter.listRecentChapters("larga", first.nextCursor);

      expect(second.items).toHaveLength(5);
      expect(second.items[0]?.externalId).toBe("capitulo-5");
      expect(second.items.at(-1)?.externalId).toBe("capitulo-1");
      expect(second.nextCursor).toBeUndefined();
    });

    test("listRecentChapters admite una Serie sin Capítulos como página vacía", async () => {
      const page = await createAdapter().listRecentChapters("serie-inexistente");

      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("getChapterPages devuelve las Páginas en orden con position 0-based", async () => {
      expect(await createAdapter().getChapterPages("academia", "capitulo-1")).toEqual([
        { position: 0, url: "https://media.example/1.webp" },
        { position: 1, url: "https://media.example/2.webp" },
      ]);
    });

    test("getChapterPages admite un Capítulo vacío", async () => {
      expect(await createAdapter().getChapterPages("academia", "capitulo-2")).toEqual([]);
    });

    test("getChapterPages lanza PARSE si falta el listado de Páginas", async () => {
      await expectSourceError(createAdapter().getChapterPages("academia", "capitulo-3"), "PARSE");
    });
  });
}
