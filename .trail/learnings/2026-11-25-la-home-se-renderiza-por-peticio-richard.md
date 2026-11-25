---
title: La home se renderiza por petición y cachea solo los últimos capítulos; ISR hornea la base del build
author: Richard
date: 2026-11-25
branch: main
cost: { minutes: 122, tokens: 28491967 }
id: l-74bec782
scope: repo
status: active
src: agent
touches:
  - tests/api-series.spec.ts
  - src/app/api/series/route.ts
  - tests/api-genres.spec.ts
  - src/app/api/genres/route.ts
  - tests/home.spec.ts
  - src/app/page.tsx
  - tests/support/db.ts
---

## Decided
- La home se renderiza por petición (`force-dynamic`) y cachea solo «Últimos capítulos» en memoria del proceso con TTL de 60 s. Los géneros se consultan por petición: son una consulta de microsegundos sobre ~900 Series.
- El cursor de `/api/series` es offset + huella de los valores normalizados (limit, q normalizado, sort, genre/status deduplicados y ordenados), no de la query string cruda: el spec pide que el orden y los duplicados de los parámetros repetidos no cambien la huella.
- `sort=latest` y la home usan SQL crudo con dos LEFT JOIN LATERAL (MAX(publishedAt) para ordenar, el Capítulo más reciente para mostrar). Prisma no ordena por un agregado de una relación.
- La rejilla de géneros enlaza a `/?genre=<nombre>` y la home resuelve esa vista filtrada por petición, sin caché: es otra navegación, no la home cacheada.

## Tried and ruled out
- ISR (`export const revalidate = 60`) en la home: `next build` prerenderiza con la base del build (.env) y sirve ese HTML aunque el runtime apunte a otra base. Medido: la home mostraba las 896 Series de desarrollo con la base de test vacía, y al revés tras sembrar.
- `unstable_cache(loadHome, [...], { revalidate: 60 })`: persiste en disco entre corridas de test, así que devolvía el snapshot vacío después de sembrar.
- Un TTL en memoria que también guardara los géneros: la rejilla quedaba congelada con los géneros de la pasada anterior. Medido: un test sembraba «Romance» y la home seguía ofreciendo solo «Acción», y el click nunca encontraba el enlace.
- Cachear el resultado vacío: la primera Serie ingerida tardaría hasta 60 s en aparecer. Se deja fuera de la caché.

## Watch out
- `npm run test:e2e:only` corre `next start` sobre el build existente: sin `npm run build` previo el test prueba el bundle viejo y falla con datos correctos. Tres ciclos rojos de este ticket fueron eso, no el código.
- El modo búsqueda (`q` con términos) sigue sin implementarse: es #25. Aquí solo se valida que `q` con términos + `sort` devuelve 400 y que `q` vacío es modo catálogo.

In the code:
- `src/app/page.tsx`: `loadLatest()`, `loadFiltered(genres)`, `latestCache` con TTL 60 s, `renderHome(latest, genres, selected)`.
- `src/app/api/series/route.ts`: huella sobre `normalizedParams`; rama `sort === "latest"` con `$queryRawUnsafe` parametrizado.
- `src/app/api/genres/route.ts`: `SELECT DISTINCT unnest("genres")` + caché de proceso de 1 h y `Cache-Control: s-maxage=3600`.
