import { expect, test } from "@playwright/test";

import { olympus } from "../../src/sources/olympus";

/**
 * Smoke manual contra Olympus: lo ejecuta una persona con `npm run smoke:olympus`.
 * Es el único paso del #20 que toca producción; el agente no lo corre.
 * La suite de contrato (`npm run test:contract`) ignora esta carpeta.
 */
test.setTimeout(180_000);

test("smoke: las cinco operaciones responden desde Olympus", async () => {
  const catalogo = await olympus.search("");
  console.log(`catálogo: ${catalogo.items.length} Series, nextCursor=${catalogo.nextCursor !== undefined}`);
  expect(catalogo.items.length).toBeGreaterThan(0);

  const [primera] = catalogo.items;
  console.log(`primera Serie: ${primera.externalId} — ${primera.title}`);

  const busqueda = await olympus.search("a");
  console.log(`búsqueda local "a": ${busqueda.items.length} resultados`);

  const detalle = await olympus.getSeries(primera.externalId);
  console.log(
    `detalle: estado=${detalle.status ?? "—"}, géneros=${detalle.genres.length}, sinopsis=${detalle.synopsis ? "sí" : "no"}`,
  );
  expect(detalle.title).toBeTruthy();

  const recientes = await olympus.listRecentChapters(primera.externalId);
  console.log(`Capítulos recientes: ${recientes.items.length}, primero=${recientes.items[0]?.externalId ?? "—"}`);
  expect(recientes.items.length).toBeGreaterThan(0);

  const paginas = await olympus.getChapterPages(primera.externalId, recientes.items[0].externalId);
  console.log(`Páginas del primer Capítulo: ${paginas.length}, primera URL=${paginas[0]?.url ?? "—"}`);
  expect(paginas.length).toBeGreaterThan(0);
  expect(paginas[0].position).toBe(0);
});
