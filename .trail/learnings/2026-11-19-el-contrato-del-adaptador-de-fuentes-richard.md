---
title: "El contrato del adaptador de fuentes se prueba aparte, sin app ni base de datos"
author: Richard
date: 2026-11-19
branch: main
cost: { minutes: 347, tokens: 15485464 }
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
- La suite del seam de la app se corre con el Chromium que descarga Playwright. Con el Google Chrome del sistema el test de la home queda rojo: aparece un error de consola 404 que con el Chromium de Playwright no aparece, y ese test exige cero errores de consola. La causa del 404 no se identificó; el test no se tocó.
- El navegador se instala fuera del sandbox: dentro, la descarga falla por DNS o se corta a mitad.

## Tried and ruled out
- Dejar la suite de contrato bajo la configuración de la app: obliga a levantar Next y Postgres para probar funciones puras, y con el motor de contenedores caído no se puede probar nada.
- Afirmar el cursor de paginación contra un literal: el cursor es opaco, así que un adapter real con otro formato fallaría la misma suite. Se comprueba que existe y se devuelve el que llegó.
- Config temporal con el Chrome del sistema para esquivar la descarga: 4 de 5 tests pasan y la home falla por el 404. Se borró; no se commitea una config que cambia el navegador de la suite.
- Parar el motor de contenedores colgado con su propio CLI o cerrando la app por AppleScript: el proceso de backend sigue vivo y el CLI devuelve "processes still running".

## Watch out
- Con Docker Desktop abierto pero el motor caído, los comandos de Docker se cuelgan sin imprimir nada y el arranque global de la suite de la app se queda esperando para siempre. Conviene un ping acotado al socket antes de insistir; el arreglo es reiniciar Docker Desktop a mano, no lanzar otro compose encima.

In the code:
- `npm run test:contract` → `playwright.contract.config.ts`, `tests/contract/`
- `src/sources/http.ts`, `src/sources/fake.ts`
- `docs/specs/source-adapter.md`, ticket #19
- Para recuperar el motor colgado: matar los PID del backend y del build de Docker y volver a abrir la app; el socket responde en ~15 s. Sondear siempre con un ping acotado al socket antes de insistir: los comandos de Docker se cuelgan sin imprimir nada y el arranque global de la suite espera para siempre.

- `npx playwright install chromium` (con red, fuera del sandbox); `playwright.config.ts` deja el proyecto chromium sin `channel`
- `npm run test:e2e` → 5 passed; `npm run test:contract` → 33 passed
- ping: `curl -s --max-time 5 --unix-socket ~/.docker/run/docker.sock http://localhost/_ping`
