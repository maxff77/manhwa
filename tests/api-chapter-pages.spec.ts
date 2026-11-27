import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

/**
 * Serie con vínculo a la Fuente falsa y tres Capítulos (1, 2, 3). El Capítulo 2
 * tiene Páginas persistidas de una apertura anterior; el adapter falso arranca
 * vacío en el arnés, así que abrirlo sirve lo persistido (v1.md).
 */
async function serieConPaginas() {
  const serie = await seedSeries();
  const source = await prisma.source.create({ data: { slug: "fake", name: "Fuente falsa" } });
  await prisma.seriesSource.create({
    data: { seriesId: serie.id, sourceId: source.id, externalId: "academia" },
  });
  const chapters: Array<{ id: string }> = [];
  for (const n of [1, 2, 3]) {
    chapters.push(
      await prisma.chapter.create({
        data: {
          seriesId: serie.id,
          sourceId: source.id,
          externalId: `capitulo-${n}`,
          number: n,
          publishedAt: new Date(`2026-01-0${n}T12:00:00.000Z`),
        },
      }),
    );
  }
  await prisma.page.createMany({
    data: [0, 1, 2].map((position) => ({
      chapterId: chapters[1].id,
      position,
      sourceUrl: `https://media.example/academia/capitulo-2/${position}.webp`,
    })),
  });
  return { serie, chapters };
}

test("GET pages devuelve el manifiesto con Páginas 0-based, anterior y siguiente, sin caché", async ({ request }) => {
  const { serie, chapters } = await serieConPaginas();

  const response = await request.get(
    "/api/series/academia-de-la-ascension/chapters/capitulo-2/pages",
  );

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body.series).toEqual({
    id: serie.id,
    slug: "academia-de-la-ascension",
    title: "Academia de la Ascensión",
  });
  expect(body.chapter).toMatchObject({ id: chapters[1].id, number: 2, title: null });
  expect(body.pages).toEqual([
    { id: expect.any(String), position: 0, url: "https://media.example/academia/capitulo-2/0.webp" },
    { id: expect.any(String), position: 1, url: "https://media.example/academia/capitulo-2/1.webp" },
    { id: expect.any(String), position: 2, url: "https://media.example/academia/capitulo-2/2.webp" },
  ]);
  expect(body.prevChapter).toEqual({ externalId: "capitulo-1", number: 1 });
  expect(body.nextChapter).toEqual({ externalId: "capitulo-3", number: 3 });
  // La lista entera alimenta el selector de Capítulos del lector.
  expect(body.chapters.map((c: { number: number }) => c.number)).toEqual([1, 2, 3]);
});

test("el primer Capítulo no tiene anterior y el último no tiene siguiente", async ({ request }) => {
  const { chapters } = await serieConPaginas();
  // Los extremos también necesitan Páginas persistidas: sin ellas la API
  // responde 502 y el contrato de vecinos quedaría sin afirmar.
  for (const chapter of [chapters[0], chapters[2]]) {
    await prisma.page.create({
      data: { chapterId: chapter.id, position: 0, sourceUrl: "https://media.example/extremo.webp" },
    });
  }

  const primero = await request.get(
    "/api/series/academia-de-la-ascension/chapters/capitulo-1/pages",
  );
  expect(primero.status()).toBe(200);
  const bodyPrimero = await primero.json();
  expect(bodyPrimero.prevChapter).toBeNull();
  expect(bodyPrimero.nextChapter).toEqual({ externalId: "capitulo-2", number: 2 });

  const ultimo = await request.get(
    "/api/series/academia-de-la-ascension/chapters/capitulo-3/pages",
  );
  expect(ultimo.status()).toBe(200);
  const bodyUltimo = await ultimo.json();
  expect(bodyUltimo.prevChapter).toEqual({ externalId: "capitulo-2", number: 2 });
  expect(bodyUltimo.nextChapter).toBeNull();
});

test("una Serie o un Capítulo inexistente responde 404 JSON", async ({ request }) => {
  await serieConPaginas();

  const sinSerie = await request.get("/api/series/no-existe/chapters/capitulo-2/pages");
  expect(sinSerie.status()).toBe(404);
  expect(await sinSerie.json()).toHaveProperty("error");

  const sinCapitulo = await request.get(
    "/api/series/academia-de-la-ascension/chapters/no-existe/pages",
  );
  expect(sinCapitulo.status()).toBe(404);
  expect(await sinCapitulo.json()).toHaveProperty("error");
});

test("sin Páginas persistidas y con la Fuente caída responde 502 sin tocar la DB", async ({ request }) => {
  const { chapters } = await serieConPaginas();

  const response = await request.get(
    "/api/series/academia-de-la-ascension/chapters/capitulo-1/pages",
  );

  expect(response.status()).toBe(502);
  expect(await response.json()).toHaveProperty("error");
  expect(await prisma.page.count({ where: { chapterId: chapters[0].id } })).toBe(0);
});
