import { prisma } from "../../src/lib/db";
import { FakeSourceAdapter, type FakeFixtures } from "../../src/sources/fake";
import type { SourceSeriesSummary } from "../../src/sources/types";
import { ensureSource, ingestSeries, type IngestDeps } from "../../src/ingest/catalog";
import { expect, test } from "../support/db";

const academia: SourceSeriesSummary = {
  externalId: "academia",
  title: "Academia de la Ascensión",
  coverUrl: "https://media.example/academia.webp",
  url: "/series/academia",
  status: "ongoing",
};

/** Fixtures propias de la ingesta; el contrato tiene las suyas. */
function fixtures(): FakeFixtures {
  return {
    search: { "": { first: { items: [academia] } } },
    series: {
      academia: {
        ...academia,
        synopsis: "Una academia de magia.",
        genres: ["Acción"],
        authors: ["Autora Uno"],
        year: 2024,
      },
    },
    chapters: {
      academia: [1, 2, 3].map((n) => ({
        externalId: `capitulo-${n}`,
        number: n,
        publishedAt: new Date(`2026-01-0${n}T00:00:00.000Z`),
        url: `/series/academia/capitulo/capitulo-${n}`,
      })),
    },
    pages: {},
  };
}

function deps(f: FakeFixtures = fixtures()) {
  const events: Array<Record<string, unknown>> = [];
  const value: IngestDeps = {
    db: prisma,
    source: new FakeSourceAdapter(f),
    log: (event) => events.push(event),
  };
  return { deps: value, events };
}

test("ingestSeries crea la Serie con detalle, slug derivado y últimos Capítulos", async () => {
  const { deps: d } = deps();
  const sourceRow = await ensureSource(prisma, "fake");
  const { seriesId, created } = await ingestSeries(d, sourceRow, academia);
  expect(created).toBe(true);

  const serie = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    include: { chapters: true },
  });
  expect(serie.slug).toBe("academia-de-la-ascension");
  expect(serie.titleNormalized).toBe("academia de la ascension");
  expect(serie.synopsis).toBe("Una academia de magia.");
  expect(serie.genres).toEqual(["Acción"]);
  expect(serie.authors).toEqual(["Autora Uno"]);
  expect(serie.year).toBe(2024);
  expect(serie.status).toBe("ONGOING");
  expect(serie.coverSourceUrl).toBe(academia.coverUrl);
  expect(serie.chapters).toHaveLength(3);

  const vinculo = await prisma.seriesSource.findFirstOrThrow({ where: { seriesId } });
  expect(vinculo.externalId).toBe(academia.externalId);
  expect(vinculo.url).toBe(academia.url);
  // El backfill no marca la sincronización completa (v1.md).
  expect(vinculo.chaptersSyncedAt).toBeNull();
});

test("reejecutar sobre una Serie con Capítulos no pide detalle ni duplica filas", async () => {
  const { deps: primera } = deps();
  const sourceRow = await ensureSource(prisma, "fake");
  await ingestSeries(primera, sourceRow, academia);

  // Un adapter sin detalle ni capítulos: si se pidieran, lanzaría NOT_FOUND.
  const vacio = new FakeSourceAdapter({ search: {}, series: {}, chapters: {}, pages: {} });
  const { deps: segunda } = deps();
  const resumenCambiado: SourceSeriesSummary = {
    ...academia,
    title: "Academia de la Ascensión II",
    coverUrl: "https://media.example/academia-2.webp",
    status: "completed",
  };
  const { created } = await ingestSeries(
    { ...segunda, source: vacio },
    sourceRow,
    resumenCambiado,
  );
  expect(created).toBe(false);

  const serie = await prisma.series.findFirstOrThrow();
  expect(serie.title).toBe("Academia de la Ascensión II");
  expect(serie.titleNormalized).toBe("academia de la ascension ii");
  expect(serie.coverSourceUrl).toBe("https://media.example/academia-2.webp");
  expect(serie.status).toBe("COMPLETED");
  // El slug es estable aunque cambie el título; el detalle no se re-pide.
  expect(serie.slug).toBe("academia-de-la-ascension");
  expect(serie.genres).toEqual(["Acción"]);
  expect(serie.synopsis).toBe("Una academia de magia.");
  expect(await prisma.series.count()).toBe(1);
  expect(await prisma.seriesSource.count()).toBe(1);
  expect(await prisma.chapter.count()).toBe(3);
});

