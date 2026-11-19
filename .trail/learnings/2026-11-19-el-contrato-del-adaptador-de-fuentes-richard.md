---
title: "El contrato del adaptador de fuentes se prueba aparte, sin app ni base de datos"
author: Richard
date: 2026-11-19
branch: main
cost: { minutes: 135, tokens: 4418076 }
id: l-da1bc18b
scope: repo
status: active
src: agent
touches:
  - playwright.contract.config.ts
  - package.json
  - tests/contract/suite.ts
  - tests/contract/fake-source-adapter.spec.ts
  - tests/contract/source-adapter.spec.ts
  - playwright.config.ts
  - src/sources/fake.ts
  - tests/contract/http.spec.ts
  - src/sources/http.ts
  - docs/specs/source-adapter.md
---

## Decided
- La suite de contrato del `SourceAdapter` corre con su propia configuración de Playwright: sin app levantada, sin Postgres y sin red. No reemplaza el seam único de la v1 (la app corriendo), que sigue rigiendo para todo lo demás; es el seam de fixtures que el spec del contrato ya pedía.
- El adapter falso lanza `PARSE` cuando falta el listado de Páginas; un Capítulo vacío es una lista vacía explícita. El ejemplo del spec contradecía su propio checklist y se corrigió el ejemplo.
- La política HTTP de la Fuente (UA de bot propio, timeout, una petición en vuelo por host, 3 intentos con backoff exponencial + jitter, errores tipados) vive en un módulo con transporte inyectable, para ejercitarla sin abrir la red. Ningún adapter real la consume todavía.

## Tried and ruled out
- Dejar la suite de contrato bajo la configuración de la app: obliga a levantar Next y Postgres para probar funciones puras, y con el motor de contenedores caído no se puede probar nada.
- Afirmar el cursor de paginación contra un literal: el cursor es opaco, así que un adapter real con otro formato fallaría la misma suite. Se comprueba que existe y se devuelve el que llegó.

## Watch out
- Con Docker Desktop abierto pero el motor caído, los comandos de Docker se cuelgan sin imprimir nada y el arranque global de la suite de la app se queda esperando para siempre. Conviene un ping acotado al socket antes de insistir; el arreglo es reiniciar Docker Desktop a mano, no lanzar otro compose encima.

In the code:
- `npm run test:contract` → `playwright.contract.config.ts`, `tests/contract/`
- `src/sources/http.ts`, `src/sources/fake.ts`
- `docs/specs/source-adapter.md`, ticket #19
