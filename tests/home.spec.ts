import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";

test("la home carga sin errores y muestra el Catálogo vacío", async ({ page }) => {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
  await expect(page.getByText("El Catálogo está vacío")).toBeVisible();
  expect(errors).toEqual([]);
});

test("un visitante anónimo ve Últimos capítulos y el filtro de géneros", async ({ page }) => {
  const serie = await seedSeries({ coverSourceUrl: "https://media.example/academia.webp" });
  const source = await prisma.source.create({ data: { slug: "fake", name: "Fuente falsa" } });
  await prisma.chapter.create({
    data: {
      seriesId: serie.id,
      sourceId: source.id,
      externalId: "cap-201",
      number: 201,
      publishedAt: new Date("2026-11-07T13:36:00.000Z"),
    },
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: "Últimos capítulos" }),
  ).toBeVisible();
  await expect(page.getByRole("grid", { name: "Géneros" })).toBeVisible();
  await expect(page.getByText("1 Serie", { exact: true })).toBeVisible();

  // La tarjeta muestra título, estado y último Capítulo, y enlaza a la Serie.
  const card = page.getByRole("link", { name: /Academia de la Ascensión/ });
  await expect(card).toHaveAttribute("href", "/series/academia-de-la-ascension");
  await expect(card).toContainText("En emisión");
  await expect(card).toContainText("Capítulo 201");

  // Cada género es un chip seleccionable del filtro.
  await expect(page.getByRole("row", { name: "Acción", exact: true })).toBeVisible();

  // Sin sesión no hay «Continúa leyendo».
  await expect(page.getByText("Continúa leyendo")).toHaveCount(0);
});

test("marcar géneros filtra el Catálogo y la URL guarda la selección", async ({ page }) => {
  await seedSeries();
  await seedSeries({
    slug: "romance-completo",
    title: "Romance Completo",
    titleNormalized: "romance completo",
    status: "COMPLETED",
    genres: ["Romance"],
  });

  await page.goto("/");
  await page.getByRole("row", { name: "Romance", exact: true }).click();

  await expect(page).toHaveURL("/?genre=Romance");
  await expect(page.getByRole("heading", { level: 2, name: "Romance" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("1 Serie de Romance");
  await expect(page.getByRole("link", { name: /Romance Completo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Academia de la Ascensión/ })).toHaveCount(0);

  // Varios géneros a la vez: Series de cualquiera de ellos.
  await page.getByRole("row", { name: "Acción", exact: true }).click();
  await expect(page).toHaveURL("/?genre=Acci%C3%B3n&genre=Romance");
  await expect(page.getByRole("heading", { level: 2, name: "Acción o Romance" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("2 Series de Acción o Romance");
  await expect(page.getByRole("link", { name: /Academia de la Ascensión/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Romance Completo/ })).toBeVisible();

  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 2, name: "Últimos capítulos" })).toBeVisible();

  // Sin resultados, el aviso cuelga del h2 de la sección.
  await page.goto("/?genre=Inexistente");
  await expect(
    page.getByRole("heading", { level: 3, name: "Ninguna Serie con ese género" }),
  ).toBeVisible();
});

test("el tema sigue al sistema y aplica los tokens de HeroUI", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("body")).toHaveCSS("font-family", /Geist/);
  const lightBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const darkBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );

  expect(lightBackground).not.toBe(darkBackground);
});
