import { prisma } from "../../src/lib/db";
import { FakeSourceAdapter, type FakeFixtures } from "../../src/sources/fake";
import {
  SourceError,
  type SourceAdapter,
  type SourceChapterPage,
  type SourceSearchPage,
  type SourceSeriesDetail,
  type SourceSeriesSummary,
} from "../../src/sources/types";
import { backfillCatalog, type IngestDeps } from "../../src/ingest/catalog";
import { expect, test } from "../support/db";

const summaries: SourceSeriesSummary[] = [
  {
    externalId: "academia",
    title: "Academia de la Ascensión",
    coverUrl: "https://media.example/academia.webp",
    url: "/series/academia",
    status: "ongoing",
  },
  {
    externalId: "bruma",
    title: "Bruma del Norte",
    coverUrl: "https://media.example/bruma.webp",
    url: "/series/bruma",
    status: "hiatus",
  },
  {
    externalId: "ceniza",
    title: "Ceniza y Oro",
    coverUrl: "https://media.example/ceniza.webp",
    url: "/series/ceniza",
    status: "completed",
  },
];

/** Dos páginas del Catálogo (2 + 1 Series), detalle y Capítulos para las tres. */
function fixtures(): FakeFixtures {
  const series: Record<string, SourceSeriesDetail> = {};
  const chapters: FakeFixtures["chapters"] = {};
  for (const summary of summaries) {
    series[summary.externalId] = {
      ...summary,
      synopsis: `Sinopsis de ${summary.title}.`,
      genres: ["Acción"],
      authors: [],
    };
    chapters[summary.externalId] = [1, 2].map((n) => ({
      externalId: `capitulo-${n}`,
      number: n,
      publishedAt: new Date(`2026-01-0${n}T00:00:00.000Z`),
      url: `${summary.url}/capitulo/capitulo-${n}`,
    }));
  }
  return {
    search: {
      "": {
        first: { items: summaries.slice(0, 2), nextCursor: "2" },
        "2": { items: summaries.slice(2) },
      },
    },
    series,
    chapters,
    pages: {},
  };
}

function deps(f: FakeFixtures = fixtures(), adapter?: SourceAdapter) {
  const events: Array<Record<string, unknown>> = [];
  const value: IngestDeps = {
    db: prisma,
    source: adapter ?? new FakeSourceAdapter(f),
    log: (event) => events.push(event),
  };
  return { deps: value, events };
}

/** Envuelve el fake y cuenta las operaciones que el refresco no debe repetir. */
function countingAdapter(f: FakeFixtures) {
  const inner = new FakeSourceAdapter(f);
  const spy = {
    slug: inner.slug,
    detailCalls: 0,
    recentCalls: 0,
    search: (query: string, cursor?: string) => inner.search(query, cursor),
    getSeries: (externalId: string) => {
      spy.detailCalls++;
      return inner.getSeries(externalId);
    },
    listChapters: (externalId: string) => inner.listChapters(externalId),
    listRecentChapters: (externalId: string, cursor?: string): Promise<SourceChapterPage> => {
      spy.recentCalls++;
      return inner.listRecentChapters(externalId, cursor);
    },
    getChapterPages: (seriesExternalId: string, chapterExternalId: string) =>
      inner.getChapterPages(seriesExternalId, chapterExternalId),
  };
  return spy;
}

test("backfillCatalog recorre todas las páginas y hace upsert de Source, Series y SeriesSource", async () => {
  const { deps: d, events } = deps();
  const result = await backfillCatalog(d);
  expect(result).toEqual({ pages: 2, processed: 3, failed: 0 });
  expect(await prisma.source.count()).toBe(1);
  expect(await prisma.series.count()).toBe(3);
  expect(await prisma.seriesSource.count()).toBe(3);

  // latestChapter poblado: cada Serie tiene Capítulos con fecha.
  const series = await prisma.series.findMany({ include: { chapters: true } });
  for (const serie of series) {
    expect(serie.chapters.length).toBeGreaterThan(0);
    expect(serie.chapters.every((c) => c.publishedAt !== null)).toBe(true);
  }
  expect(events.filter((e) => e.event === "page")).toHaveLength(2);
  expect(events.filter((e) => e.event === "series-created")).toHaveLength(3);
});

