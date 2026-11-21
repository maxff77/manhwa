---
title: "El adapter real de Olympus ya existe: el mecanismo se verificó y la suite afirma lo que cada Fuente expone"
author: Richard
date: 2026-11-21
branch: main
cost: { minutes: 68, tokens: 18166226 }
id: l-441dc5bb
scope: repo
status: active
replaces: l-8d96c0ce
src: agent
touches:
  - docs/specs/source-adapter.md
  - src/sources/olympus.ts
  - tests/contract/olympus-http.spec.ts
  - tests/contract/olympus-source-adapter.spec.ts
  - tests/contract/suite.ts
  - tests/contract/support/olympus-fixtures.ts
  - src/sources/registry.ts
  - src/sources/types.ts
  - tests/contract/source-adapter.spec.ts
  - tests/contract/http.spec.ts
---

## Decided
- El adapter real de Olympus ya se construyó (#20, commits `3b1746f` y `ac5b33d`). Lo que el 12-nov se descartó era usarlo como *referencia del contrato* mientras el mecanismo era desconocido; #13 (capítulos JSON paginados) y #14 (búsqueda local sobre `/api/series/list`) están cerrados y verificados, así que esa razón ya no aplica. El fake sigue siendo el adapter de referencia para los tests del pipeline.
- La suite de contrato compartida deriva las identidades externas de `search()` y afirma datos del dominio (títulos, números, orden). Los cursores se siguen comprobando como opacos. Dos casos negativos usan identidades fijas con nombre (`EMPTY_SERIES_ID`, id inexistente) y el comentario lo declara.
- Autores y año: Olympus no los expone. `getSeries` devuelve `authors: []` y omite `year`; la suite lo **afirma** con `expectedDetailFields` en vez de relajar el check a una comprobación de forma. El fake debe seguir devolviendo `["Autora Uno"]` y `2024`.

## Tried and ruled out
- Relajar autores/año a `Array.isArray` / `undefined-or-number` para que el adapter real pasara: debilitaba el contrato para ponerlo verde. Se revirtió en la revisión; cada Fuente afirma lo que expone.
- Redeclarar `status`/`trap` y los slugs en el spec de Olympus: `4368056` ya había fijado una sola copia por helper. Ahora viven en `tests/contract/support/olympus-fixtures.ts`.

## Watch out
- `trail check` marca 7 conflictos léxicos sobre el texto del spec (suite/app, adapter real, autores/año, `/api/series`, redirect 302, cursor, Chrome). Verificados uno por uno contra el código commiteado: la suite de contrato sigue fuera de la config de la app (`testIgnore: "**/contract/**"`), no hay cambios en `src/app`, no se envía ningún parámetro de texto a `/api/series`, y el seam de la app sigue corriendo en Chromium. La justificación va en ambos mensajes de commit.
- Los sub-agentes de revisión de esta sesión no ven el filesystem del host: hay que exportar el diff a un archivo y pasárselo por ruta, o revisar en el host.

In the code:
- src/sources/olympus.ts, src/sources/registry.ts, src/sources/types.ts (`status?` en el resumen)
- tests/contract/suite.ts (`expectedDetailFields`, `EMPTY_SERIES_ID`), tests/contract/olympus-source-adapter.spec.ts, tests/contract/olympus-http.spec.ts, tests/contract/support/olympus-fixtures.ts
- docs/specs/source-adapter.md (checklist de #20 + «Smoke manual», casilla de ejecución aún sin marcar)
- `npm run typecheck` limpio · `npm run test:contract` → 63 passed · `npm run test:e2e` → 5 passed
