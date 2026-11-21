---
title: "El adapter real de Olympus se construye con el mecanismo ya verificado y la suite de contrato afirma datos, no identidades"
author: Richard
date: 2026-11-21
branch: main
cost: { minutes: 167, tokens: 19056482 }
id: l-c05434e0
scope: repo
status: active
src: agent
touches:
  - src/sources/types.ts
  - tests/contract/support/olympus-fixtures.ts
  - tests/contract/suite.ts
  - tests/contract/olympus-source-adapter.spec.ts
  - src/sources/olympus.ts
  - tests/contract/olympus-http.spec.ts
  - src/sources/registry.ts
  - tests/contract/source-adapter.spec.ts
  - docs/specs/source-adapter.md
  - docs/agents/issue-tracker.md
---

## Decided
- El adapter real de Olympus se construye ahora (#20), no como referencia del contrato: el mecanismo ya está verificado (#13 capítulos JSON paginados, #14 búsqueda local sobre `/api/series/list`). Lo descartado el 12-nov era usarlo como referencia *mientras el mecanismo era desconocido*; esa razón ya no aplica.
- La suite de contrato compartida afirma datos del dominio (títulos, números, orden) y deriva las identidades externas de `search()`, porque cada Fuente expresa su identidad a su manera (el fake usa slugs cortos; Olympus `comic-<slug>` con sufijo). Los cursores siguen comprobándose como opacos: existe y se devuelve el que llegó. No se debilitó ningún check para ponerlo verde: la portada se compara contra la que anunció el Catálogo cuando existe, y el detalle debe conservar el estado del resumen.
- Una Serie que existe sin Capítulos es una página vacía (200 con `data: []`); una Serie inexistente es 404 → `NOT_FOUND`. El caso del contrato usaba antes un id inexistente y esperaba lista vacía, que contradice el contrato HTTP.
- `meta.total` de Olympus es el total de la Serie en todas las páginas, no el del trozo: `listChapters` exige ese total y lanza `PARSE` si falta algo. Las fixtures lo modelaban mal (total = tamaño del trozo) y por eso el test de lista parcial pasaba sin ejercer el guard.
- Olympus no expone autores ni año: `getSeries` devuelve `authors: []` y omite `year`. El criterio de #20 los pide literalmente; la desviación queda escrita en el spec y coincide con v1 (sin metadata externa).
- Todo fallo de forma del payload se traduce a `SourceError("PARSE")` en `search`, `getSeries` y el listado de Capítulos, nunca un `TypeError` suelto ni una lista parcial.

## Tried and ruled out
- Afirmar objetos DTO completos con identidades literales en la suite compartida: un adapter real con otra forma de identidad fallaría la misma suite. Se afirman los datos y se derivan las identidades.
- Devolver `[]` cuando el catálogo completo falla: mentiría sobre «sin resultados»; se propaga el `SourceError`.

## Watch out
- `trail check` marca 7 conflictos léxicos sobre el texto nuevo del spec (suite/app, adapter real, autores/año, `/api/series`, redirect 302, cursor). Ninguno reabre una decisión: la suite sigue fuera de la config de la app, no hay endpoint de imágenes con redirect, y la búsqueda es local. La justificación va en el mensaje de commit.
- Los sub-agentes de revisión lanzados desde esta sesión no ven el filesystem del host: hay que exportar el diff a un archivo y pasárselo, o revisar en el host.

In the code:
- src/sources/olympus.ts, src/sources/registry.ts, src/sources/types.ts (`status?` en el resumen)
- tests/contract/suite.ts, tests/contract/olympus-source-adapter.spec.ts, tests/contract/olympus-http.spec.ts, tests/contract/support/olympus-fixtures.ts
- docs/specs/source-adapter.md (checklist de #20 + procedimiento de smoke manual)
- `npm run test:contract` → 63 passed; `npm run test:e2e` → 5 passed; `npm run typecheck` limpio