test("una Serie existente sin Capítulos recibe detalle y primera página", async () => {
  const { deps: d } = deps();
  const sourceRow = await ensureSource(prisma, "fake");
  const serie = await prisma.series.create({
    data: {
      slug: "academia-de-la-ascension",
      title: academia.title,
      titleNormalized: "academia de la ascension",
      status: "ONGOING",
    },
  });
  await prisma.seriesSource.create({
    data: {
      seriesId: serie.id,
      sourceId: sourceRow.id,
      externalId: academia.externalId,
    },
  });

  const { seriesId, created } = await ingestSeries(d, sourceRow, academia);
  expect(created).toBe(false);
  expect(seriesId).toBe(serie.id);
  expect(await prisma.chapter.count({ where: { seriesId } })).toBe(3);
  const actualizada = await prisma.series.findUniqueOrThrow({ where: { id: serie.id } });
  expect(actualizada.genres).toEqual(["Acción"]);
  expect(await prisma.series.count()).toBe(1);
});

test("dos Series con el mismo título reciben slugs distintos y conservan su identidad", async () => {
  const repetido = (externalId: string): SourceSeriesSummary => ({
    externalId,
    title: "Título Repetido",
    url: `/series/${externalId}`,
  });
  const f = fixtures();
  for (const id of ["a", "b"]) {
    f.series[id] = { ...repetido(id), genres: [], authors: [] };
    f.chapters[id] = [
      { externalId: "capitulo-1", number: 1, url: `/series/${id}/capitulo/capitulo-1` },
    ];
  }
  const { deps: d } = deps(f);
  const sourceRow = await ensureSource(prisma, "fake");

  const primera = await ingestSeries(d, sourceRow, repetido("a"));
  const segunda = await ingestSeries(d, sourceRow, repetido("b"));
  const slugs = await Promise.all(
    [primera.seriesId, segunda.seriesId].map(async (id) => {
      const serie = await prisma.series.findUniqueOrThrow({ where: { id } });
      return serie.slug;
    }),
  );
  expect(slugs).toEqual(["titulo-repetido", "titulo-repetido-2"]);

  const vinculos = await prisma.seriesSource.findMany({ orderBy: { externalId: "asc" } });
  expect(vinculos.map((v) => v.externalId)).toEqual(["a", "b"]);
});

test("Capítulos con number null se omiten con log y los números repetidos no rompen la pasada", async () => {
  const f = fixtures();
  f.chapters.academia = [
    { externalId: "capitulo-5", number: 5, url: "/series/academia/capitulo/capitulo-5" },
    { externalId: "especial", number: null, url: "/series/academia/capitulo/especial" },
    { externalId: "capitulo-5-bis", number: 5, url: "/series/academia/capitulo/capitulo-5-bis" },
  ];
  const { deps: d, events } = deps(f);
  const sourceRow = await ensureSource(prisma, "fake");
  const { seriesId } = await ingestSeries(d, sourceRow, academia);

  const capitulos = await prisma.chapter.findMany({ where: { seriesId } });
  expect(capitulos).toHaveLength(1);
  expect(capitulos[0].number).toBe(5);
  expect(events).toContainEqual(
    expect.objectContaining({ event: "chapter-skipped", reason: "number-null" }),
  );
  expect(events).toContainEqual(expect.objectContaining({ event: "chapter-duplicate" }));
});
