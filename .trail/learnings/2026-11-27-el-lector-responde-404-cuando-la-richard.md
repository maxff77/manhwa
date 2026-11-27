---
title: El lector responde 404 cuando la Fuente configurada no es la que tiene los datos ingeridos
author: Richard
date: 2026-11-27
branch: design/theme-uber
cost: { minutes: 255, tokens: 67809729 }
id: l-5fb9c914
scope: repo
status: active
src: agent
touches:
  - next.config.ts
  - package.json
  - playwright.config.ts
  - src/app/api/image-errors/route.ts
  - "src/app/api/series/[slug]/chapters/[externalId]/pages/route.ts"
  - "src/app/series/[slug]/capitulo/[externalId]/page.tsx"
  - src/components/reader.tsx
  - src/ingest/pages.ts
  - tests/api-chapter-pages.spec.ts
  - tests/api-image-errors.spec.ts
---

## Decided
El 404 del lector en desarrollo no era un bug del código: la base de desarrollo está ingerida desde Olympus (896 Series con vínculo `olympus`) y `.env` pedía `SOURCE_ADAPTER=fake`. El endpoint busca el vínculo de la Fuente activa y, sin él, responde 404 «Serie sin vínculo a la Fuente activa». La página de Serie registra lo mismo como `series-sync-skipped` con `reason: no-link-for-source`, así que el síntoma ya venía avisando desde #23.

La configuración de desarrollo se alinea con los datos que hay en la base: `.env` pasa a `SOURCE_ADAPTER=olympus`. El arnés de tests no depende de `.env`: `playwright.config.ts` fuerza `fake` en `webServer.env`, así que la suite sigue corriendo con fixtures.

## Tried and ruled out
- Tocar el endpoint o el lector para «arreglar» el 404: el contrato es correcto; devolver Páginas de una Fuente distinta a la activa rompería la identidad `(seriesId, sourceId, externalId)`.
- Dejar `.env` en `fake` y sembrar Series falsas en la base de desarrollo: mezclaría datos de demo con las 896 Series reales y el catálogo quedaría inconsistente.

## Watch out
- Un 404 «Serie sin vínculo a la Fuente activa» señala desajuste entre `SOURCE_ADAPTER` y los vínculos de la base, no un fallo del adapter ni del anti-bot. Comprobar primero qué Fuente tienen los `series_sources` de esa Serie.
- El log `series-sync-skipped` / `no-link-for-source` en la página de Serie es el mismo desajuste visto desde otro lado: si aparece, el lector tampoco podrá abrir Capítulos.
- Cambiar `.env` no requiere reiniciar `next dev`: recarga las variables y la siguiente petición ya usa la Fuente nueva (medido).

In the code:
- `.env` (gitignored): `SOURCE_ADAPTER=olympus`, con comentario del porqué.
- `.env.example` sigue en `fake`: es la plantilla para arrancar sin datos ingeridos.
- Diagnóstico diferencial: mismo endpoint sobre la misma base con dos servidores propios, `SOURCE_ADAPTER=olympus` → 200 con manifiesto, `SOURCE_ADAPTER=fake` → 404.
- `select src.slug, count(*) from series_sources ss join sources src on src.id=ss."sourceId" group by src.slug` → olympus 896, fake 0.
- Verificado tras el cambio: `GET /api/series/los-gemelos-baek/chapters/162/pages` → 200; Reticle `verified: yes` desplazando el lector hasta «Cap. 162 · 21/49».
