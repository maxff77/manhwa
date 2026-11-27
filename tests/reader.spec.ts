import { prisma } from "../src/lib/db";
import { expect, test } from "./support/db";
import { seedSeries } from "./support/seed";
import { startImageFixture, type ImageFixture } from "./support/images";

/**
 * Serie con tres Capítulos; el del medio tiene 30 Páginas servidas por el
 * servidor local de fixtures (v1.md: cero peticiones a internet). El adapter
 * falso arranca vacío en el arnés: abrir el Capítulo sirve lo persistido.
 */
async function serieConLector(images: ImageFixture) {
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
    data: Array.from({ length: 30 }, (_, position) => ({
      chapterId: chapters[1].id,
      position,
      sourceUrl: images.url(`/academia/capitulo-2/${position}.png`),
    })),
  });
  return { serie, chapters };
}

test("el lector reserva espacio y mantiene acotada la ventana de imágenes vivas", async ({ page }) => {
  const images = await startImageFixture();
  try {
    await serieConLector(images);
    await page.goto("/series/academia-de-la-ascension/capitulo/capitulo-2");

    // Las 30 figuras existen desde el arranque con espacio reservado.
    const paginas = page.getByTestId(/^pagina-\d+$/);
    await expect(paginas).toHaveCount(30);

    // Ventana B: [actual-2, actual+5] → como mucho 8 <img> con src al inicio.
    const conSrc = page.locator("[data-testid^='pagina-'] img[src]");
    await expect(conSrc.first()).toBeVisible();
    expect(await conSrc.count()).toBeLessThanOrEqual(8);

    // Saltar muy lejos libera las anteriores: el número vivo sigue acotado.
    await page.getByTestId("pagina-25").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("pagina-25").locator("img")).toHaveAttribute("src", /.+/);
    expect(await conSrc.count()).toBeLessThanOrEqual(12);
    // Lejos de la ventana la figura queda sin <img>: el espacio sigue reservado.
    await expect(page.getByTestId("pagina-0").locator("img")).toHaveCount(0);
    await expect(page.getByTestId("pagina-0")).toBeAttached();
  } finally {
    await images.close();
  }
});

test("la posición se restaura por Página al volver al Capítulo", async ({ page }) => {
  const images = await startImageFixture();
  try {
    await serieConLector(images);
    const url = "/series/academia-de-la-ascension/capitulo/capitulo-2";
    await page.goto(url);
    await expect(page.getByTestId("pagina-12")).toBeAttached();

    await page.getByTestId("pagina-12").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("lector-posicion")).toContainText("13/30");

    // Recargar: el lector vuelve a la misma Página, no al inicio.
    await page.reload();
    await expect(page.getByTestId("lector-posicion")).toContainText("13/30");
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  } finally {
    await images.close();
  }
});

test("una imagen fallida reintenta con cache-buster y luego ofrece reintentar; el error sale por beacon", async ({ page }) => {
  const images = await startImageFixture();
  try {
    const { chapters } = await serieConLector(images);
    // La primera Página apunta a una ruta que responde 404 siempre.
    await prisma.page.update({
      where: { chapterId_position: { chapterId: chapters[1].id, position: 0 } },
      data: { sourceUrl: images.url("/roto/0.png") },
    });

    const beacons: Array<{ pageId: string; chapterId: string; url: string }> = [];
    await page.route("**/api/image-errors", async (route) => {
      beacons.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    });
    const intentos: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/roto/")) intentos.push(req.url());
    });

    await page.goto("/series/academia-de-la-ascension/capitulo/capitulo-2");
    const rota = page.getByTestId("pagina-0");

    // Tras el original y el reintento con cache-buster aparece el placeholder.
    const reintentar = rota.getByRole("button", { name: "Reintentar" });
    await expect(reintentar).toBeVisible();
    await expect.poll(() => intentos.length).toBe(2);
    expect(intentos[1]).toContain("retry=1");
    await expect.poll(() => beacons.length).toBeGreaterThanOrEqual(2);
    expect(beacons[0]).toMatchObject({ chapterId: chapters[1].id, url: images.url("/roto/0.png") });

    // «Reintentar» vuelve a pedir la imagen con una URL nueva (cache-buster
    // distinto): el navegador no reutiliza el 404 anterior. Al fallar otra vez
    // regresa el placeholder.
    await reintentar.click();
    await expect.poll(() => intentos.length).toBeGreaterThanOrEqual(3);
    expect(intentos[2]).toContain("retry=2");
    await expect(reintentar).toBeVisible();
  } finally {
    await images.close();
  }
});

test("anterior y siguiente navegan entre Capítulos y el final ofrece el siguiente", async ({ page }) => {
  const images = await startImageFixture();
  try {
    const { chapters } = await serieConLector(images);
    // El Capítulo 3 también tiene Páginas para poder abrirlo.
    await prisma.page.createMany({
      data: [0, 1].map((position) => ({
        chapterId: chapters[2].id,
        position,
        sourceUrl: images.url(`/academia/capitulo-3/${position}.png`),
      })),
    });

    await page.goto("/series/academia-de-la-ascension/capitulo/capitulo-2");
    await expect(page.getByTestId("lector-posicion")).toContainText("Capítulo 2 ");

    // El final del Capítulo ofrece el siguiente y navega a él.
    const siguiente = page.getByTestId("capitulo-siguiente");
    await siguiente.scrollIntoViewIfNeeded();
    await expect(siguiente).toHaveAttribute(
      "href",
      "/series/academia-de-la-ascension/capitulo/capitulo-3",
    );
    await siguiente.click();
    await expect(page).toHaveURL(/capitulo\/capitulo-3$/);
    await expect(page.getByTestId("lector-posicion")).toContainText("Capítulo 3 ");

    // El último no ofrece siguiente: vuelve a la Serie. Y el anterior regresa.
    await expect(page.getByTestId("capitulo-siguiente")).toHaveCount(0);
    const anterior = page.getByTestId("capitulo-anterior");
    await anterior.scrollIntoViewIfNeeded();
    await anterior.click();
    await expect(page).toHaveURL(/capitulo\/capitulo-2$/);
    await expect(page.getByTestId("lector-posicion")).toContainText("Capítulo 2 ");
  } finally {
    await images.close();
  }
});

test("la lista de Capítulos marca el actual y salta a otro", async ({ page }) => {
  const images = await startImageFixture();
  try {
    const { chapters } = await serieConLector(images);
    await prisma.page.create({
      data: { chapterId: chapters[2].id, position: 0, sourceUrl: images.url("/academia/capitulo-3/0.png") },
    });
    await page.goto("/series/academia-de-la-ascension/capitulo/capitulo-2");

    await page.getByRole("button", { name: /ver todos los Capítulos/ }).click();
    const lista = page.getByRole("dialog");
    await expect(lista.locator("[aria-current='page']")).toHaveText("Capítulo 2");
    await lista.getByRole("link", { name: "Capítulo 3", exact: true }).click();

    await expect(page).toHaveURL(/capitulo\/capitulo-3$/);
    await expect(page.getByTestId("lector-posicion")).toContainText("Capítulo 3 ");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await images.close();
  }
});
