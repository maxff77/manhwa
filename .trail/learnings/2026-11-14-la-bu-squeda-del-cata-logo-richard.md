---
title: "La búsqueda del catálogo es local, por título normalizado y sin índice"
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 10, tokens: 53022 }
id: l-3fdd5c56
scope: repo
status: active
src: agent
touches:
  - docs/specs/search.md
  - GLOSSARY.md
  - prisma/schema.prisma
---

## Decided
La plataforma busca Series solo por `title` y `originalTitle`, sobre las Series ya ingestadas; no consulta Olympus en vivo. La coincidencia es por término (substring, sin tildes ni mayúsculas) sobre columnas normalizadas y el orden es exacto → prefijo → resto. La API es `GET /api/series?q=` con cursor opaco de offset, límite 20 por defecto y 50 máximo, sin `total`.

## Tried and ruled out
- `pg_trgm` + GIN y `unaccent` desde v1: con ~890 Series el escaneo secuencial es de microsegundos; se pospone hasta ~10.000 Series o p95 > 50 ms.
- Full-text `tsvector` en español: no hace substring y el stemming estorba con nombres propios y préstamos.
- Ranking por popularidad o `updatedAt`: `Follow` arranca en cero y `updatedAt` cambia en cada scrape.
- Fallback en vivo a `/api/series/list` para Series no ingestadas: duplica tráfico y anti-bot, y rompe la deduplicación canónica.
- Fuzzy/erratas y plegado de puntuación en v1: sin datos de uso que justifiquen el costo.

## Watch out
La búsqueda solo es completa si el primer vertical slice ingiere las 890 Series. Cambiar la función de normalización exige backfill de las columnas normalizadas. `rezero` no encuentra «Re:Zero» porque la puntuación se conserva.

In the code: `docs/specs/search.md`; `GLOSSARY.md` (Catálogo, Búsqueda); `prisma/schema.prisma` (Series.titleNormalized y originalTitleNormalized, pendientes); issue #15.
