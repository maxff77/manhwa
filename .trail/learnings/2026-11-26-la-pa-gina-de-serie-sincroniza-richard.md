---
title: La página de Serie sincroniza al visitar y reidentifica el Capítulo en vez de borrarlo
author: Richard
date: 2026-11-26
branch: design/theme-uber
cost: { minutes: 272, tokens: 30028803 }
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

## Tried and ruled out
- Fixtures hardcodeadas en el registry para que la app con SOURCE_ADAPTER=fake pudiera sincronizar: el composition root queda acoplado a datos de demo y el test de la página pasaba a afirmar el texto de la fixture en vez de su propia siembra. Se revirtió; el registry vuelve a arrancar vacío.
- Borrar el Capítulo cuyo número ocupa otro externalId: la cascada se lleva Progreso y Comentarios. Medido con un test que siembra Progreso antes de sincronizar.
- Un `return` silencioso cuando la Serie no tiene vínculo de la Fuente activa: la sincronización se saltaba para siempre sin dejar rastro. Ahora registra `series-sync-skipped`.

## Watch out
- El lector (`/series/<slug>/capitulo/<externalId>`) todavía no existe: los enlaces de la lista navegan a un 404 hasta que se construya ese ticket. Reticle probó el cambio de ruta, no que el lector renderice.
- La UI de Seguimiento tampoco existe aún; el spec exige que solo se pueda Seguir después de esta sincronización.
- El umbral es `>= 10 min`; el spec dice «más de 10 minutos». Exactamente 10 minutos re-sincroniza.

In the code:
- src/ingest/catalog.ts (`syncSeries`, `SYNC_TTL_MS = 10 * 60_000`)
- src/app/series/[slug]/page.tsx (`dynamic = "force-dynamic"`, try/catch sobre SourceError)
- src/lib/format.ts
- tests/ingest/sync-series.spec.ts (6 casos), tests/series.spec.ts
