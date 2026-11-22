---
title: "El adapter real de Olympus ya existe: el mecanismo se verificó y la suite afirma lo que cada Fuente expone"
author: Richard
date: 2026-11-21
branch: main
cost: { minutes: 191, tokens: 45518512 }
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
- El smoke contra producción de Olympus lo ejecuta una persona en su propia sesión, no el agente. Es criterio explícito del ticket #20 («el agente no rastrea producción») y el responsable lo confirmó al elegir entre las opciones: correrlo él con `! npm run smoke:olympus`.
- El smoke es un comando del repo, no un script improvisado: un solo test encadena las cinco operaciones del adapter con su transporte real (UA de bot propio, espaciado de 500 ms, timeout por petición) e imprime lo observado. Son 5 peticiones como máximo.
- Vive aislado por construcción: config propia sin app ni Postgres, y la config de la app excluye tanto la carpeta de contrato como la de smoke. Verificado con `--list`: 63 tests de contrato, 5 de la app, 1 de smoke, sin solapamiento. No hay workflows de CI en el repo.
- El issue queda abierto con label `ready-for-human` hasta que esa persona pegue la salida; entonces se marca la casilla del spec, se commitea y se cierra, lo que desbloquea la ingesta del Catálogo (#21). Las alertas (#33) siguen bloqueadas además por Seguimientos (#30) y PWA (#32).
- `getChapterPages` pide `/api/capitulo/<slug>/<segmento>?type=comic` y lee `chapter.pages` (array de URLs) en orden 0-based. El smoke contra producción del #20 lo probó: las cuatro operaciones JSON respondieron y el HTML del lector devolvió 302 al host trampa hasta agotar los tres reintentos (`SourceError BLOCKED`).
- Esto sustituye la recomendación de #13, que dejaba este paso como HTML (`main.strip img`). El contrato lo permite explícitamente: «El mecanismo de obtención (HTML, JSON o JS) es interno al adapter; el pipeline no lo conoce». Ninguna firma, DTO ni test de contrato cambió de forma: solo el transporte y las fixtures.
- Las URLs relativas se resuelven contra la URL pedida con `new URL(...)`, así un payload con rutas relativas sigue dando URLs absolutas.
- El timeout por defecto del transporte de Fuentes pasa de 15 s a 30 s. El segundo smoke del #20 abortó `GET /api/series/list` con `TimeoutError` a los 15 s, mientras la primera página del catálogo respondió en el mismo run: el endpoint del catálogo completo es más lento que uno paginado y comparte plazo con él.
- El plazo se afirma midiendo cuándo aborta la señal de verdad contra una referencia de 15 s creada en el mismo instante; `AbortSignal` no expone su plazo, así que cualquier otra comprobación sería tautológica. El test dura ~30 s y lleva `test.setTimeout(60_000)` a nivel de archivo.

## Tried and ruled out
- Relajar autores/año a `Array.isArray` / `undefined-or-number` para que el adapter real pasara: debilitaba el contrato para ponerlo verde. Se revirtió en la revisión; cada Fuente afirma lo que expone.
- Redeclarar `status`/`trap` y los slugs en el spec de Olympus: `4368056` ya había fijado una sola copia por helper. Ahora viven en `tests/contract/support/olympus-fixtures.ts`.
- Que el agente ejecute el smoke con autorización explícita: el responsable eligió correrlo él; ejecutarlo el agente contradice el criterio del ticket aunque se autorice puntualmente.
- Cerrar #20 con el smoke documentado pero sin ejecutar: dejaría la única verificación contra producción sin hacer y sin registro del riesgo; se descartó.
- Importar el adapter `.ts` desde un script Node suelto: Node 24 falla con `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` (parameter properties en strip-only mode). Se usa Playwright, que ya era devDependency: cero dependencias nuevas.
- Mantener el parseo del HTML del lector con el UA de bot propio: el anti-bot lo bloquea (medido en el smoke). Cambiar a UA de navegador está prohibido por la política HTTP del spec («nunca UA de navegador ni de crawler de IA»), así que no era una salida.
- Reintentar más veces o subir el delay para el HTML: el bloqueo no es rate limiting, es el 302 al host trampa; más intentos solo alargan el fallo.
- Reintentar el timeout dentro del adapter: el spec deja el reintento de un fallo de transporte al job, no al adapter (`sourceFetch` lanza UPSTREAM sin reintentar). Subir el plazo es lo que corresponde a un endpoint lento, no a un bloqueo.
- Pasar el timeout como tercer argumento de `test(...)`: Playwright lo interpreta como `TestDetails` (TS2559) y el test sigue cortando a los 30 s por defecto. Va con `test.setTimeout`.

## Watch out
- `trail check` marca 7 conflictos léxicos sobre el texto del spec (suite/app, adapter real, autores/año, `/api/series`, redirect 302, cursor, Chrome). Verificados uno por uno contra el código commiteado: la suite de contrato sigue fuera de la config de la app (`testIgnore: "**/contract/**"`), no hay cambios en `src/app`, no se envía ningún parámetro de texto a `/api/series`, y el seam de la app sigue corriendo en Chromium. La justificación va en ambos mensajes de commit.
- Los sub-agentes de revisión de esta sesión no ven el filesystem del host: hay que exportar el diff a un archivo y pasárselo por ruta, o revisar en el host.

In the code:
- src/sources/olympus.ts, src/sources/registry.ts, src/sources/types.ts (`status?` en el resumen)
- tests/contract/suite.ts (`expectedDetailFields`, `EMPTY_SERIES_ID`), tests/contract/olympus-source-adapter.spec.ts, tests/contract/olympus-http.spec.ts, tests/contract/support/olympus-fixtures.ts
- docs/specs/source-adapter.md (checklist de #20 + «Smoke manual», casilla de ejecución aún sin marcar)
- `npm run typecheck` limpio · `npm run test:contract` → 63 passed · `npm run test:e2e` → 5 passed
- Si el smoke falla, el `SourceError` trae su `kind` (`BLOCKED`, `RATE_LIMITED`, `UPSTREAM`, `PARSE`, `NOT_FOUND`): distingue anti-bot de un cambio de forma del payload antes de tocar el adapter.
- El smoke usa la primera Serie del Catálogo y su Capítulo más reciente; si esa Serie no tiene Capítulos, el test falla por índice vacío, no por un fallo del adapter.

- `npm run smoke:olympus` → `playwright test --config playwright.smoke.config.ts`
- tests/smoke/olympus.spec.ts, playwright.smoke.config.ts
- playwright.config.ts (`testIgnore: ["**/contract/**", "**/smoke/**"]`)
- docs/specs/source-adapter.md:244 (casilla del smoke, sin marcar) y sección «Smoke manual»
- Commits en origin/main: 3b1746f, ac5b33d, a41a54f, 0924b34
- Un `BLOCKED` en una sola operación mientras las demás responden señala el mecanismo de esa operación, no la política HTTP entera. Antes de tocar reintentos o delays, comprobar si existe un endpoint JSON para ese paso.
- Los clientes públicos difieren: Keiyoushi parsea HTML, Msopla usa el JSON. Que uno funcione no prueba que el otro camino siga abierto.
- `trail check` sobre este cambio marca conflictos léxicos («orden por», «que devuelve», «sets del to 20») contra learnings de popularidad, cursores opacos y el smoke sin ejecutar. Ninguno aplica: no se añade orden por popularidad, los cursores siguen opacos y el smoke sí se ejecutó (falló y motivó este cambio). La justificación va en el mensaje de commit.

- src/sources/olympus.ts (`getChapterPages`), tests/contract/support/olympus-fixtures.ts (`chapterPayload`, `chapterPagesJson`, `olympusUrls.academiaChapter1`)
- docs/specs/source-adapter.md:241 y :250 (mecanismo JSON de las Páginas y por qué se supersede #13)
- La casilla del smoke (docs/specs/source-adapter.md:244) sigue sin marcar: hay que repetir `npm run smoke:olympus` tras este cambio, y lo corre una persona.
- Un `UPSTREAM` con `cause: TimeoutError` en una sola operación señala el plazo, no la política HTTP ni el anti-bot: se distingue de `BLOCKED` (302 al host trampa) leyendo el `cause`.
- `/api/series/list` no está documentado y su tamaño no se midió; si crece, 30 s puede volver a quedarse corto. La alternativa real es paginar el catálogo, no subir el plazo indefinidamente.

- src/sources/http.ts (`TIMEOUT_MS = 30_000`), tests/contract/http.spec.ts (test del plazo por defecto)
- `npm run typecheck` limpio · `npm run test:contract` → 64 passed · `npm run test:e2e` → 5 passed
- Commit f6b54ae en origin/main. La casilla del smoke (docs/specs/source-adapter.md:244) sigue sin marcar: hay que repetir `npm run smoke:olympus`, y lo corre una persona.
