import { prisma } from "../../src/lib/db";
import { migrateSeriesIdentity } from "../../src/ingest/identity";
import { expect, test } from "../support/db";

/**
 * La identidad vieja llevaba el sufijo `-YYYYMMDD-HHMMSSmmm` que el mirror de
 * Olympus regenera a diario (#21). Cada pasada creaba una Serie nueva para la
 * misma obra. Esta migración deja el slug base como identidad y fusiona los
 * duplicados, conservando la fila más reciente.
 */
async function seedVinculo(
  sourceId: string,
  externalId: string,
  slug: string,
  updatedAt: Date,
  capitulos: number[],
) {
  const serie = await prisma.series.create({
    data: {
      slug,
      title: "Academia de la Ascensión",
      titleNormalized: "academia de la ascension",
      status: "ONGOING",
      genres: ["Acción"],
    },
  });
  await prisma.seriesSource.create({
    data: { seriesId: serie.id, sourceId, externalId, url: `https://example/${externalId}` },
  });
  for (const n of capitulos) {
    await prisma.chapter.create({
      data: {
        seriesId: serie.id,
        sourceId,
        externalId: `capitulo-${n}`,
        number: n,
        publishedAt: new Date(`2026-01-0${n}T00:00:00.000Z`),
      },
    });
  }
  // updatedAt es @updatedAt: se fija por SQL para simular el orden de las corridas.
  await prisma.$executeRaw`UPDATE series SET "updatedAt" = ${updatedAt} WHERE id = ${serie.id}`;
  return serie.id;
}

test("la migración quita el sufijo de fecha y deja la identidad estable", async () => {
  const source = await prisma.source.create({ data: { slug: "olympus", name: "Olympus" } });
  await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261123-080148306",
    "academia-de-la-ascension",
    new Date("2026-11-24T01:00:00.000Z"),
    [1, 2],
  );

  const events: Array<Record<string, unknown>> = [];
  const result = await migrateSeriesIdentity({ db: prisma, log: (e) => events.push(e) });

  expect(result.renamed).toBe(1);
  expect(result.merged).toBe(0);
  const vinculo = await prisma.seriesSource.findFirstOrThrow();
  expect(vinculo.externalId).toBe("comic-academia-de-la-ascension");
});

test("dos vínculos de la misma Serie se fusionan conservando el más reciente", async () => {
  const source = await prisma.source.create({ data: { slug: "olympus", name: "Olympus" } });
  const vieja = await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261122-080148151",
    "academia-de-la-ascension",
    new Date("2026-11-22T20:00:00.000Z"),
    [1, 2],
  );
  const nueva = await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261123-080148306",
    "academia-de-la-ascension-2",
    new Date("2026-11-24T01:00:00.000Z"),
    [1, 2, 3],
  );

  const events: Array<Record<string, unknown>> = [];
  const result = await migrateSeriesIdentity({ db: prisma, log: (e) => events.push(e) });

  expect(result.merged).toBe(1);
  expect(await prisma.series.count()).toBe(1);
  expect(await prisma.seriesSource.count()).toBe(1);
  // Se conserva la Serie más reciente, con sus Capítulos intactos.
  expect(await prisma.series.findUniqueOrThrow({ where: { id: nueva } })).toBeTruthy();
  expect(await prisma.series.findUnique({ where: { id: vieja } })).toBeNull();
  expect(await prisma.chapter.count({ where: { seriesId: nueva } })).toBe(3);
  const vinculo = await prisma.seriesSource.findFirstOrThrow();
  expect(vinculo.externalId).toBe("comic-academia-de-la-ascension");
  expect(vinculo.seriesId).toBe(nueva);
  expect(events).toContainEqual(expect.objectContaining({ event: "series-merged" }));
});

test("reejecutar la migración no cambia nada", async () => {
  const source = await prisma.source.create({ data: { slug: "olympus", name: "Olympus" } });
  await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261123-080148306",
    "academia-de-la-ascension",
    new Date("2026-11-24T01:00:00.000Z"),
    [1],
  );

  await migrateSeriesIdentity({ db: prisma, log: () => {} });
  const segunda = await migrateSeriesIdentity({ db: prisma, log: () => {} });

  expect(segunda).toEqual({ renamed: 0, merged: 0, skipped: 0 });
  expect(await prisma.series.count()).toBe(1);
  expect(await prisma.chapter.count()).toBe(1);
});

test("una Serie con Seguimiento no se borra: se registra y se deja intacta", async () => {
  const source = await prisma.source.create({ data: { slug: "olympus", name: "Olympus" } });
  const vieja = await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261122-080148151",
    "academia-de-la-ascension",
    new Date("2026-11-22T20:00:00.000Z"),
    [1],
  );
  await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261123-080148306",
    "academia-de-la-ascension-2",
    new Date("2026-11-24T01:00:00.000Z"),
    [1, 2],
  );
  const user = await prisma.user.create({
    data: { id: "user-1", name: "Lectora", email: "lectora@example.com" },
  });
  await prisma.follow.create({ data: { userId: user.id, seriesId: vieja } });

  const events: Array<Record<string, unknown>> = [];
  const result = await migrateSeriesIdentity({ db: prisma, log: (e) => events.push(e) });

  // Borrarla arrastraría el Seguimiento en cascada: se omite con log.
  expect(result.skipped).toBe(1);
  expect(await prisma.follow.count()).toBe(1);
  expect(await prisma.series.count()).toBe(2);
  expect(events).toContainEqual(expect.objectContaining({ event: "merge-skipped" }));
});

test("si la identidad estable ya la ocupa una Serie protegida, el vínculo conservado no se renombra", async () => {
  const source = await prisma.source.create({ data: { slug: "olympus", name: "Olympus" } });
  // La que YA tiene la identidad estable es más vieja y tiene datos de Usuario:
  // no se puede borrar, así que la identidad sigue ocupada por ella.
  const protegida = await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension",
    "academia-de-la-ascension",
    new Date("2026-11-20T00:00:00.000Z"),
    [1],
  );
  const sufijada = await seedVinculo(
    source.id,
    "comic-academia-de-la-ascension-20261124-080148151",
    "academia-de-la-ascension-2",
    new Date("2026-11-24T00:00:00.000Z"),
    [1, 2],
  );
  const user = await prisma.user.create({
    data: { id: "user-1", name: "Lectora", email: "lectora@example.com" },
  });
  await prisma.follow.create({ data: { userId: user.id, seriesId: protegida } });

  const events: Array<Record<string, unknown>> = [];
  const result = await migrateSeriesIdentity({ db: prisma, log: (e) => events.push(e) });

  // Dos omisiones: no borrar la protegida y no renombrar sobre una identidad ocupada.
  expect(result).toEqual({ renamed: 0, merged: 0, skipped: 2 });
  expect(await prisma.series.count()).toBe(2);
  expect(await prisma.follow.count()).toBe(1);
  expect(
    (await prisma.seriesSource.findFirstOrThrow({ where: { seriesId: protegida } })).externalId,
  ).toBe("comic-academia-de-la-ascension");
  expect(
    (await prisma.seriesSource.findFirstOrThrow({ where: { seriesId: sufijada } })).externalId,
  ).toBe("comic-academia-de-la-ascension-20261124-080148151");
  expect(events).toContainEqual(
    expect.objectContaining({ event: "rename-skipped", reason: "identity-taken" }),
  );
});
