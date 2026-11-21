import { expect, test } from "@playwright/test";

import { OlympusSourceAdapter } from "../../src/sources/olympus";

import { expectSourceError } from "./suite";
import {
  OLYMPUS_TRAP_HOST,
  fixtureTransport,
  olympusResponses,
  olympusUrls,
} from "./support/olympus-fixtures";

const status = (code: number) => () => new Response(null, { status: code });
const trap = () =>
  new Response(null, { status: 302, headers: { location: `https://${OLYMPUS_TRAP_HOST}/bloqueo` } });

function setup() {
  const transport = fixtureTransport(olympusResponses());

  return { transport, adapter: new OlympusSourceAdapter(transport.http) };
}

test("la Búsqueda con query pide /api/series/list una sola vez y filtra en local", async () => {
  const { transport, adapter } = setup();

  await adapter.search("academia");
  await adapter.search("bruma");
  await adapter.search("zzz-sin-resultados");

  expect(transport.calls).toEqual([olympusUrls.catalogList]);
});

test("dos Búsquedas concurrentes comparten una sola petición del catálogo", async () => {
  const { transport, adapter } = setup();

  await Promise.all([adapter.search("academia"), adapter.search("bruma")]);

  expect(transport.calls).toEqual([olympusUrls.catalogList]);
});

test("la caché del catálogo expira a los 10 minutos", async () => {
  const { transport, adapter } = setup();
  const originalNow = Date.now;

  try {
    await adapter.search("academia");
    Date.now = () => originalNow() + 10 * 60 * 1000 + 1;
    await adapter.search("academia");
  } finally {
    Date.now = originalNow;
  }

  expect(transport.calls).toEqual([olympusUrls.catalogList, olympusUrls.catalogList]);
});

test("la Búsqueda ignora tildes y mayúsculas y excluye las novelas", async () => {
  const { adapter } = setup();

  const page = await adapter.search("  ASCENSIÓN ");

  expect(page.items.map((series) => series.title)).toEqual(["Academia de la Ascensión"]);
  // La novela «Novela Academia Oculta» también contiene «academia» y no entra.
  expect((await adapter.search("academia")).items).toHaveLength(1);
});

test("la Búsqueda pagina en local de 20 en 20 con cursor por offset", async () => {
  const responses = olympusResponses();
  const list = responses.get("/api/series/list") as { data: unknown[] };
  const extra = Array.from({ length: 25 }, (_, i) => ({
    id: 100 + i,
    name: `Serie Repetida ${i + 1}`,
    slug: `serie-repetida-${i + 1}`,
    type: "comic",
  }));
  responses.set("/api/series/list", { data: [...list.data, ...extra] });

  const transport = fixtureTransport(responses);
  const adapter = new OlympusSourceAdapter(transport.http);

  const first = await adapter.search("repetida");

  expect(first.items).toHaveLength(20);
  expect(typeof first.nextCursor).toBe("string");

  const second = await adapter.search("repetida", first.nextCursor);

  expect(second.items).toHaveLength(5);
  expect(second.items.at(-1)?.title).toBe("Serie Repetida 25");
  expect(second.nextCursor).toBeUndefined();
  expect(transport.calls).toEqual([olympusUrls.catalogList]);
});

test("un fallo del catálogo lanza y nunca devuelve una lista vacía", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(olympusUrls.catalogList, status(503));
  transport.queueReply(olympusUrls.catalogList, status(503));
  transport.queueReply(olympusUrls.catalogList, status(503));

  await expectSourceError(adapter.search("academia"), "UPSTREAM");
});

test("un 302 al host trampa seguido de 200 se reintenta y el adapter responde", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(olympusUrls.academiaDetail, trap);

  const series = await adapter.getSeries("comic-academia-de-la-ascension-20261114-080134843");

  expect(series.title).toBe("Academia de la Ascensión");
  expect(transport.calls.filter((url) => url === olympusUrls.academiaDetail)).toHaveLength(2);
});

test("403 persistente lanza BLOCKED tras 3 intentos", async () => {
  const { transport, adapter } = setup();
  for (let i = 0; i < 3; i++) transport.queueReply(olympusUrls.academiaDetail, status(403));

  await expectSourceError(
    adapter.getSeries("comic-academia-de-la-ascension-20261114-080134843"),
    "BLOCKED",
  );
  expect(transport.calls.filter((url) => url === olympusUrls.academiaDetail)).toHaveLength(3);
});

test("429 agotado lanza RATE_LIMITED", async () => {
  const { transport, adapter } = setup();
  for (let i = 0; i < 3; i++) transport.queueReply(olympusUrls.academiaDetail, status(429));

  await expectSourceError(
    adapter.getSeries("comic-academia-de-la-ascension-20261114-080134843"),
    "RATE_LIMITED",
  );
});

test("5xx agotado lanza UPSTREAM", async () => {
  const { transport, adapter } = setup();
  for (let i = 0; i < 3; i++) transport.queueReply(olympusUrls.academiaDetail, status(503));

  await expectSourceError(
    adapter.getSeries("comic-academia-de-la-ascension-20261114-080134843"),
    "UPSTREAM",
  );
});

test("el bloqueo también se reintenta al pedir Páginas de un Capítulo", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(olympusUrls.academiaChapter1, trap);

  const pages = await adapter.getChapterPages(
    "comic-academia-de-la-ascension-20261114-080134843",
    "1",
  );

  expect(pages).toHaveLength(2);
});

test("una lista de Capítulos incompleta lanza PARSE, nunca una lista parcial", async () => {
  const responses = olympusResponses();
  const key =
    "/api/series/la-serie-larga-20261114-080400000/chapters?page=2&direction=asc&type=comic";
  const page2 = responses.get(key) as { data: unknown[]; meta: Record<string, number> };
  // La página 2 anuncia 45 en total pero entrega solo 3 de los 5 que faltan.
  responses.set(key, {
    data: page2.data.slice(0, 3),
    meta: { ...page2.meta, total: 45 },
  });

  const adapter = new OlympusSourceAdapter(fixtureTransport(responses).http);

  await expectSourceError(adapter.listChapters("comic-la-serie-larga-20261114-080400000"), "PARSE");
});

test("un JSON roto en el catálogo lanza PARSE", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(olympusUrls.catalogPage1, () => new Response("{roto", { status: 200 }));

  await expectSourceError(adapter.search(""), "PARSE");
});

test("un payload con otra forma lanza PARSE", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(
    olympusUrls.catalogPage1,
    () => Response.json({ data: { series: { data: [{ name: "Sin slug" }] } } }),
  );

  await expectSourceError(adapter.search(""), "PARSE");
});

test("un detalle de Serie con otra forma lanza PARSE, nunca un detalle a medias", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(olympusUrls.academiaDetail, () => Response.json({ data: { name: "Sin slug" } }));

  await expectSourceError(
    adapter.getSeries("comic-academia-de-la-ascension-20261114-080134843"),
    "PARSE",
  );
});

test("un Capítulo sin nombre lanza PARSE en vez de una lista parcial", async () => {
  const { transport, adapter } = setup();
  transport.queueReply(
    olympusUrls.academiaChaptersAsc1,
    () => Response.json({ data: [{ id: 101 }], meta: { current_page: 1, last_page: 1, total: 1 } }),
  );

  await expectSourceError(
    adapter.listChapters("comic-academia-de-la-ascension-20261114-080134843"),
    "PARSE",
  );
});
