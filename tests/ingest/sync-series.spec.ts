import { prisma } from "../../src/lib/db";
import { FakeSourceAdapter, type FakeFixtures } from "../../src/sources/fake";
import { SourceError, type SourceSeriesSummary } from "../../src/sources/types";
import { ensureSource, syncSeries, type IngestDeps } from "../../src/ingest/catalog";
import { expect, test } from "../support/db";

const academia: SourceSeriesSummary = {
  externalId: "academia",
  title: "Academia de la Ascensión",
  coverUrl: "https://media.example/academia.webp",
  url: "/series/academia",
  status: "ongoing",
};

function fixtures(): FakeFixtures {
  return {
    search: {},
    series: {
      academia: {
        ...academia,
        synopsis: "Una academia de magia.",
        genres: ["Acción", "Aventura"],
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

/** Serie ya ingerida con su vínculo; el estado de sincronización lo pone cada test. */
async function serieIngerida(chaptersSyncedAt: Date | null) {
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
      chaptersSyncedAt,
    },
  });
  return { sourceRow, serie };
}

test("sincronizar una Serie sin marca pide detalle y la lista completa y marca la fecha", async () => {
  const { serie } = await serieIngerida(null);
  const { deps: d } = deps();

  const antes = Date.now();
  await syncSeries(d, serie.slug);

  const actualizada = await prisma.series.findUniqueOrThrow({ where: { id: serie.id } });
  expect(actualizada.synopsis).toBe("Una academia de magia.");
  expect(actualizada.genres).toEqual(["Acción", "Aventura"]);
  expect(actualizada.authors).toEqual(["Autora Uno"]);
  expect(actualizada.year).toBe(2024);
  expect(await prisma.chapter.count({ where: { seriesId: serie.id } })).toBe(3);

  const vinculo = await prisma.seriesSource.findFirstOrThrow({ where: { seriesId: serie.id } });
  expect(vinculo.chaptersSyncedAt).not.toBeNull();
  expect(vinculo.chaptersSyncedAt!.getTime()).toBeGreaterThanOrEqual(antes);
});

test("re-sincronizar es idempotente: no duplica Capítulos", async () => {
  const { serie } = await serieIngerida(null);
  const { deps: primera } = deps();
  await syncSeries(primera, serie.slug);

  // Vencida a mano para forzar la segunda pasada completa.
  await prisma.seriesSource.updateMany({
    where: { seriesId: serie.id },
    data: { chaptersSyncedAt: new Date(Date.now() - 11 * 60_000) },
  });
  const f = fixtures();
  f.chapters.academia.push({
    externalId: "capitulo-4",
    number: 4,
    publishedAt: new Date("2026-01-04T00:00:00.000Z"),
    url: "/series/academia/capitulo/capitulo-4",
  });
  const { deps: segunda } = deps(f);
  await syncSeries(segunda, serie.slug);

  expect(await prisma.chapter.count({ where: { seriesId: serie.id } })).toBe(4);
  expect(await prisma.series.count()).toBe(1);
});

test("una marca reciente no vuelve a pedir nada a la Fuente", async () => {
  const { serie } = await serieIngerida(new Date(Date.now() - 60_000));
  // Adapter vacío: si se pidiera detalle o Capítulos, lanzaría NOT_FOUND.
  const vacio = new FakeSourceAdapter({ search: {}, series: {}, chapters: {}, pages: {} });
  const events: Array<Record<string, unknown>> = [];

  await syncSeries(
    { db: prisma, source: vacio, log: (event) => events.push(event) },
    serie.slug,
  );

  expect(events).toEqual([]);
  expect(await prisma.chapter.count({ where: { seriesId: serie.id } })).toBe(0);
});

test("un fallo del adapter conserva los datos previos, se registra y no marca la fecha", async () => {
  const { serie } = await serieIngerida(null);
  // Datos previos reales: un Capítulo ya ingerido por el backfill.
  const sourceRow = await prisma.source.findFirstOrThrow({ where: { slug: "fake" } });
  await prisma.chapter.create({
    data: {
      seriesId: serie.id,
      sourceId: sourceRow.id,
      externalId: "capitulo-1",
      number: 1,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  // El detalle responde; la lista completa falla a mitad: nunca lista parcial.
  const f = fixtures();
  const roto = new FakeSourceAdapter(f);
  roto.listChapters = async () => {
    throw new SourceError("UPSTREAM", "corte leyendo el listado");
  };
  const events: Array<Record<string, unknown>> = [];

  await expect(
    syncSeries({ db: prisma, source: roto, log: (event) => events.push(event) }, serie.slug),
  ).rejects.toMatchObject({ name: "SourceError", kind: "UPSTREAM" });

  expect(events).toEqual([
    expect.objectContaining({ event: "series-sync-failed", kind: "UPSTREAM", slug: serie.slug }),
  ]);
  // Lo persistido queda intacto: ni Capítulos nuevos ni borrados, ni fecha marcada.
  const capitulos = await prisma.chapter.findMany({ where: { seriesId: serie.id } });
  expect(capitulos.map((c) => c.externalId)).toEqual(["capitulo-1"]);
  const vinculo = await prisma.seriesSource.findFirstOrThrow({ where: { seriesId: serie.id } });
  expect(vinculo.chaptersSyncedAt).toBeNull();
  const sinTocar = await prisma.series.findUniqueOrThrow({ where: { id: serie.id } });
  expect(sinTocar.synopsis).toBeNull();
});

test("un número repetido en la lista completa no rompe la sincronización ni marca una lista a medias", async () => {
  const { serie } = await serieIngerida(null);
  // La Fuente expone dos Capítulos distintos con el mismo número: la identidad
  // es el externalId, pero `(seriesId, sourceId, number)` también es único.
  const f = fixtures();
  f.chapters.academia.push({
    externalId: "capitulo-3-bis",
    number: 3,
    publishedAt: new Date("2026-01-05T00:00:00.000Z"),
    url: "/series/academia/capitulo/capitulo-3-bis",
  });
  const { deps: d, events } = deps(f);

  await syncSeries(d, serie.slug);

  // Se conserva uno por número y se registra el descartado; la pasada termina.
  expect(await prisma.chapter.count({ where: { seriesId: serie.id } })).toBe(3);
  expect(events).toContainEqual(expect.objectContaining({ event: "chapter-duplicate" }));
  const vinculo = await prisma.seriesSource.findFirstOrThrow({ where: { seriesId: serie.id } });
  expect(vinculo.chaptersSyncedAt).not.toBeNull();
});

test("un Capítulo ya ingerido cuyo número ocupa otro externalId se reidentifica sin perder su Progreso", async () => {
  const { serie, sourceRow } = await serieIngerida(null);
  // El backfill guardó el número 1 bajo otro segmento de URL. La Fuente ahora
  // expone ese número como `capitulo-1`: el upsert por externalId chocaría con
  // `(seriesId, sourceId, number)` y abortaría toda la transacción.
  const viejo = await prisma.chapter.create({
    data: {
      seriesId: serie.id,
      sourceId: sourceRow.id,
      externalId: "segmento-viejo",
      number: 1,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  // Datos de Usuario colgando del Capítulo: borrarlo los arrastraría en cascada.
  const usuario = await prisma.user.create({
    data: { id: "user-sync-23", name: "Lectora", email: "lectora@example.com" },
  });
  await prisma.progress.create({
    data: { userId: usuario.id, seriesId: serie.id, chapterId: viejo.id, page: 7 },
  });
  const { deps: d, events } = deps();

  await syncSeries(d, serie.slug);

  // La fila sobrevive con la identidad vigente: mismo id, Progreso intacto.
  const capitulos = await prisma.chapter.findMany({
    where: { seriesId: serie.id },
    orderBy: { number: "asc" },
  });
  expect(capitulos.map((c) => c.externalId)).toEqual(["capitulo-1", "capitulo-2", "capitulo-3"]);
  expect(capitulos[0].id).toBe(viejo.id);
  const progreso = await prisma.progress.findFirstOrThrow({ where: { userId: usuario.id } });
  expect(progreso.chapterId).toBe(viejo.id);
  expect(progreso.page).toBe(7);
  expect(events).toContainEqual(
    expect.objectContaining({ event: "chapter-reidentified", externalId: "segmento-viejo" }),
  );
  const vinculo = await prisma.seriesSource.findFirstOrThrow({ where: { seriesId: serie.id } });
  expect(vinculo.chaptersSyncedAt).not.toBeNull();
});
