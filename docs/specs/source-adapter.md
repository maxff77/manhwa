# Contrato `SourceAdapter`

Spec del ticket [#6](https://github.com/maxff77/manhwa/issues/6). Única superficie entre la plataforma y una Fuente de contenido.

## Alcance

- Aplica a **Fuentes de contenido**: exponen Series, Capítulos y Páginas.
- v1: la única implementación es **Olympus** (`olympusxyz.com`).
- **MangaDex** (solo metadata) queda fuera de este contrato. Si entra, será una interfaz más angosta (`MetadataProvider`), porque no tiene Capítulos ni Páginas.
- El mecanismo de obtención (HTML, JSON o JS) es interno al adapter; el pipeline no lo conoce.

## Responsabilidades

| El adapter | El pipeline |
|---|---|
| Habla HTTP con su Fuente | Mapea DTOs a Prisma (`Series`, `SeriesSource`, `Chapter`, `Page`) |
| User-Agent de bot propio, timeout, una petición en vuelo por host | Reintentos a nivel de job y concurrencia entre Fuentes |
| Reintentos con backoff de su Fuente | Scheduling, persistencia y monitoreo |
| Parsea HTML/JSON a DTOs | Decide qué hacer con datos incompletos (p. ej. `number: null`) |
| Lanza `SourceError` tipado cuando se rinde | Deduplicación y merge entre Fuentes |

### El adapter NO hace

- No persiste nada ni conoce ids internos (`cuid`) ni `sourceId`.
- No descarga, cachea ni sirve imágenes; solo devuelve sus URLs.
- No hace merge entre Fuentes ni resuelve `SeriesSource`.
- No conoce Usuarios, sesiones ni Progreso.
- No programa jobs ni decide cuándo sincronizar.
- No devuelve listas parciales: si falla, lanza.

## Identidad

- `Series.externalId` = slug de la serie (`/series/<slug>`) **sin el sufijo `-YYYYMMDD-HHMMSSmmm`**. El mirror de Olympus regenera ese sufijo a diario para las Series actualizadas, así que el slug completo no es identidad: con él, cada pasada del backfill creaba una Serie nueva (#21). El adapter resuelve el slug vivo desde el catálogo cacheado para pedir detalle y Capítulos, porque la API solo acepta el slug con sufijo.
- `Chapter.externalId` = segmento de la URL del capítulo (`/series/<slug>/capitulo/<segmento>`), **no** el número parseado. Si cambia la presentación del número, la identidad no se rompe.
- `number` se parsea aparte y puede ser `null`; el pipeline decide omitir con log.
- El adapter nunca ve ids internos. El pipeline hace upsert de `SeriesSource (sourceId, externalId)` y de `Chapter (seriesId, sourceId, externalId)`.

## Tipos

```ts
/** Slug de la Fuente; coincide con `Source.slug` en la DB. */
export type SourceSlug = string;

export type SourceSeriesStatus = "ongoing" | "completed" | "hiatus" | "cancelled";

export interface SourceSeriesSummary {
  /** Identidad estable en la Fuente (slug de la URL). */
  externalId: string;
  title: string;
  coverUrl?: string;
  /** URL canónica de la serie en la Fuente. */
  url: string;
}

export interface SourceSeriesDetail extends SourceSeriesSummary {
  synopsis?: string;
  status?: SourceSeriesStatus;
  genres: string[];
  authors: string[];
  year?: number;
}

export interface SourceChapter {
  /** Segmento de identidad en la URL, no el número parseado. */
  externalId: string;
  /** Número parseado; null si la Fuente no lo expone de forma parseable. */
  number: number | null;
  title?: string;
  publishedAt?: Date;
  url: string;
}

export interface SourceChapterPage {
  /** Capítulos de la página, en el orden de la Fuente. */
  items: SourceChapter[];
  /** Cursor opaco para el pipeline. `undefined` = no hay más resultados. */
  nextCursor?: string;
}

export interface SourcePage {
  /** Índice 0-based en orden de lectura. */
  position: number;
  /** URL absoluta de la imagen; el adapter no la descarga. */
  url: string;
}

export interface SourceSearchPage {
  items: SourceSeriesSummary[];
  /** Cursor opaco para el pipeline. `undefined` = no hay más resultados. */
  nextCursor?: string;
}
```

## Interfaz

```ts
export interface SourceAdapter {
  /** Debe coincidir con `Source.slug`. */
  readonly slug: SourceSlug;

  /** Query vacía = recorrer el catálogo. `cursor` es opaco. */
  search(query: string, cursor?: string): Promise<SourceSearchPage>;

  getSeries(externalId: string): Promise<SourceSeriesDetail>;

  /** Lista completa, en el orden de la Fuente. */
  listChapters(seriesExternalId: string): Promise<SourceChapter[]>;

  /** Página de los Capítulos más recientes primero. `cursor` es opaco. */
  listRecentChapters(
    seriesExternalId: string,
    cursor?: string,
  ): Promise<SourceChapterPage>;

  /** Páginas en orden de lectura; `position` es el índice 0-based. */
  getChapterPages(
    seriesExternalId: string,
    chapterExternalId: string,
  ): Promise<SourcePage[]>;
}
```

Cinco operaciones. `listRecentChapters` es la que usan las alertas: devuelve los Capítulos más recientes primero y el pipeline compara esa página contra la DB (ticket #10), sin pedir la lista completa. No hay operación de novedades por fecha. `getSeries` no incluye capítulos; en Olympus se cargan aparte.

## Errores y política HTTP

```ts
export type SourceErrorKind =
  | "NOT_FOUND"    // la serie/capítulo no existe en la Fuente
  | "BLOCKED"      // 302 al host trampa o 403 persistente
  | "RATE_LIMITED" // 429 agotados los reintentos
  | "UPSTREAM"     // 5xx u otro fallo del sitio
  | "PARSE";       // respuesta inesperada o HTML/JSON inválido

export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
```

El adapter es dueño de la política HTTP de su Fuente:

- User-Agent de bot propio de la plataforma; nunca UA de navegador ni de crawler de IA.
- Timeout por petición.
- Una petición en vuelo por host (serialización), con delay configurable.
- Hasta 3 intentos con backoff exponencial + jitter ante 302 al host trampa, 403, 429 y 5xx.
- Al agotar los intentos, lanza `SourceError` con el `kind` que corresponda.

El pipeline es dueño del reintento a nivel de job, la concurrencia entre Fuentes y cualquier trabajo de persistencia.

## Registro

Registry estático en un solo archivo; el `slug` del adapter es la clave:

```ts
// src/sources/registry.ts
import type { SourceAdapter, SourceSlug } from "./types";
import { olympus } from "./olympus";

const adapters: Record<SourceSlug, SourceAdapter> = {
  [olympus.slug]: olympus,
};

export function getAdapter(slug: string): SourceAdapter {
  const adapter = adapters[slug];
  if (!adapter) throw new Error(`Fuente sin adapter: ${slug}`);
  return adapter;
}
```

Agregar una Fuente = fila en `Source` (seed/migración) + módulo del adapter + una línea en el registry. Sin carga dinámica de plugins.

## Adapter de referencia (fake)

El adapter de referencia es un fake con fixtures, no Olympus: sirve para tests del pipeline y como ejemplo del contrato.

```ts
export class FakeSourceAdapter implements SourceAdapter {
  readonly slug = "fake";

  constructor(private readonly fixtures: FakeFixtures) {}

  async search(query: string, cursor?: string): Promise<SourceSearchPage> {
    const page = this.fixtures.search[query]?.[cursor ?? "first"] ?? { items: [] };
    return page;
  }
  async getSeries(externalId: string): Promise<SourceSeriesDetail> {
    const series = this.fixtures.series[externalId];
    if (!series) throw new SourceError("NOT_FOUND", `Serie inexistente: ${externalId}`);
    return series;
  }
  async listChapters(seriesExternalId: string): Promise<SourceChapter[]> {
    return this.fixtures.chapters[seriesExternalId] ?? [];
  }
  async listRecentChapters(
    seriesExternalId: string,
    cursor?: string,
  ): Promise<SourceChapterPage> {
    const all = [...(this.fixtures.chapters[seriesExternalId] ?? [])].reverse();
    const page = Number(cursor ?? "1");
    const items = all.slice((page - 1) * 40, page * 40);
    return { items, nextCursor: page * 40 < all.length ? String(page + 1) : undefined };
  }
  async getChapterPages(
    seriesExternalId: string,
    chapterExternalId: string,
  ): Promise<SourcePage[]> {
    const key = `${seriesExternalId}/${chapterExternalId}`;
    const pages = this.fixtures.pages[key];
    // Capítulo vacío es []; la ausencia del listado es un fallo.
    if (!pages) throw new SourceError("PARSE", `Sin listado de Páginas: ${key}`);
    return pages;
  }
}
```

## Checklist de aceptación

Tests contra fixtures; sin red y sin DB. La suite compartida vive en `tests/contract/` y corre con `npm run test:contract`, sin app ni Postgres. La política HTTP para los adapters reales está en `src/sources/http.ts`; el adapter de Olympus la consume y sus tests de contrato la ejercen con un transporte de fixtures.

- [x] `search`: query con resultados, query vacía (catálogo), cursor con más páginas y cursor final.
- [x] `getSeries`: todos los campos, campos opcionales ausentes, `externalId` inexistente → `NOT_FOUND`.
- [x] `listChapters`: orden de la Fuente, número duplicado se devuelve tal cual, número no parseable → `null`.
- [x] `listRecentChapters`: más recientes primero, cursor con más páginas y cursor final, página vacía.
- [x] `getChapterPages`: orden y `position` 0-based, capítulo vacío, listado de imágenes ausente → `PARSE`.
- [x] HTTP: 302 al host trampa seguido de 200 → el reintento tiene éxito; 403 persistente → `BLOCKED`; 429 agotado → `RATE_LIMITED`; 5xx agotado → `UPSTREAM`; HTML roto → `PARSE`.
- [x] Nunca se devuelve una lista parcial: un error en mitad del parseo lanza.
- [x] El `FakeSourceAdapter` pasa la misma suite que cualquier adapter real.

### Adapter de Olympus (#20)

- [x] `search` recorre el Catálogo paginado (`/api/series?page=N`) y filtra localmente por título normalizado sobre `/api/series/list` cacheado; sin red en los tests.
- [x] `getSeries` mapea título, sinopsis, estado y géneros desde `/api/series/<slug>?type=comic`. Autores y año: Olympus no los expone; quedan vacíos hasta una Fuente de metadata (spec v1).
- [x] `listChapters` usa el JSON paginado de 40 por página (`direction=asc`) y exige el `meta.total` anunciado; `listRecentChapters` pide `direction=desc`.
- [x] `getChapterPages` lee las URLs de las Páginas del JSON `/api/capitulo/<slug>/<segmento>?type=comic` (`chapter.pages`) en orden 0-based.
- [x] El adapter real pasa la misma suite de contrato que el fake, con fixtures (`tests/contract/olympus-source-adapter.spec.ts`).
- [x] Los 302 al host trampa, 403, 429 y 5xx se reintentan y, al agotarse, lanzan el `kind` correcto (`tests/contract/olympus-http.spec.ts`).
- [x] Smoke manual contra Olympus ejecutado por una persona (procedimiento abajo); el agente no rastrea producción.

## Mecanismo de Olympus

El listado de capítulos de Olympus es JSON paginado en `/api/series/<slug>/chapters?page=N&direction=asc|desc&type=comic` (40 por página, `meta.last_page`); el slug de la API no lleva el prefijo `comic-`. Detalle en la resolución de [Mecanismo de listado de capítulos de Olympus](https://github.com/maxff77/manhwa/issues/13).

Las Páginas también son JSON: `GET /api/capitulo/<slug>/<segmento>?type=comic` devuelve `{ chapter: { pages: [url, ...] } }`, en orden de lectura. #13 había dejado este paso como HTML (`main.strip img`), pero el smoke del #20 lo vio bloqueado: el 302 al host trampa agotó los tres reintentos y lanzó `BLOCKED`, mientras las otras cuatro operaciones (todas JSON) respondieron. El mecanismo es interno al adapter, así que el contrato no cambia.

La Búsqueda no tiene endpoint server-side (#14): query vacía pagina `/api/series?page=N`; query no vacía descarga `/api/series/list` una vez (caché de 10 min, solo `type === "comic"`), normaliza NFD + minúsculas + trim y pagina en local de 20 en 20. Cursores opacos base64url (`{v,p}` para páginas, `{v,q,o}` para offsets). Un fallo del catálogo lanza `SourceError`; nunca se devuelve una lista vacía que mentiría sobre «sin resultados».

### Smoke manual (lo ejecuta una persona)

El agente no hace scraping de producción. El smoke vive en `tests/smoke/olympus.spec.ts` con su propia config (`playwright.smoke.config.ts`): **sin app ni Postgres**, pero con red real. Las suites de contrato y de la app lo excluyen (`testIgnore`), así que nunca corre en CI ni por accidente.

```bash
npm run smoke:olympus
```

Un solo test encadena las cinco operaciones contra Olympus, con el UA de bot propio y el espaciado del adapter, e imprime lo observado:

1. `search("")` → primera página del Catálogo (~15 Series) y si hay `nextCursor`.
2. `search("a")` → resultados del filtro local sobre `/api/series/list` (una sola petición; la segunda query reusa la caché).
3. `getSeries(<externalId de la primera Serie>)` → título, estado, géneros y si hay sinopsis.
4. `listRecentChapters(<externalId>)` → hasta 40 Capítulos, más nuevos primero.
5. `getChapterPages(<externalId>, <primer Capítulo>)` → número de Páginas y primera URL (`media.imagesolymp.xyz`), con `position` 0.

Al terminar:

- Anotar fecha/hora UTC y si hubo 302 al host trampa / 403 / 429 (el adapter reintenta solo; los fallos agotados salen como `SourceError` con su `kind`).
- Pegar la salida como comentario en #20 y marcar la casilla del smoke de arriba.

### Ejecución registrada (#20)

Ejecutado por el responsable el 2026-11-22 (UTC), sobre `44f6ab7`: **1 passed (4.8 s)**, sin 302 al host trampa, 403 ni 429 observados.

```
catálogo: 15 Series, nextCursor=true
primera Serie: comic-academia-de-la-ascension-20261121-080148449 — Academia de la Ascensión
búsqueda local "a": 20 resultados
detalle: estado=ongoing, géneros=9, sinopsis=sí
Capítulos recientes: 40, primero=199
Páginas del primer Capítulo: 33, primera URL=https://media.imagesolymp.xyz/comics/11/129141/(CREDITOS-OLYMPUS-2026-199.webp
```

Dos ejecuciones anteriores fallaron y motivaron cambios ya commiteados: el HTML del lector devolvía `BLOCKED` (→ Páginas por JSON, `aee39fd`) y `/api/series/list` abortaba a los 15 s (→ timeout de 30 s, `f6b54ae`).
