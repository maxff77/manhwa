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

/** Identidad de la Serie sin Capítulos usada en el contrato; cada adapter la resuelve a su manera. */
const EMPTY_SERIES_ID = "sin-capitulos";

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
    larga: {
      first: {
        items: [{ externalId: "larga", title: "La Serie Larga", url: "/series/larga" }],
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
 *
 * La identidad externa es propia de cada Fuente (el fake usa slugs cortos,
 * Olympus los suyos con prefijo de tipo), así que la suite deriva las
 * identidades de `search()` y afirma títulos, números y orden: los datos del
 * contrato. Las dos excepciones son casos negativos fijos (`EMPTY_SERIES_ID`
 * para una Serie sin Capítulos y un id inexistente para NOT_FOUND).
 */
export function sourceAdapterContract(
  name: string,
  createAdapter: () => SourceAdapter,
  /** La Fuente expone autores y año en el detalle. Olympus no (#20); el fake sí. */
  expectedDetailFields = true,
) {
  test.describe(name, () => {
    test("search con query vacía recorre el Catálogo y pagina hasta el cursor final", async () => {
      const adapter = createAdapter();

      const first = await adapter.search("");

      expect(first.items.map((series) => series.title)).toEqual([
        "Academia de la Ascensión",
        "Bruma del Norte",
      ]);
      // El cursor es opaco: solo se comprueba que existe y se devuelve tal cual.
      expect(typeof first.nextCursor).toBe("string");

      const second = await adapter.search("", first.nextCursor);

      expect(second.items.map((series) => series.title)).toEqual(["Ceniza y Oro"]);
      expect(second.nextCursor).toBeUndefined();
    });

    test("search con query devuelve los resultados de la Fuente", async () => {
      const page = await createAdapter().search("academia");

      expect(page.items.map((series) => series.title)).toEqual(["Academia de la Ascensión"]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("search sin resultados devuelve una página vacía", async () => {
      const page = await createAdapter().search("zzz-sin-resultados");

      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("getSeries devuelve todos los campos del detalle", async () => {
      // Literales independientes de las fixtures a propósito: el fake devuelve el
      // objeto de fixtures, así que afirmar contra él pasaría por construcción.
      const adapter = createAdapter();
      const [summary] = (await adapter.search("academia")).items;
      const detail = await adapter.getSeries(summary.externalId);

      expect(detail.externalId).toBe(summary.externalId);
      expect(detail.title).toBe("Academia de la Ascensión");
      expect(detail.synopsis).toBe("Una academia de magia.");
      expect(detail.status).toBe("ongoing");
      expect(detail.genres).toEqual(["Acción", "Fantasía"]);
      // La portada es una URL absoluta; el Catálogo puede no anunciarla.
      expect(detail.coverUrl?.startsWith("https://")).toBe(true);
      if (summary.coverUrl !== undefined) {
        expect(detail.coverUrl).toBe(summary.coverUrl);
      }
      expect(detail.url.endsWith(`/series/${summary.externalId}`)).toBe(true);
      // El detalle conserva lo que el Catálogo ya anunció; autores y año son
      // opcionales porque no toda Fuente los expone (Olympus no).
      if (summary.status !== undefined) {
        expect(detail.status).toBe(summary.status);
      }
      // Autores y año: la fixture los declara, así que el adapter debe devolverlos.
      // Olympus no los expone y su spec lo registra como desviación (#20).
      if (expectedDetailFields) {
        expect(detail.authors).toEqual(["Autora Uno"]);
        expect(detail.year).toBe(2024);
      } else {
        expect(detail.authors).toEqual([]);
        expect(detail.year).toBeUndefined();
      }
    });

    test("getSeries admite los campos opcionales ausentes", async () => {
      const catalog = await createAdapter().search("");
      const bruma = catalog.items.find((series) => series.title === "Bruma del Norte");
      const series = await createAdapter().getSeries(bruma!.externalId);

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
      const [summary] = (await createAdapter().search("academia")).items;
      const chapters = await createAdapter().listChapters(summary.externalId);

      expect(chapters.map((chapter) => chapter.number)).toEqual([1, null, 3, 3]);
      // La identidad es el segmento de la URL, no el número parseado: el
      // duplicado y el no numérico conservan segmentos distintos.
      expect(new Set(chapters.map((chapter) => chapter.externalId)).size).toBe(4);
      for (const chapter of chapters) {
        expect(
          chapter.url.endsWith(`/series/${summary.externalId}/capitulo/${chapter.externalId}`),
        ).toBe(true);
      }
    });

    test("listRecentChapters devuelve los más recientes primero con cursor final", async () => {
      const adapter = createAdapter();
      const [summary] = (await adapter.search("academia")).items;

      const page = await adapter.listRecentChapters(summary.externalId);
      const asc = await adapter.listChapters(summary.externalId);

      expect(page.items.map((chapter) => chapter.externalId)).toEqual(
        [...asc].reverse().map((chapter) => chapter.externalId),
      );
      expect(page.nextCursor).toBeUndefined();
    });

    test("listRecentChapters pagina con cursor hasta el final", async () => {
      const adapter = createAdapter();
      const larga = (await adapter.search("larga")).items[0];

      const first = await adapter.listRecentChapters(larga.externalId);

      expect(first.items).toHaveLength(40);
      expect(first.items.map((chapter) => chapter.number)).toEqual(
        Array.from({ length: 40 }, (_, i) => 45 - i),
      );
      expect(typeof first.nextCursor).toBe("string");

      const second = await adapter.listRecentChapters(larga.externalId, first.nextCursor);

      expect(second.items).toHaveLength(5);
      expect(second.items.map((chapter) => chapter.number)).toEqual([5, 4, 3, 2, 1]);
      expect(second.nextCursor).toBeUndefined();
    });

    test("listRecentChapters admite una Serie sin Capítulos como página vacía", async () => {
      // Una Serie que existe y no tiene Capítulos es una página vacía; una que
      // no existe es NOT_FOUND (lo cubre getSeries).
      const page = await createAdapter().listRecentChapters(EMPTY_SERIES_ID);

      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });

    test("getChapterPages devuelve las Páginas en orden con position 0-based", async () => {
      const adapter = createAdapter();
      const [summary] = (await adapter.search("academia")).items;
      const [firstChapter] = await adapter.listChapters(summary.externalId);

      const pages = await adapter.getChapterPages(summary.externalId, firstChapter.externalId);

      expect(pages.map((page) => page.position)).toEqual([0, 1]);
      expect(pages.every((page) => page.url.startsWith("https://"))).toBe(true);
      expect(new Set(pages.map((page) => page.url)).size).toBe(2);
    });

    test("getChapterPages admite un Capítulo vacío", async () => {
      const adapter = createAdapter();
      const [summary] = (await adapter.search("academia")).items;
      const chapters = await adapter.listChapters(summary.externalId);
      const empty = chapters.find((chapter) => chapter.number === null)!;

      expect(await adapter.getChapterPages(summary.externalId, empty.externalId)).toEqual([]);
    });

    test("getChapterPages lanza PARSE si falta el listado de Páginas", async () => {
      const adapter = createAdapter();
      const [summary] = (await adapter.search("academia")).items;
      const chapters = await adapter.listChapters(summary.externalId);
      const broken = chapters.find((chapter) => chapter.number === 3)!;

      await expectSourceError(
        adapter.getChapterPages(summary.externalId, broken.externalId),
        "PARSE",
      );
    });
  });
}
