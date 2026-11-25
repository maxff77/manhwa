import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

test("GET /api/series responde una lista vacía con la base limpia", async ({ request }) => {
  const response = await request.get("/api/series");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});

test("GET /api/series lee las Series de Postgres", async ({ request }) => {
  await seedSeries();

  const response = await request.get("/api/series");

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.items).toHaveLength(1);
  expect(body.items[0]).toMatchObject({
    slug: "academia-de-la-ascension",
    title: "Academia de la Ascensión",
    status: "ONGOING",
    type: "MANHWA",
    latestChapter: null,
  });
  expect(body.nextCursor).toBeNull();
});

test("GET /api/series pagina con limit y cursor opaco sin repetir ni saltar Series", async ({ request }) => {
  await seedSeries();
  await seedSeries({ slug: "beta", title: "Beta", titleNormalized: "beta" });
  await seedSeries({ slug: "gamma", title: "Gamma", titleNormalized: "gamma" });

  const first = await request.get("/api/series?limit=2");
  expect(first.status()).toBe(200);
  const page1 = await first.json();
  expect(page1.items.map((s: { title: string }) => s.title)).toEqual([
    "Academia de la Ascensión",
    "Beta",
  ]);
  expect(typeof page1.nextCursor).toBe("string");

  const second = await request.get(
    `/api/series?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
  );
  expect(second.status()).toBe(200);
  const page2 = await second.json();
  expect(page2.items.map((s: { title: string }) => s.title)).toEqual(["Gamma"]);
  expect(page2.nextCursor).toBeNull();
});

test("GET /api/series rechaza limit fuera de rango y cursor inválido con 400", async ({ request }) => {
  for (const query of ["limit=0", "limit=51", "limit=-1", "limit=abc", "cursor=no-es-un-cursor"]) {
    const response = await request.get(`/api/series?${query}`);
    expect(response.status(), query).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
});

test("GET /api/series combina géneros con OR y filtros distintos con AND", async ({ request }) => {
  await seedSeries();
  await seedSeries({
    slug: "romance-completo",
    title: "Romance Completo",
    titleNormalized: "romance completo",
    status: "COMPLETED",
    genres: ["Romance"],
  });
  await seedSeries({
    slug: "accion-completa",
    title: "Acción Completa",
    titleNormalized: "accion completa",
    status: "COMPLETED",
    genres: ["Acción"],
  });

  const or = await request.get("/api/series?genre=Acci%C3%B3n&genre=Romance");
  expect(or.status()).toBe(200);
  expect((await or.json()).items.map((s: { title: string }) => s.title)).toEqual([
    "Academia de la Ascensión",
    "Acción Completa",
    "Romance Completo",
  ]);

  const and = await request.get("/api/series?genre=Acci%C3%B3n&status=completed");
  expect(and.status()).toBe(200);
  expect((await and.json()).items.map((s: { title: string }) => s.title)).toEqual([
    "Acción Completa",
  ]);
});

test("GET /api/series rechaza status desconocido y devuelve lista vacía para un género sin Series", async ({ request }) => {
  await seedSeries();

  const bad = await request.get("/api/series?status=finalizado");
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toHaveProperty("error");

  const unknownGenre = await request.get("/api/series?genre=Inexistente");
  expect(unknownGenre.status()).toBe(200);
  expect(await unknownGenre.json()).toEqual({ items: [], nextCursor: null });
});

test("GET /api/series ordena por último Capítulo con sort=latest y deja al final las Series sin Capítulos", async ({ request }) => {
  const source = await prisma.source.create({ data: { slug: "fake", name: "Fuente falsa" } });

  const vieja = await seedSeries();
  const nueva = await seedSeries({ slug: "beta", title: "Beta", titleNormalized: "beta" });
  await seedSeries({ slug: "sin-capitulos", title: "Zeta Sin Capítulos", titleNormalized: "zeta sin capitulos" });

  await prisma.chapter.createMany({
    data: [
      { seriesId: vieja.id, sourceId: source.id, externalId: "cap-1", number: 1, publishedAt: new Date("2026-01-01T00:00:00.000Z") },
      { seriesId: nueva.id, sourceId: source.id, externalId: "cap-9", number: 9, publishedAt: new Date("2026-11-01T00:00:00.000Z") },
    ],
  });

  const response = await request.get("/api/series?sort=latest");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.items.map((s: { title: string }) => s.title)).toEqual([
    "Beta",
    "Academia de la Ascensión",
    "Zeta Sin Capítulos",
  ]);
  expect(body.items[0].latestChapter).toEqual({ number: 9, publishedAt: "2026-11-01T00:00:00.000Z" });
  expect(body.items[2].latestChapter).toBeNull();
});

test("GET /api/series rechaza sort desconocido y sort junto a q con términos", async ({ request }) => {
  for (const query of ["sort=otro", "q=academia&sort=latest"]) {
    const response = await request.get(`/api/series?${query}`);
    expect(response.status(), query).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
});

test("GET /api/series trata q sin términos como catálogo, no como búsqueda vacía", async ({ request }) => {
  await seedSeries();

  for (const query of ["q=", "q=%20%20", "q=&sort=latest"]) {
    const response = await request.get(`/api/series?${query}`);
    expect(response.status(), query).toBe(200);
    const body = await response.json();
    expect(body.items.map((s: { title: string }) => s.title), query).toEqual([
      "Academia de la Ascensión",
    ]);
  }
});

test("GET /api/series rechaza un cursor emitido con otros filtros u orden", async ({ request }) => {
  await seedSeries();
  await seedSeries({ slug: "beta", title: "Beta", titleNormalized: "beta" });
  await seedSeries({ slug: "gamma", title: "Gamma", titleNormalized: "gamma" });

  const first = await request.get("/api/series?limit=1&genre=Acci%C3%B3n");
  expect(first.status()).toBe(200);
  const cursor = (await first.json()).nextCursor;
  expect(typeof cursor).toBe("string");

  for (const query of [
    `limit=1&genre=Romance&cursor=${encodeURIComponent(cursor)}`,
    `limit=1&status=completed&cursor=${encodeURIComponent(cursor)}`,
    `limit=1&sort=latest&cursor=${encodeURIComponent(cursor)}`,
    `limit=1&cursor=${encodeURIComponent(cursor)}`,
  ]) {
    const response = await request.get(`/api/series?${query}`);
    expect(response.status(), query).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
});

test("GET /api/series acepta los mismos filtros repetidos en otro orden o duplicados", async ({ request }) => {
  await seedSeries();
  await seedSeries({ slug: "beta", title: "Beta", titleNormalized: "beta" });

  const first = await request.get("/api/series?limit=1&genre=Acci%C3%B3n&status=ongoing");
  expect(first.status()).toBe(200);
  const cursor = (await first.json()).nextCursor;
  expect(typeof cursor).toBe("string");

  const reordered = await request.get(
    `/api/series?status=ongoing&status=ongoing&genre=Acci%C3%B3n&limit=1&cursor=${encodeURIComponent(cursor)}`,
  );
  expect(reordered.status()).toBe(200);
});