test("reejecutar el backfill no duplica filas ni vuelve a pedir detalle", async () => {
  const { deps: primera } = deps();
  await backfillCatalog(primera);
  const counts = {
    series: await prisma.series.count(),
    links: await prisma.seriesSource.count(),
    chapters: await prisma.chapter.count(),
  };

  const spy = countingAdapter(fixtures());
  const { deps: segunda } = deps(fixtures(), spy);
  const result = await backfillCatalog(segunda);
  expect(result.failed).toBe(0);
  expect(spy.detailCalls).toBe(0);
  expect(spy.recentCalls).toBe(0);
  expect(await prisma.series.count()).toBe(counts.series);
  expect(await prisma.seriesSource.count()).toBe(counts.links);
  expect(await prisma.chapter.count()).toBe(counts.chapters);
});

test("un corte a mitad del catálogo se reanuda sin repetir trabajo", async () => {
  const f = fixtures();
  const sano = new FakeSourceAdapter(f);
  let cortado = true;
  const interrumpido: SourceAdapter = {
    ...sano,
    slug: sano.slug,
    search: (query: string, cursor?: string): Promise<SourceSearchPage> => {
      if (cortado && cursor === "2") {
        throw new SourceError("BLOCKED", "Olympus bloqueó la segunda página");
      }
      return sano.search(query, cursor);
    },
    getSeries: (id: string) => sano.getSeries(id),
    listChapters: (id: string) => sano.listChapters(id),
    listRecentChapters: (id: string, cursor?: string) => sano.listRecentChapters(id, cursor),
    getChapterPages: (s: string, c: string) => sano.getChapterPages(s, c),
  };

  const { deps: primera, events } = deps(f, interrumpido);
  await expect(backfillCatalog(primera)).rejects.toMatchObject({ kind: "BLOCKED" });
  expect(await prisma.series.count()).toBe(2); // la página 1 quedó persistida
  expect(events).toContainEqual(expect.objectContaining({ event: "catalog-failed", kind: "BLOCKED" }));

  cortado = false;
  const spy = countingAdapter(f);
  const { deps: segunda } = deps(f, spy);
  const result = await backfillCatalog(segunda);
  expect(result).toEqual({ pages: 2, processed: 3, failed: 0 });
  expect(await prisma.series.count()).toBe(3);
  expect(await prisma.seriesSource.count()).toBe(3);
  // Solo la Serie que faltaba pidió detalle y Capítulos.
  expect(spy.detailCalls).toBe(1);
  expect(spy.recentCalls).toBe(1);
});

test("un fallo del adapter en una Serie no borra filas y las demás se procesan", async () => {
  const f = fixtures();
  delete f.series.bruma; // getSeries de la Serie del medio → NOT_FOUND
  const { deps: d, events } = deps(f);
  const result = await backfillCatalog(d);
  expect(result.failed).toBe(1);
  expect(result.processed).toBe(2);
  expect(await prisma.series.count()).toBe(2);
  expect(await prisma.chapter.count()).toBe(4);
  expect(events).toContainEqual(
    expect.objectContaining({ event: "series-failed", externalId: "bruma", kind: "NOT_FOUND" }),
  );
});

test("el refresco diario actualiza título, portada y estado sin re-pedir detalle de Series con Capítulos", async () => {
  const { deps: inicial } = deps();
  await backfillCatalog(inicial);

  const mutado = fixtures();
  const nuevoTitulo = "Academia de la Ascensión II";
  const nuevaPortada = "https://media.example/academia-2.webp";
  for (const page of Object.values(mutado.search[""])) {
    page.items = page.items.map((item) =>
      item.externalId === "academia"
        ? { ...item, title: nuevoTitulo, coverUrl: nuevaPortada, status: "completed" as const }
        : item,
    );
  }

  const spy = countingAdapter(mutado);
  const { deps: refresco } = deps(mutado, spy);
  await backfillCatalog(refresco);
  expect(spy.detailCalls).toBe(0);
  expect(spy.recentCalls).toBe(0);

  const academia = await prisma.series.findFirstOrThrow({
    where: { sources: { some: { externalId: "academia" } } },
  });
  expect(academia.title).toBe(nuevoTitulo);
  expect(academia.coverSourceUrl).toBe(nuevaPortada);
  expect(academia.status).toBe("COMPLETED");
  // El slug es estable y el detalle previo no se pierde.
  expect(academia.slug).toBe("academia-de-la-ascension");
  expect(academia.genres).toEqual(["Acción"]);
});
