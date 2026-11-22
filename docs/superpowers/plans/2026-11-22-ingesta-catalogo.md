# Ingesta del Catálogo (#21) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un backfill idempotente y reanudable que deja en Postgres las ~890 Series de Olympus con géneros, estado, portada y último Capítulo, más el `Source` sembrado y un refresco diario por timer systemd.

**Architecture:** Un módulo de pipeline (`src/ingest/catalog.ts`) recibe `{ db, source }` inyectados y recorre `search("")` página a página; la identidad vive en `SeriesSource (sourceId, externalId)`, así que reanudar es volver a recorrer y saltar lo ya completo. Un entrypoint fino (`scripts/backfill-catalog.ts`) toma un advisory lock de Postgres, arma la composición real y emite logs JSON a stdout. El mismo script sirve de refresco diario: el trabajo por Serie se decide mirando la DB, no un modo aparte.

**Tech Stack:** TypeScript strict, Prisma 7 (`prisma-client`, adaptador pg), Playwright como runner de tests, `tsx` para ejecutar el script TS, Node 24, Postgres 17 (docker compose).

**Spec:** issue #21 + `docs/specs/v1.md` (§ Ingesta y adaptadores, § Operación, § Decisiones de testing), `docs/specs/catalog.md` (§ Ingesta), `docs/specs/search.md` (§ Datos), `docs/specs/source-adapter.md` (contrato y responsabilidades). No hay design doc aparte: el ticket está completamente especificado y el enfoque único quedó registrado en la conversación.

## Global Constraints

