---
title: "Olympus no tiene búsqueda server-side: el adapter filtra el catálogo completo en local"
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 11, tokens: 40070 }
id: l-39dc61f4
scope: repo
status: active
src: agent
touches:
  - docs/specs/source-adapter.md
  - docs/agents/issue-tracker.md
  - GLOSSARY.md
---

## Decided
- La Fuente Olympus no ofrece búsqueda textual; el adapter implementa `search(query)` sin red extra por query: query vacía → `GET /api/series?page=N` (15/página, 60 páginas, 890 cómics) con cursor de página; query no vacía → un fetch cacheado (TTL 10 min) de `/api/series/list`, filtro local `type === "comic"` y normalización NFD + lowercase + trim, paginación local 20/página con cursor por offset.
- Un fallo de `/api/series/list` se propaga como `SourceError`; no se devuelve lista vacía, que mentiría sobre «sin resultados».

## Tried and ruled out
- Búsqueda server-side en `/api/series`: los 9 parámetros de texto probados (`search`, `q`, `query`, `name`, `title`, `nombre`, `buscar`, `s`, `filter[name]`) devuelven el mismo payload byte a byte que `page=1`; `/api/search` y `/api/series/search` dan 404. No es un falso negativo.
- Recorrer las 60 páginas del catálogo por query: son 60 peticiones por búsqueda.
- Navegador headless: `/api/series/list` y `/api/series?page=N` son JSON.

## Watch out
- `/api/series/list` no está documentado, no se midió su tamaño y es volátil: la búsqueda server-side histórica (`/api/search`) desapareció. Si cambia, la búsqueda no vacía falla.
- El catálogo deriva (889 → 890 en dos días); el cursor por offset sobre una caché de 10 min puede desalinearse.
- Que el modal ⌘K del sitio use `/api/series/list` es inferencia: no se localizó el chunk JS. La evidencia son dos clientes independientes (Mihon y Msopla) y el comportamiento del backend.

In the code:
- docs/research/olympus-search.md (rama research/olympus-search, commit 2693845)
- docs/specs/source-adapter.md (contrato `search(query, cursor?)`)
- Issue #14 (cerrado); ticket de plataforma #15
