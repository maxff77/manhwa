import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

test("borrar un Usuario borra sus Seguimientos y su Progreso", async () => {
  const series = await seedSeries();
  const source = await prisma.source.create({
    data: { slug: "fake", name: "Fuente falsa" },
  });
  await prisma.seriesSource.create({
    data: { seriesId: series.id, sourceId: source.id, externalId: "academia" },
  });
  const chapter = await prisma.chapter.create({
    data: {
      seriesId: series.id,
      sourceId: source.id,
      externalId: "capitulo-1",
      number: 1,
    },
  });
  const user = await prisma.user.create({
    data: { id: "user-1", name: "Lectora", email: "lectora@example.com" },
  });
  await prisma.follow.create({ data: { userId: user.id, seriesId: series.id } });
  await prisma.progress.create({
    data: { userId: user.id, seriesId: series.id, chapterId: chapter.id, page: 3 },
  });
  await prisma.collection.create({ data: { userId: user.id, name: "Isekai" } });

  await prisma.user.delete({ where: { id: user.id } });

  expect(await prisma.follow.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.progress.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.collection.count({ where: { userId: user.id } })).toBe(0);
  expect(await prisma.series.count({ where: { id: series.id } })).toBe(1);
  expect(await prisma.chapter.count({ where: { seriesId: series.id } })).toBe(1);
});
