---
title: El adapter de fuentes traduce a datos propios y es dueño del HTTP de su fuente
author: Richard
date: 2026-11-12
branch: docs/modelo-datos
cost: { minutes: 12, tokens: 68573 }
id: l-8d96c0ce
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/specs/source-adapter.md
  - prisma/schema.prisma
  - docs/agents/issue-tracker.md
---

## Decided
- El contrato `SourceAdapter` cubre solo fuentes de contenido; en v1 la única implementación es Olympus. MangaDex (solo metadata) queda fuera.
- El adapter devuelve DTOs propios (`SourceSeriesSummary`, `SourceSeriesDetail`, `SourceChapter`, `SourcePage`), no modelos de Prisma: la Fuente no conoce ids internos ni estado de caché. El mapeo a la DB es del pipeline.
- Cuatro operaciones: `search`, `getSeries`, `listChapters`, `getChapterPages`. Sin operación de novedades: las alertas comparan `listChapters` de las series seguidas contra la DB.
- Identidad externa: slug de la serie y segmento de la URL del capítulo; el número se parsea aparte y puede ser `null`.
- El adapter es dueño de la política HTTP de su fuente (UA de bot propio, timeout, una petición en vuelo por host, reintentos con backoff ante 302 al host trampa / 403 / 429 / 5xx) y lanza `SourceError` tipado al rendirse. El pipeline es dueño de reintentos de job, concurrencia, persistencia y monitoreo.
- Registry estático por `slug`, que coincide con `Source.slug`: agregar una fuente = fila en `Source` + módulo del adapter + una línea en el registry.

## Tried and ruled out
- Interfaz única con métodos opcionales y flags de capacidad para meter MangaDex: descartado; es metadata-only y opcional, y ensuciaba el contrato de contenido.
- Devolver modelos de Prisma desde el adapter: descartado; obliga a la Fuente a rellenar ids internos y estado de caché.
- Operación `latest`/`updates` para novedades: descartado por especulativa; las alertas ya se resuelven comparando `listChapters` por serie seguida.
- Adapter real de Olympus como referencia en este ticket: descartado; su listado de capítulos carga por JS y el mecanismo no se conoce. Se usó un fake.

## Watch out
- El listado de capítulos de Olympus no está en el HTML y no se conoce el endpoint que lo alimenta; el contrato no depende del mecanismo, pero el adapter real sí.
- `number: null` significa que el pipeline debe omitir el capítulo con log.
- La DB tiene unique `(seriesId, sourceId, number)`: si la Fuente repite números, el sync fallará.

In the code:
- docs/specs/source-adapter.md
- prisma/schema.prisma (comentario de `Source`)
- GLOSSARY.md (Fuente de contenido / Fuente de metadata)
- issue #6, research #13
