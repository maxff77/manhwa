---
title: La página de Serie sincroniza al visitar y reidentifica el Capítulo en vez de borrarlo
author: Richard
date: 2026-11-26
branch: design/theme-uber
cost: { minutes: 373, tokens: 82374400 }
id: l-28f29e59
scope: repo
status: active
src: agent
touches:
  - tests/ingest/sync-series.spec.ts
  - src/ingest/catalog.ts
  - tests/series.spec.ts
  - "src/app/series/[slug]/page.tsx"
  - src/sources/fake.ts
  - src/sources/registry.ts
  - src/lib/format.ts
  - src/app/page.tsx
  - prisma/schema.prisma
  - tests/support/seed.ts
---

## Decided
- La sincronización al visitar una Serie (`syncSeries`) pide `getSeries` + la lista completa cuando `chaptersSyncedAt` es nulo o tiene 10 minutos o más, y hace detalle + Capítulos + marca en UNA transacción: un corte no puede dejar la fecha marcada sobre una lista a medias.
- Un fallo del adapter se registra (`series-sync-failed`) y se propaga sin tocar lo persistido; la página captura el `SourceError` y sirve los datos previos. Nunca una lista parcial.
- Cuando la Fuente cambia el segmento de URL de un Capítulo pero conserva su número, la fila existente se REIDENTIFICA (`chapter.update` con el nuevo externalId) en vez de borrarse: `Chapter` cuelga de `Progress` y `Comment` con `onDelete: Cascade`, así que borrarla se llevaría el Progreso del Usuario. Log `chapter-reidentified`.
- Dos Capítulos distintos con el mismo número en la misma pasada se deduplican por número antes del upsert (el primero de la Fuente gana, log `chapter-duplicate`): `(seriesId, sourceId, number)` también es único y el upsert por externalId abortaría toda la transacción.
- Los helpers de formato (`STATUS_LABEL`, `chapterNumber`, `shortDate`, `genreLabel`) viven en un módulo compartido: la home y la página de Serie los usaban duplicados.
- Un paso guardado que navega a otra ruta (clic en un enlace del App Router) se verifica conduciéndolo a mano: `reticle_act_and_wait { target: { testid }, until: allOf[route, net] }`. Eso devuelve `verified: yes` con grado net y marca el intent como `proved` con `provenBy{runId, verdictId, grade}`. Es la evidencia que vale para cerrar el ticket.
- Los enlaces que un flujo va a pulsar llevan `data-testid` estable derivado de la identidad externa, no del número ni de la fecha formateada: el nombre accesible incluye la fecha («Capítulo 3 2 ene 2026") y Reticle lo marca `data_bound`, así que el ancla por rol no sobrevive a un cambio de datos.
- El arnés de v1 da datos al adapter falso por variable de entorno apuntando a un JSON, no hardcodeando fixtures en el composition root.

## Tried and ruled out
- Fixtures hardcodeadas en el registry para que la app con SOURCE_ADAPTER=fake pudiera sincronizar: el composition root queda acoplado a datos de demo y el test de la página pasaba a afirmar el texto de la fixture en vez de su propia siembra. Se revirtió; el registry vuelve a arrancar vacío.
- Borrar el Capítulo cuyo número ocupa otro externalId: la cascada se lleva Progreso y Comentarios. Medido con un test que siembra Progreso antes de sincronizar.
- Un `return` silencioso cuando la Serie no tiene vínculo de la Fuente activa: la sincronización se saltaba para siempre sin dejar rastro. Ahora registra `series-sync-skipped`.
- `reticle_flow_replay` del flujo guardado: devuelve `unverifiable` («the page's connection to Reticle was replaced while step 0 was running») en más de ocho intentos — partiendo de `startPath`, tras navegar a mano, con `at: 0` y en un tab headless aislado (`reticle_lease`). El paso SÍ lleva `expect`, así que el consejo de «record the step's consequence with expect» no aplica. Es un defecto de Reticle al reproducir un paso que cambia de documento, no del código.
- Anclar el paso por nombre accesible: `replayability: data_bound` porque el nombre lleva la fecha formateada.
- Editar a mano el JSON del flujo para cambiar el ancla a `{ kind: "testid", testid: ... }`: `flow_parse_failed`. El campo correcto es `value`, no `testid`.
- `reticle_assert { action: "now" }` después del clic para graduar el intent: `verified: no` porque el buffer ya había descartado la petición («event buffer evicted older events»). El veredicto hay que sacarlo en el mismo `act_and_wait`, no después.
- Fixtures hardcodeadas en el registry: acoplaban producción a datos de demo y el test de la página pasaba a afirmar el texto de la fixture en vez de su propia siembra.

## Watch out
- El lector (`/series/<slug>/capitulo/<externalId>`) todavía no existe: los enlaces de la lista navegan a un 404 hasta que se construya ese ticket. Reticle probó el cambio de ruta, no que el lector renderice.
- La UI de Seguimiento tampoco existe aún; el spec exige que solo se pueda Seguir después de esta sincronización.
- El umbral es `>= 10 min`; el spec dice «más de 10 minutos». Exactamente 10 minutos re-sincroniza.

In the code:
- src/ingest/catalog.ts (`syncSeries`, `SYNC_TTL_MS = 10 * 60_000`)
- src/app/series/[slug]/page.tsx (`dynamic = "force-dynamic"`, try/catch sobre SourceError)
- src/lib/format.ts
- tests/ingest/sync-series.spec.ts (6 casos), tests/series.spec.ts
- `reticle_assert` no acepta `intentId`; el parámetro es `intent` (acepta el id de un intent ya declarado).
- Un veredicto `yes` sobre una ruta que responde 404 prueba la navegación, no que la página destino renderice. Aquí el lector aún no existe: decirlo siempre.
- El motor de Docker se cayó a mitad de sesión y Postgres dejó de escuchar; `open -a Docker` + esperar `docker info` y `docker compose up -d --wait db` lo recupera. Sin eso las suites de ingesta y de app no corren, pero la de contrato sí (no usa DB).

- `.reticle/flows/manhwa-927de0d9/serie-sync-y-enlace-al-lector.json` (ancla `{ kind: "testid", value: "capitulo-capitulo-3" }`, `success` net)
- `.reticle/intent/serie-sync-y-enlace-al-lector/intent.json` (`state: proved`, `provenBy.grade: net`)
- `src/app/series/[slug]/page.tsx:124` (`data-testid={`capitulo-${chapter.externalId}`}`)
- `src/sources/fake.ts` (`loadFakeFixtures`), `src/sources/registry.ts` (`FAKE_FIXTURES_FILE`)
- Reporte del defecto: `.reticle/feedback/2026-11-27T01-40-42-549-bug.md` (gitignored; telemetry desactivada, no se envió)
