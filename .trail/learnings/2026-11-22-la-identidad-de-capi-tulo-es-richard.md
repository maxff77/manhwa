---
title: "La identidad de Capítulo es por Serie y Fuente, no global de la Fuente"
author: Richard
date: 2026-11-22
branch: feat/ingesta-catalogo
cost: { minutes: 112, tokens: 20195319 }
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

## Tried and ruled out
- Mantener la clave global y prefijar el externalId con el slug de la Serie en el adapter: rompía el contrato (el adapter no conoce ids internos ni slugs de otras Series) y obligaba a migrar datos en producción.
- Relajar a índice no único: perdía la deduplicación idempotente del poller de alertas.

## Watch out
- Cualquier consumidor futuro que busque Capítulos por `(sourceId, externalId)` sin la Serie fallará: usar siempre la terna completa.
- El spec de alertas (`docs/specs/alerts.md:36`) citaba la clave vieja; se actualizó en este mismo branch. Revisar specs similares al cambiar claves únicas.

In the code:
- prisma/schema.prisma (Chapter @@unique([seriesId, sourceId, externalId]))
- prisma/migrations/20261122000000_chapter_identity_per_series/migration.sql
- docs/specs/alerts.md:36
- src/ingest/catalog.ts (createMany mapea seriesId + sourceId + externalId)
