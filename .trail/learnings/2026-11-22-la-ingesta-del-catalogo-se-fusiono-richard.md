---
title: "La ingesta del Catalogo se fusiono en main local sin publicar, y se verifico sobre el arbol fusionado"
author: Richard
date: 2026-11-22
branch: main
cost: { minutes: 105, tokens: 16949831 }
id: l-7c0bc91a
scope: repo
status: active
src: agent
touches:
  - package.json
  - playwright.config.ts
  - playwright.ingest.config.ts
---

## Decided
- La rama de la ingesta del Catalogo se integro con merge fast-forward en main local y despues se borraron la rama y su worktree. El responsable lo eligio entre las tres opciones (merge local, push + PR, dejar la rama). Nada se publico en origin: main queda 11 commits por delante.
- Las suites se corrieron sobre el resultado del merge, no solo sobre la rama: ingest 16, contrato 65, e2e 5, typecheck limpio. Un verde sobre la rama no prueba el arbol fusionado.
- Antes de borrar el worktree se comprobaron los archivos ignorados que se perderian: solo scratch regenerable (node_modules, .next, cache de trail, workspace SDD). El learning y el plan ya estaban commiteados en main.
- Marcar las casillas de un ticket solo con evidencia ejecutada, y reescribir la que no se cumple literal en vez de marcarla en falso: el criterio de titulo original normalizado quedo declarado como desviacion porque el contrato del adaptador nunca expuso ese campo.
- Un ticket de ingesta no se cierra porque el codigo pase sus suites: el criterio de datos reales se comprueba consultando la base. Con cero Series, el issue queda abierto y pasa a espera de una persona.
- El siguiente ticket se elige por los bloqueos nativos del tracker (dependencias abiertas = 0), no por el numero ni por el orden del mapa. Consultados los hijos abiertos, solo el de cuentas esta libre; toda la rama de catalogo sigue bloqueada por la ingesta.
- Cada arnes apunta a una base distinta porque los configs de Playwright sobrescriben DATABASE_URL con la de test, mientras el job real lee la del .env (desarrollo). Por eso las suites verdes no dejaban el esquema al dia en la base destino: `prisma migrate status` sobre la de desarrollo fallo con "Following migration have not yet been applied: 20261122000000_chapter_identity_per_series". Hubo que correr `prisma migrate deploy` tambien alli.
- Antes de entregar un comando de ingesta a una persona, comprobar `prisma migrate status` sobre la base que ESE comando usa, porque un indice unico viejo en la base destino reintroduce el descarte silencioso de Capitulos que la migracion corrigio: sin ella solo la primera Serie conservaba sus Capitulos.

## Tried and ruled out
- Push + Pull Request: el responsable eligio merge local; publicar es decision suya y sigue pendiente.
- Dejar la rama y el worktree para integrarla despues: descartado por la misma eleccion.
- `git worktree remove` sin --force: el worktree tenia scratch ignorado; se listo primero y se confirmo que nada unico se perdia antes de forzar.
- Cerrar el ticket al pasar las suites: la base tenia una Fuente y cero Series, asi que el resultado que el ticket promete no existia.
- Marcar la casilla del titulo original tal como estaba redactada: afirmaba algo que el codigo no hace.
- Arrancar el ticket de catalogo por ser el siguiente en numero: su unico bloqueo abierto es la ingesta.
- Confiar en que las suites verdes implican esquema al dia en todas las bases: descartado porque el global-setup migra solo la base de test (los configs fijan DATABASE_URL), y la de desarrollo seguia una migracion atras tras pasar ingest 16 / contrato 65 / e2e 5.

## Watch out
- Tras un merge que toca package.json hay que `npm install` en el checkout principal: tsx faltaba alli aunque la rama lo tenia instalado. Sin eso `npm run catalog:backfill` falla por binario ausente.
- El esquema cambio en el merge: regenerar el cliente Prisma antes de correr nada.
- En zsh el exit code de un pipe se lee con pipestatus, no PIPESTATUS; usar redireccion a archivo y $? para no reportar un exit vacio.
- Un probe suelto con tsx no carga .env: pasar DATABASE_URL explicita o el fallo parece del job cuando es del probe.

In the code:
- `git merge --ff-only feat/ingesta-catalogo` sobre main (0fd51ca -> 76082fb)
- `npm install` + `npx prisma generate` en el checkout principal tras el merge
- `npm run test:ingest` (16), `npm run test:contract` (65), `npm run test:e2e` (5) sobre el arbol fusionado
- `SOURCE_ADAPTER=fake npm run catalog:backfill` -> exit 0, done{pages:1,processed:0,failed:0}; despues sources=1, series=0 y 0 advisory locks en pg_locks
- Issue #21 sigue OPEN con label ready-for-human: la carga real contra Olympus la corre una persona
- Las casillas del cuerpo del issue y las del spec de area son listas distintas: marcar el issue no marca el spec.
- La carga real contra la Fuente la corre una persona; el agente prueba el cableado con el adaptador falso y reporta el conteo real de filas.

- `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` para la frontera; `.../dependencies/blocking` para que desbloquea.
- Conteo real con un probe dentro del repo (dotenv resuelve desde node_modules del proyecto): sources=1, series=0, chapters=0.
- Suites sobre el arbol fusionado: test:ingest 16, test:contract 65, test:e2e 5, typecheck limpio.
- Verificar el indice resultante consultando pg_indexes en la base destino, no solo el estado de migraciones, porque es la unica prueba de que la clave global vieja ya no existe.

- playwright.config.ts:7 y playwright.ingest.config.ts:6 fijan DATABASE_URL a la base de test; .env.example:2 apunta a la de desarrollo.
- `npx prisma migrate deploy` sobre la base de desarrollo aplico 20261122000000_chapter_identity_per_series; despues `prisma migrate status` -> Database schema is up to date.
- pg_indexes en chapters: chapters_seriesId_sourceId_externalId_key y chapters_seriesId_sourceId_number_key; la clave global vieja ausente.
- Job re-corrido con adaptador falso sobre la base ya migrada: exit 0, sources=1 series=0 chapters=0, 0 advisory locks.