- El adapter nunca ve ids internos ni persiste; el pipeline es dueño de upserts, deduplicación y scheduling (`docs/specs/source-adapter.md`).
- `Series.slug` se deriva del título normalizado en kebab-case, con sufijo numérico si colisiona. La identidad de la Fuente vive en `SeriesSource.externalId`, nunca en el slug interno (`v1.md`).
- `normalizeTitle()`: NFD, quitar marcas diacríticas, minúsculas, espacios colapsados. **La puntuación se conserva.** Única función; llena `titleNormalized` y `originalTitleNormalized` al crear o actualizar (`search.md`).
- El backfill pide `getSeries` y la primera página de `listRecentChapters` solo para Series nuevas o sin Capítulos; **no marca `chaptersSyncedAt`** (`v1.md`).
- El refresco diario actualiza título, portada y estado de todas; detalle y capítulos solo para nuevas o sin Capítulos (`v1.md`).
- Un fallo del adapter nunca borra filas persistidas. Los reintentos a nivel de job viven fuera del adapter (`v1.md`).
- Un Capítulo con `number: null` se omite con log (el esquema exige número); números duplicados se insertan con `skipDuplicates` y se registra la anomalía (`alerts.md`, contrato).
- Logs estructurados en JSON a stdout (`v1.md` § Operación). Sin scheduler dentro de la app: timer systemd (`v1.md`).
- Tests contra el `FakeSourceAdapter` con fixtures y Postgres real; cero peticiones a Olympus o su CDN. El agente no ejecuta el backfill contra producción: lo corre una persona (precedente #20).
- Vocabulario del `GLOSSARY.md` en nombres de tests y fixtures: Serie, Capítulo, Fuente, Catálogo.
- Sin dependencias nuevas salvo `tsx` (devDependency, pineada `4.23.15`): Node strip-only no soporta parameter properties y los imports del repo son extensionless (verificado en probes de esta sesión).
- Commits terminan con `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Review Focus

Cinco condiciones que el spec implica y que los tests felices no ejercen; cada una tiene su test en la tarea dueña:

1. **Corte a mitad del catálogo** (anti-bot medido: 2 de 7 peticiones bloqueadas): reejecutar completa lo que falta sin duplicar ni re-pedir detalle de lo ya ingerido → Task 3.
2. **Fallo del adapter en una Serie intermedia**: las demás se procesan, nada persistido se borra, el proceso sale con código ≠ 0 → Task 3.
3. **Dos Series con el mismo título**: slugs distintos con sufijo numérico, identidades externas intactas → Task 2.
4. **Capítulo con `number: null` o número repetido en la primera página**: se omite/deduplica con log; `latestChapter` sigue poblado con los válidos → Task 2.
5. **Solape de ejecuciones** (timer diario + backfill manual): el segundo proceso sale 0 sin tocar la DB → Task 4.

---

### Task 1: `normalizeTitle()` compartida

**Files:**
- Create: `src/lib/normalize.ts`
- Test: `tests/contract/normalize.spec.ts` (pura, sin DB ni red: encaja en la config de contrato existente)

**Interfaces:**
- Produces: `export function normalizeTitle(title: string): string` — la usan Tasks 2 y 3 para `titleNormalized`, `originalTitleNormalized` y la base del slug.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { expect, test } from "@playwright/test";
import { normalizeTitle } from "../../src/lib/normalize";

test("normalizeTitle: NFD sin diacríticos, minúsculas, espacios colapsados, puntuación conservada", () => {
  expect(normalizeTitle("Academia de la Ascensión")).toBe("academia de la ascension");
  expect(normalizeTitle("  SOLO   Leveling  ")).toBe("solo leveling");
  expect(normalizeTitle("Re:Zero")).toBe("re:zero"); // la puntuación se conserva (search.md)
  expect(normalizeTitle("Ünïcödé")).toBe("unicode");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:contract -- normalize.spec.ts`
Expected: FAIL — no existe `src/lib/normalize`.

- [ ] **Step 3: Implementar**

`normalizeTitle`: `.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim().replace(/\s+/g, " ")`. El orden importa: colapsar después del trim. No reutilizar el `normalize()` privado de `olympus.ts`: aquel es del adapter (#14) y este es del dominio; cambiar uno no debe obligar a re-backfillear el otro.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test:contract -- normalize.spec.ts`
Expected: PASS. Además `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize.ts tests/contract/normalize.spec.ts
git commit -m "feat(ingest): normalizeTitle compartida del dominio (#21)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 2: Upsert de una Serie (identidad, slug, detalle, primeros Capítulos)

**Files:**
- Create: `src/ingest/catalog.ts`
- Modify: `package.json` (devDependency `tsx` `4.23.15`; script `"test:ingest": "playwright test --config playwright.ingest.config.ts"`)
- Create: `playwright.ingest.config.ts` (copia el patrón de `playwright.config.ts` — DATABASE_URL de test, `globalSetup`, workers 1 — pero **sin `webServer`**: el job no necesita la app)
- Modify: `playwright.config.ts` (`testIgnore` gana `"**/ingest/**"`)
- Test: `tests/ingest/upsert-series.spec.ts` (usa `tests/support/db.ts` y el fake)

**Interfaces:**
- Consumes: `normalizeTitle` (Task 1); `SourceAdapter`, `SourceSeriesSummary`, `SourceSeriesDetail`, `SourceChapterPage` de `src/sources/types.ts`; `PrismaClient` de `src/generated/prisma/client`.
- Produces (Task 3 los orquesta):
  - `export interface IngestDeps { db: PrismaClient; source: SourceAdapter; log: (event: Record<string, unknown>) => void }`
  - `export async function ensureSource(db: PrismaClient, slug: string): Promise<Source>` — upsert por `slug`; `name = "Olympus"` para `olympus`, `name = "Fuente falsa"` para `fake`, resto `slug`.
  - `export async function ingestSeries(deps: IngestDeps, sourceRow: Source, summary: SourceSeriesSummary): Promise<{ seriesId: string; created: boolean }>`
  - `export function slugify(title: string): string` — sobre `normalizeTitle`, no-alnum → `-`, sin guiones dobles ni de borde.

**Comportamiento fijado de `ingestSeries`:**
1. Busca `SeriesSource` por `(sourceId, externalId)` con su Serie y `_count.chapters`.
2. **Existente con Capítulos** → update de `title`, `titleNormalized`, `coverSourceUrl`, `status` (si el summary lo trae) y `url` del vínculo. Nada de `getSeries` ni capítulos. `created: false`.
3. **Nueva o sin Capítulos** → `getSeries(externalId)`; upsert de la Serie con detalle completo (synopsis, genres, authors, year, status del detalle con fallback al del summary y a `ONGOING`, `originalTitleNormalized` solo si hay `originalTitle`); luego `listRecentChapters(externalId)` (primera página, sin cursor) e insertar sus Capítulos.
4. Slug solo al crear: `slugify(title)`; si está ocupado por otra Serie, sufijo `-2`, `-3`, … hasta libre. Nunca se re-slugifica una Serie existente aunque cambie el título.
5. Capítulos: filtrar `number === null` (log `{ event: "chapter-skipped", reason: "number-null", externalId }`); `createMany({ skipDuplicates: true })` mapeando a `{ seriesId, sourceId, externalId, number, title, publishedAt }`; si el conteo insertado < válidos, log `{ event: "chapter-duplicate", ... }`. No toca `chaptersSyncedAt`.
6. Status: mapa `ongoing→ONGOING`, `completed→COMPLETED`, `hiatus→HIATUS`, `cancelled→CANCELLED`.

- [ ] **Step 1: Escribir los tests que fallan**

Fixtures propias (no las del contrato): dos Series en la primera página del fake, una con detalle completo y capítulos, otra sin capítulos; una tercera Serie cuyo título normalizado colisiona con la primera; una cuarta cuya primera página mezcla `number: null` y un número repetido. Tests (nombres del dominio):

```ts
test("ingestSeries crea la Serie con detalle, slug derivado y últimos Capítulos", async () => {
  // fake con academia (detalle: synopsis, genres ["Acción"], status ongoing; chapters desc: 3, 2, 1)
  const { seriesId, created } = await ingestSeries(deps, sourceRow, summary);
  expect(created).toBe(true);
  const serie = await prisma.series.findUniqueOrThrow({ where: { id: seriesId }, include: { chapters: true } });
  expect(serie.slug).toBe("academia-de-la-ascension");
  expect(serie.titleNormalized).toBe("academia de la ascension");
  expect(serie.genres).toEqual(["Acción"]);
  expect(serie.status).toBe("ONGOING");
  expect(serie.coverSourceUrl).toBe(summary.coverUrl);
  expect(serie.chapters).toHaveLength(3);
  const vinculo = await prisma.seriesSource.findFirstOrThrow({ where: { seriesId } });
  expect(vinculo.externalId).toBe(summary.externalId);
  expect(vinculo.chaptersSyncedAt).toBeNull(); // el backfill no la marca (v1.md)
});

test("reejecutar sobre una Serie con Capítulos no pide detalle ni duplica filas", async () => {
  // primera pasada; luego un fake whose getSeries/listRecentChapters lanzan si se llaman
  // (fixtures vacías + espía contador); segunda pasada con summary de título/portada/estado cambiados
  expect(created).toBe(false);
  // título, portada y estado actualizados; genres/synopsis intactos; mismos counts de Series/SeriesSource/Chapter
});

test("una Serie existente sin Capítulos recibe detalle y primera página", async () => {
  // seed de Serie+SeriesSource sin capítulos; ingestSeries → chapters poblados
});

test("dos Series con el mismo título reciben slugs distintos y conservan su identidad", async () => {
  // summaries externalId "a" y "b", mismo title
  expect(slugs).toEqual(["titulo-repetido", "titulo-repetido-2"]);
  // dos SeriesSource con externalId "a" y "b"
});

test("Capítulos con number null se omiten con log y los números repetidos no rompen la pasada", async () => {
  // página: [ {number: 5}, {number: null}, {number: 5, externalId distinto} ]
  // → 1 fila number 5; logs chapter-skipped y chapter-duplicate presentes
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm run test:ingest`
Expected: FAIL — módulo inexistente. (Antes: `npm install --save-dev --save-exact tsx@4.23.15` y crear la config; `npm run db:up` si el socket no responde — ping acotado `curl -s --max-time 5 --unix-socket ~/.docker/run/docker.sock http://localhost/_ping`, precedente del learning del 19-nov.)

- [ ] **Step 3: Implementar `src/ingest/catalog.ts` según el comportamiento fijado**

El chequeo de slug libre es `findUnique({ where: { slug } })` en bucle con contador; concurrencia real no existe (un solo proceso, advisory lock en Task 4) — dejar comentario `// ponytail: check-then-insert, el lock del job serializa; constraint unique si entra otro escritor`. La transacción por Serie envuelve upsert de Serie + vínculo + capítulos (`db.$transaction`) para que un corte no deje Series a medias sin vínculo.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm run test:ingest` → PASS · `npm run typecheck` limpio · `npm run test:contract` sigue verde (65 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ingest/catalog.ts tests/ingest/ playwright.ingest.config.ts playwright.config.ts package.json package-lock.json
git commit -m "feat(ingest): upsert idempotente de Serie con detalle y últimos Capítulos (#21)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 3: Recorrido del Catálogo, reanudación y tolerancia a fallos

**Files:**
- Modify: `src/ingest/catalog.ts`
- Test: `tests/ingest/backfill-catalog.spec.ts`

**Interfaces:**
- Consumes: `IngestDeps`, `ensureSource`, `ingestSeries` (Task 2).
- Produces: `export async function backfillCatalog(deps: IngestDeps): Promise<{ pages: number; processed: number; failed: number }>` — la llama el entrypoint (Task 4).

**Comportamiento fijado:**
1. `ensureSource(db, deps.source.slug)` una vez.
2. Bucle `search("", cursor)` hasta `nextCursor === undefined`; por cada item, `ingestSeries`. Log por página `{ event: "page", page, items }` y por Serie nueva `{ event: "series-created", externalId, slug }`.
3. `SourceError` en `ingestSeries` → log `{ event: "series-failed", externalId, kind, message }`, `failed++`, **continúa** con la siguiente Serie. Nada se borra.
4. `SourceError` en `search` → log `{ event: "catalog-failed", kind, message }` y **lanza**: el recorrido no puede seguir sin listado; lo ya persistido queda (reanudación = reejecutar).
5. Devuelve los contadores; el entrypoint decide el exit code.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
test("backfillCatalog recorre todas las páginas y hace upsert de Source, Series y SeriesSource", async () => {
  // fake: 2 páginas (2+1 Series), detalle y capítulos para las 3
  const result = await backfillCatalog(deps);
  expect(result).toEqual({ pages: 2, processed: 3, failed: 0 });
  expect(await prisma.source.count()).toBe(1);
  expect(await prisma.series.count()).toBe(3);
  expect(await prisma.seriesSource.count()).toBe(3);
  // latestChapter poblado: cada Serie tiene capítulos con publishedAt
});

test("reejecutar el backfill no duplica filas ni vuelve a pedir detalle", async () => {
  await backfillCatalog(deps);
  const counts = { series: await prisma.series.count(), chapters: await prisma.chapter.count() };
  const spy = countingAdapter(fixtures); // envuelve el fake y cuenta getSeries/listRecentChapters
  await backfillCatalog({ ...deps, source: spy });
  expect(spy.detailCalls).toBe(0);
  expect(await prisma.series.count()).toBe(counts.series);
  expect(await prisma.chapter.count()).toBe(counts.chapters);
});

test("un corte a mitad del catálogo se reanuda sin repetir trabajo", async () => {
  // fake cuya página 2 lanza SourceError("BLOCKED") en la primera ejecución
  await expect(backfillCatalog(deps)).rejects.toMatchObject({ kind: "BLOCKED" });
  expect(await prisma.series.count()).toBe(2); // página 1 persistida
  // segunda ejecución con el fake sano: completa la tercera Serie, total 3, sin duplicados
});

test("un fallo del adapter en una Serie no borra filas y las demás se procesan", async () => {
  // getSeries de la Serie del medio lanza SourceError("UPSTREAM")
  const result = await backfillCatalog(deps);
  expect(result.failed).toBe(1);
  expect(await prisma.series.count()).toBe(2);
  // los logs contienen series-failed con kind UPSTREAM
});

test("el refresco diario actualiza título, portada y estado sin re-pedir detalle de Series con Capítulos", async () => {
  // backfill inicial; mutate fixtures del listado (título/portada/status nuevos, detalle viejo intacto)
  const spy = countingAdapter(mutated);
  await backfillCatalog({ ...deps, source: spy });
  expect(spy.detailCalls).toBe(0);
  // la Serie refleja el título/portada/estado nuevos
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm run test:ingest -- backfill-catalog`
Expected: FAIL — `backfillCatalog` no existe.

- [ ] **Step 3: Implementar el recorrido según el comportamiento fijado**

El `try/catch` por Serie captura solo `SourceError`; cualquier otro error es un bug y se propaga (no enmascarar). El catch de `search` no distingue kinds: todos cortan el recorrido.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm run test:ingest` → PASS · `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/catalog.ts tests/ingest/backfill-catalog.spec.ts
git commit -m "feat(ingest): backfill del Catálogo reanudable y tolerante a fallos del adapter (#21)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 4: Entrypoint con advisory lock, logs JSON y unidades systemd

**Files:**
- Create: `scripts/backfill-catalog.ts`
- Modify: `package.json` (script `"catalog:backfill": "tsx scripts/backfill-catalog.ts"`)
- Modify: `docs/specs/catalog.md` (§ Ingesta: procedimiento, unidades systemd, quién lo ejecuta)
- Test: `tests/ingest/entrypoint.spec.ts`

**Interfaces:**
- Consumes: `backfillCatalog`, `IngestDeps` (Task 3); `createComposition()` de `src/composition.ts` (elige adapter por `SOURCE_ADAPTER`, sin fallback).
- Produces: comando `npm run catalog:backfill` (mismo comando para carga inicial y refresco diario).

**Comportamiento fijado del entrypoint:**
1. `dotenv/config` primero (Prisma 7 no carga `.env` solo — precedente del learning del 16-nov).
2. Advisory lock: `SELECT pg_try_advisory_lock(hashtext('manhwa:catalog-backfill'))` sobre el cliente de `src/lib/db.ts`; si no lo consigue, log `{ event: "lock-busy" }` y exit 0 (patrón de `alerts.md`). La conexión lo libera al terminar; `$disconnect` explícito en `finally`.
3. `log` = `console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }))`.
4. `createComposition()` → `backfillCatalog({ db, source, log })`; log final `{ event: "done", pages, processed, failed }`.
5. Exit code: `failed > 0` o excepción → log `{ event: "fatal", message }` (si excepción) y exit 1; si no, exit 0. El timer reintenta mañana; el operador puede relanzar a mano (reanudable).

- [ ] **Step 1: Escribir el test que falla (entrypoint por subprocess, Postgres real)**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const env = { ...process.env, SOURCE_ADAPTER: "fake", DATABASE_URL: process.env.DATABASE_URL! };

test("el entrypoint corre con el adapter falso y sale 0 con la base limpia", async () => {
  // el fake del registry arranca sin fixtures: catálogo vacío es una pasada válida de 0 páginas…
  // …pero search("") del fake devuelve { items: [] } sin nextCursor: 1 página, 0 Series
  const { stdout } = await run("npm", ["run", "catalog:backfill"], { env });
  const events = stdout.trim().split("\n").map((l) => JSON.parse(l));
  expect(events.at(-1)).toMatchObject({ event: "done", failed: 0 });
});

test("con el lock tomado, el segundo proceso sale 0 sin tocar la DB", async () => {
  // tomar pg_try_advisory_lock(hashtext('manhwa:catalog-backfill')) desde el test con prisma
  const { stdout } = await run("npm", ["run", "catalog:backfill"], { env });
  expect(stdout).toContain("lock-busy");
  // liberar con pg_advisory_unlock al final
});

test("sin SOURCE_ADAPTER el entrypoint sale 1 con log fatal", async () => {
  await expect(run("npm", ["run", "catalog:backfill"], { env: { ...env, SOURCE_ADAPTER: "" } }))
    .rejects.toMatchObject({ code: 1 });
});
```

Nota: el fixture-free fake del registry basta aquí porque estos tests prueban el **cableado** (lock, env, logs, exit), no los datos — los datos los prueban Tasks 2–3 con fixtures inyectadas.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm run test:ingest -- entrypoint`
Expected: FAIL — script `catalog:backfill` inexistente.

- [ ] **Step 3: Implementar el entrypoint y documentar las unidades**

En `docs/specs/catalog.md` § Ingesta, añadir: el comando, que la carga inicial y el refresco diario son el mismo script, que lo ejecuta una persona/systemd (el agente no rastrea producción, precedente #20), y las unidades calcadas del patrón de `alerts.md`:

```ini
# /etc/systemd/system/manhwa-catalog.service
[Unit]
Description=Manhwa catalog daily refresh
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/srv/manhwa
ExecStart=/usr/bin/npm run catalog:backfill
```

```ini
# /etc/systemd/system/manhwa-catalog.timer
[Unit]
Description=Run Manhwa catalog refresh daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=15min
Persistent=true
Unit=manhwa-catalog.service

[Install]
WantedBy=timers.target
```

Marcar en el issue los criterios cumplidos; el criterio de datos reales (~890 Series) queda pendiente de la ejecución humana contra Olympus, igual que el smoke de #20: documentar el procedimiento (`SOURCE_ADAPTER=olympus npm run catalog:backfill`) sin ejecutarlo.

- [ ] **Step 4: Verificar todo**

Run: `npm run test:ingest` → PASS · `npm run typecheck` limpio · `npm run test:contract` → PASS (suite completa, una vez) · `npm run test:e2e` → PASS (la app no cambió, pero el arnés exige la suite completa al cerrar).

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-catalog.ts tests/ingest/entrypoint.spec.ts package.json docs/specs/catalog.md
git commit -m "feat(ingest): entrypoint del backfill con advisory lock y timer diario documentado (#21)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Cierre (tras la última tarea)

- `trail check` antes del push; conflictos léxicos esperables sobre texto de spec (precedente #20): verificar contra el código y justificar en el mensaje de commit, nunca relajar learnings.
- Learning de sesión con `trail note` si algo no obvio quedó decidido (p. ej. por qué el pipeline no reutiliza el `normalize()` del adapter), commiteado con el cambio.
- Revisión con `mattpocock-skills:code-review` (lo pide el comando `/implement`), exportando el diff a archivo para los sub-agentes (no ven el filesystem del host — learning del 21-nov).
- Reticle: **se omite** — el cambio es un job de backend sin superficie UI; decirlo en una línea en el reporte final (regla de AGENTS.md). La home vacía no cambia con este ticket.
- Comentario en #21 con el resultado y qué queda para el humano (ejecución real contra Olympus), label `ready-for-human` si la corrida de producción es criterio de cierre.
