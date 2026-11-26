import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

/** Serie con vínculo a la Fuente falsa y dos Capítulos ya ingeridos por el backfill. */
async function serieConCapitulos() {
  const serie = await seedSeries({
    synopsis: "Una academia de magia.",
    genres: ["Acción", "Aventura"],
    authors: ["Autora Uno"],
    coverSourceUrl: "https://media.example/academia.webp",
  });
  const source = await prisma.source.create({ data: { slug: "fake", name: "Fuente falsa" } });
  await prisma.seriesSource.create({
    data: { seriesId: serie.id, sourceId: source.id, externalId: "academia" },
  });
  for (const n of [1, 2]) {
    await prisma.chapter.create({
      data: {
        seriesId: serie.id,
        sourceId: source.id,
        externalId: `capitulo-${n}`,
        number: n,
        publishedAt: new Date(`2026-01-0${n}T00:00:00.000Z`),
      },
    });
  }
  return serie;
}

test("la página de Serie muestra sus campos y la lista de Capítulos en orden", async ({ page, request }) => {
  await serieConCapitulos();

  const response = await request.get("/series/academia-de-la-ascension");
  expect(response.status()).toBe(200);

  await page.goto("/series/academia-de-la-ascension");
  await expect(
    page.getByRole("heading", { level: 1, name: "Academia de la Ascensión" }),
  ).toBeVisible();
  await expect(page.getByText("Una academia de magia.")).toBeVisible();
  await expect(page.getByText("En emisión")).toBeVisible();
  await expect(page.getByText("Acción", { exact: true })).toBeVisible();
  await expect(page.getByText("Aventura", { exact: true })).toBeVisible();
  await expect(page.getByText("Autora Uno")).toBeVisible();

  // La lista completa, en orden ascendente de número, y cada Capítulo al lector.
  const capitulos = page.getByRole("list", { name: "Capítulos" }).getByRole("link");
  await expect(capitulos).toHaveCount(2);
  await expect(capitulos.nth(0)).toContainText("Capítulo 1");
  await expect(capitulos.nth(0)).toHaveAttribute(
    "href",
    "/series/academia-de-la-ascension/capitulo/capitulo-1",
  );
  await expect(capitulos.nth(1)).toContainText("Capítulo 2");
});
