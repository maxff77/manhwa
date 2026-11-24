---
title: "La ingesta del Catalogo se fusiono en main local sin publicar, y se verifico sobre el arbol fusionado"
author: Richard
date: 2026-11-22
branch: main
cost: { minutes: 273, tokens: 97637502 }
id: l-7c0bc91a
scope: repo
status: active
src: agent
touches:
  - package.json
  - playwright.config.ts
  - playwright.ingest.config.ts
  - src/sources/olympus.ts
  - src/ingest/catalog.ts
  - docs/specs/catalog.md
  - docs/specs/source-adapter.md
  - scripts/migrate-series-identity.ts
  - src/ingest/identity.ts
  - src/sources/http.ts
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
- El slug que expone Olympus no es identidad estable: lleva un sufijo -YYYYMMDD-HHMMSSmmm que el mirror regenera a diario para las Series actualizadas. La misma Serie (id numerico 11, portada /covers/11/) quedo guardada con dos externalId de fechas distintas, porque el pipeline identifica por SeriesSource(sourceId, externalId) y el sufijo nuevo no coincide con el guardado.
- Una suite verde con el adaptador falso no prueba idempotencia contra la Fuente real: las fixtures usan slugs fijos, asi que nunca ejercen el drift. El criterio se destapo solo al correr la carga real y comparar el conteo de filas contra el del catalogo vivo (973 filas para 896 items).
- No activar el timer diario mientras el drift exista: cada pasada anade hasta 204 filas duplicadas, medida contra el catalogo vivo (mismaBasePeroSufijoNuevo=204, baseRealmenteNueva=0).
- La identidad de la Serie es el slug SIN el sufijo -YYYYMMDD-HHMMSSmmm, porque el mirror lo regenera a diario y con el slug completo cada pasada creaba una Serie nueva. El adapter resuelve el slug vivo desde /api/series/list (ya cacheado para la Busqueda) antes de pedir detalle, Capitulos y Paginas: cero peticiones extra por Serie, y la API sigue recibiendo el unico slug que acepta.
- Quitar el sufijo del externalId NO basta por si solo: hay que resolver el vivo aparte. Lo descartado antes fue usar el base directamente en la ruta (404 medido); resolverlo desde el catalogo si funciona y es lo que se implemento.
- Los vinculos ya ingeridos se migran con un comando propio (catalog:migrate-identity) que deja la identidad estable y fusiona los duplicados conservando la fila mas reciente, porque la ultima pasada es la que refresco los datos. Una Serie con Seguimiento, Progreso, Coleccion o Comentario NO se borra: la cascada se llevaria esos datos, asi que se omite con log para revision humana.
- Un aborto al LEER el cuerpo de la respuesta es UPSTREAM, no PARSE, porque el AbortSignal del transporte cubre fetch + lectura: Olympus entrego los headers de page=2 a los 18 s y abortó a los 30 s leyendo. Etiquetarlo PARSE mandaba a mirar el adapter cuando el problema era el plazo.
- El job reintenta una pagina del listado hasta 2 veces con backoff (1 s, 2 s) ante UPSTREAM/RATE_LIMITED/BLOCKED, porque el spec deja el reintento de transporte al pipeline y el fallo medido es intermitente: la misma page=2 respondio en 7.7 s al repetir.

## Tried and ruled out
- Push + Pull Request: el responsable eligio merge local; publicar es decision suya y sigue pendiente.
- Dejar la rama y el worktree para integrarla despues: descartado por la misma eleccion.
- `git worktree remove` sin --force: el worktree tenia scratch ignorado; se listo primero y se confirmo que nada unico se perdia antes de forzar.
- Cerrar el ticket al pasar las suites: la base tenia una Fuente y cero Series, asi que el resultado que el ticket promete no existia.
- Marcar la casilla del titulo original tal como estaba redactada: afirmaba algo que el codigo no hace.
- Arrancar el ticket de catalogo por ser el siguiente en numero: su unico bloqueo abierto es la ingesta.
- Confiar en que las suites verdes implican esquema al dia en todas las bases: descartado porque el global-setup migra solo la base de test (los configs fijan DATABASE_URL), y la de desarrollo seguia una migracion atras tras pasar ingest 16 / contrato 65 / e2e 5.
- Quitar el sufijo y usar el slug base como externalId: el endpoint exige el slug vivo. /api/series/<base>?type=comic devuelve 404 y con el sufijo de hoy 200, confirmado en dos Series distintas; la URL publica /series/comic-<base> tambien da 404.
- Usar el id numerico en la ruta: /api/series/11?type=comic devuelve 400 ZodError; la API solo acepta slug.
- Buscar un slug canonico en el payload de detalle: note, gallery y disqus_key son null y slug trae el mismo sufijo, asi que no hay campo alternativo.
- Dejar el drift sin arreglo y solo advertir que no se active el timer: descartado porque el criterio de idempotencia del ticket no se cumple contra la Fuente real y la base creceria ~204 filas duplicadas por dia.
- Usar el id numerico como externalId: unico y estable, pero ilegible en logs y con el mismo requisito de resolver el slug vivo; el responsable eligio el slug base.

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
- El id numerico si es estable y unico (896/896) y mapea 1:1 con el slug sin sufijo (0 conflictos); sirve como identidad, pero hay que resolver el slug vivo aparte para pedir detalle y capitulos.
- El adaptador ya cachea /api/series/list (TTL 10 min) con el slug vivo y el id numerico de todas las Series: es el mapa disponible para resolver sin peticion extra.
- Dos Series realmente distintas pueden compartir titulo normalizado; agrupar por titulo para detectar duplicados da falsos positivos. Agrupar por slug base o por id numerico.

- src/sources/olympus.ts:132 arma externalId como comic-<slug completo>; apiSlug() (linea 90) lo usa en getSeries, chaptersPage y getChapterPages.
- src/ingest/catalog.ts busca el vinculo por sourceId_externalId con summary.externalId tal cual.
- Conteos tras la carga real: series=973, vinculosOlympus=973, basesUnicas=896, chapters=30023; 76 de las 77 bases duplicadas comparten id numerico y 0 tienen id distinto.
- Fechas de sufijo en DB: 20261122 y 20261123; en el catalogo vivo: solo 20261124.
- Antes de activar el timer diario hay que correr catalog:migrate-identity sobre la base destino: sin ella los vinculos viejos siguen teniendo el sufijo y el adapter no los encuentra.
- La migracion es idempotente: reejecutarla devuelve renamed=0 merged=0 skipped=0.

- src/sources/olympus.ts: MIRROR_SUFFIX, stableSlug/stableExternalId y liveSlug() resolviendo desde catalog().
- src/ingest/identity.ts + scripts/migrate-series-identity.ts (npm run catalog:migrate-identity), mismo advisory lock que el backfill.
- src/sources/http.ts: parseSourceBody separa lectura (UPSTREAM) de parseo (PARSE).
- src/ingest/catalog.ts: CATALOG_RETRIES=2, CATALOG_RETRY_DELAY_MS=1000, evento catalog-retry.
- Migracion corrida sobre desarrollo: renamed=204 merged=77 skipped=0; reejecucion no-op; backfill posterior exit 0 con 896 Series, 0 con sufijo, 0 slugs duplicados, 0 locks.
- Suites sobre el commit del arreglo: contrato 71, ingesta 22, e2e 5, typecheck limpio.
