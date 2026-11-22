---
title: "La identidad de Capítulo es por Serie y Fuente, no global de la Fuente"
author: Richard
date: 2026-11-22
branch: feat/ingesta-catalogo
cost: { minutes: 174, tokens: 40061066 }
id: l-a7343a15
scope: repo
status: active
src: agent
touches:
  - docs/specs/alerts.md
  - docs/specs/catalog.md
  - package.json
  - scripts/backfill-catalog.ts
  - tests/ingest/entrypoint.spec.ts
  - prisma/migrations/20261122000000_chapter_identity_per_series/migration.sql
  - prisma/schema.prisma
  - src/ingest/catalog.ts
  - tests/ingest/backfill-catalog.spec.ts
  - package-lock.json
---

## Decided
- La identidad de un Capítulo es (seriesId, sourceId, externalId), no (sourceId, externalId). El segmento de URL («1», «2»…) se repite entre Series de la misma Fuente: con la clave global, `createMany({ skipDuplicates: true })` descartaba silenciosamente los Capítulos de toda Serie salvo la primera ingestada.
- El spec `docs/specs/source-adapter.md:36` ya fijaba la identidad correcta; la migración inicial (`20261116174129_init`) la declaró mal. Se corrige con `20261122000000_chapter_identity_per_series`.
- El test de contrato del timeout por defecto compara dos `AbortSignal` creados en el mismo instante y exige un margen de 1 s entre ellos. Ese margen es mas pequeno que el jitter del event loop bajo carga: fallo dos veces (32447 ms vs 33445 ms esperado; 30002 ms vs 30738 ms) y paso aislado y en rerun completo. No es una regresion: ni el transporte ni ese test se tocaron en la rama, y la suite de contrato no importa Prisma ni abre la base.
- No se relaja el check para ponerlo verde. Un rojo ahi se diagnostica midiendo de nuevo, no bajando el margen.
- Correr la suite de contrato sola, sin un build de Next en paralelo, elimina el falso rojo.

## Tried and ruled out
- Mantener la clave global y prefijar el externalId con el slug de la Serie en el adapter: rompía el contrato (el adapter no conoce ids internos ni slugs de otras Series) y obligaba a migrar datos en producción.
- Relajar a índice no único: perdía la deduplicación idempotente del poller de alertas.
- Atribuir el fallo al cambio del cliente de base de datos: la suite de contrato corre sin app y sin DB (`playwright.contract.config.ts` solo fija testDir y reporter), asi que ese codigo no esta en su grafo de imports.
- Subir el margen o el timeout del test: debilitaba la unica comprobacion del plazo real de 30 s que motivo el fix del catalogo completo.

## Watch out
- Cualquier consumidor futuro que busque Capítulos por `(sourceId, externalId)` sin la Serie fallará: usar siempre la terna completa.
- El spec de alertas (`docs/specs/alerts.md:36`) citaba la clave vieja; se actualizó en este mismo branch. Revisar specs similares al cambiar claves únicas.

In the code:
- prisma/schema.prisma (Chapter @@unique([seriesId, sourceId, externalId]))
- prisma/migrations/20261122000000_chapter_identity_per_series/migration.sql
- docs/specs/alerts.md:36
- src/ingest/catalog.ts (createMany mapea seriesId + sourceId + externalId)
- El test dura ~30 s y lleva `test.setTimeout(60_000)` a nivel de archivo: cualquier carga concurrente (build, otra suite) puede comerse el margen de 1 s.
- Antes de tocar el transporte por un rojo aqui, comprobar con `git diff` si el transporte o el test cambiaron; si no, rerun aislado.

- tests/contract/http.spec.ts:195 (margen `expect(propio).toBeGreaterThan(quince + 1_000)`)
- src/sources/http.ts (`TIMEOUT_MS = 30_000`, intacto en esta rama)
- playwright.contract.config.ts (sin webServer ni globalSetup)
- `npm run test:contract` -> 65 passed en rerun; el fallo aislado pasa en 30.0 s y 43.0 s
