import { expect, test } from "@playwright/test";
import { OlympusSourceAdapter } from "../../src/sources/olympus";
import {
  fixtureTransport,
  olympusIds,
  olympusResponses,
  olympusUrls,
} from "./support/olympus-fixtures";

/**
 * El slug de Olympus lleva un sufijo `-YYYYMMDD-HHMMSSmmm` que el mirror
 * regenera a diario (#21). La identidad de la Serie es el slug SIN ese sufijo;
 * el adapter resuelve el slug vivo desde el catálogo para pedir detalle y
 * Capítulos. Sin esto, cada corrida del backfill duplicaba Series.
 */
function setup() {
  const transport = fixtureTransport(olympusResponses());
  return { transport, adapter: new OlympusSourceAdapter(transport.http) };
}

test("la identidad de la Serie no lleva el sufijo de fecha que cambia a diario", async () => {
  const { adapter } = setup();
  const page = await adapter.search("");

  expect(page.items.map((series) => series.externalId)).toEqual([
    "comic-academia-de-la-ascension",
    "comic-bruma-del-norte",
  ]);
});

test("dos corridas del Catálogo con sufijos distintos devuelven la misma identidad", async () => {
  const primera = setup();
  const antes = (await primera.adapter.search("")).items.map((s) => s.externalId);

  // El mirror regeneró los slugs al día siguiente: mismo contenido, otro sufijo.
  const responses = olympusResponses();
  const manana = (slug: string) => slug.replace(/-\d{8}-\d{9}$/, "-20261115-080134843");
  for (const [path, payload] of [...responses]) {
    const mutado = path.replace(/-[0-9]{8}-[0-9]{9}/g, "-20261115-080134843");
    if (mutado !== path) {
      responses.delete(path);
      responses.set(mutado, payload);
    }
  }
  const listado = responses.get("/api/series/list") as { data: Array<{ slug: string }> };
  responses.set("/api/series/list", {
    data: listado.data.map((item) => ({ ...item, slug: manana(item.slug) })),
  });
  for (const pagina of [1, 2]) {
    const key = `/api/series?page=${pagina}`;
    const body = responses.get(key) as {
      data: { series: { data: Array<{ slug: string }> } };
    };
    body.data.series.data = body.data.series.data.map((item) => ({
      ...item,
      slug: manana(item.slug),
    }));
  }

  const segunda = new OlympusSourceAdapter(fixtureTransport(responses).http);
  const despues = (await segunda.search("")).items.map((s) => s.externalId);

  expect(despues).toEqual(antes);
});

test("getSeries con la identidad estable pide el slug vivo del catálogo", async () => {
  const { transport, adapter } = setup();
  const detail = await adapter.getSeries(olympusIds.academia);

  expect(detail.title).toBe("Academia de la Ascensión");
  expect(detail.externalId).toBe(olympusIds.academia);
  expect(transport.calls).toContain(olympusUrls.catalogList);
  expect(transport.calls).toContain(olympusUrls.academiaDetail);
});

test("los Capítulos y sus URLs usan la identidad estable, no el slug vivo", async () => {
  const { adapter } = setup();
  const chapters = await adapter.listChapters(olympusIds.academia);

  expect(chapters.length).toBeGreaterThan(0);
  for (const chapter of chapters) {
    expect(
      chapter.url.endsWith(
        `/series/${olympusIds.academia}/capitulo/${chapter.externalId}`,
      ),
    ).toBe(true);
  }
});

test("las Páginas de un Capítulo se piden con el slug vivo resuelto", async () => {
  const { transport, adapter } = setup();
  const pages = await adapter.getChapterPages(olympusIds.academia, "1");

  expect(pages).toHaveLength(2);
  expect(transport.calls).toContain(olympusUrls.academiaChapter1);
});
