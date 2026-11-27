import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

/**
 * Serie con vínculo a la Fuente falsa y dos Capítulos ya ingeridos por el
 * backfill, en enero y marzo. Mediodía UTC a mitad de mes: el mes no cambia
 * con la zona horaria del servidor (±12 h).
 */
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
  for (const [n, publishedAt] of [
    [1, "2026-01-15T12:00:00.000Z"],
    [2, "2026-03-15T12:00:00.000Z"],
  ] as const) {
    await prisma.chapter.create({
      data: {
        seriesId: serie.id,
        sourceId: source.id,
        externalId: `capitulo-${n}`,
        number: n,
        publishedAt: new Date(publishedAt),
      },
    });
  }
  return serie;
}

test("la página de Serie muestra sus campos y el calendario de Capítulos", async ({ page, request }) => {
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

  // La cabecera lleva al primero y al último Capítulo.
  await expect(page.getByRole("link", { name: "Empezar a leer" })).toHaveAttribute(
    "href",
    "/series/academia-de-la-ascension/capitulo/capitulo-1",
  );
  await expect(page.getByRole("link", { name: "Último: Capítulo 2" })).toHaveAttribute(
    "href",
    "/series/academia-de-la-ascension/capitulo/capitulo-2",
  );

  // Lo nuevo primero, agrupado por mes, con el mes sin Capítulos a la vista.
  const capitulos = page.getByRole("list", { name: "Capítulos" }).getByRole("link");
  await expect(capitulos).toHaveCount(2);
  await expect(capitulos.nth(0)).toContainText("Capítulo 2");
  await expect(capitulos.nth(0)).toHaveAttribute(
    "href",
    "/series/academia-de-la-ascension/capitulo/capitulo-2",
  );
  await expect(capitulos.nth(1)).toContainText("Capítulo 1");
  await expect(page.getByRole("heading", { level: 3, name: "Marzo de 2026" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Enero de 2026" })).toBeVisible();
  await expect(page.getByText("Sin Capítulos: febrero de 2026")).toBeVisible();

  // El orden se invierte desde la URL, sin JS.
  await page.getByRole("link", { name: "Antiguos primero" }).click();
  await expect(page).toHaveURL(/orden=antiguos/);
  await expect(capitulos.nth(0)).toContainText("Capítulo 1");
  await expect(page.getByRole("link", { name: "Antiguos primero" })).toHaveAttribute("aria-current", "true");
});
