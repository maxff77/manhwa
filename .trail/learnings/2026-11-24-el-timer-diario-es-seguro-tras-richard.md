---
title: El timer diario es seguro tras migrar la identidad; el slug base funciona si el adapter resuelve el vivo
author: Richard
date: 2026-11-24
branch: main
cost: { minutes: 1, tokens: 0 }
id: l-e39e7edf
scope: repo
status: active
replaces: l-7c0bc91a
src: agent
touches:
  - src/sources/olympus.ts
  - docs/specs/catalog.md
---

## Decided
- El timer diario es seguro SOLO despues de correr catalog:migrate-identity sobre la base destino, porque el adapter ya expone el slug sin sufijo como identidad y resuelve el vivo desde el catalogo cacheado. La advertencia anterior ("no activar el timer mientras el drift exista") queda superada: el drift se arreglo en el adapter, no solo se documento.
- Usar el slug base como externalId SI funciona cuando el adapter resuelve el slug vivo aparte. Lo que falla (404 medido) es mandar el base directamente a la ruta; por eso liveSlug() busca el vivo en /api/series/list antes de pedir detalle, Capitulos y Paginas.

## Tried and ruled out
- Dejar la advertencia vieja como afirmacion vigente: descartado porque contradice el codigo commiteado y llevaria a la siguiente sesion a no activar un timer que ya es seguro, o a repetir un arreglo ya hecho.

## Watch out
- Una base con vinculos viejos (con sufijo) necesita la migracion antes del backfill: sin ella el adapter no los encuentra por identidad estable.

In the code:
- src/sources/olympus.ts: stableExternalId() en toSummary y liveSlug() resolviendo desde catalog() antes de getSeries/chaptersPage/getChapterPages.
- docs/specs/catalog.md: seccion "Migracion de identidad (una sola vez por base)" y advertencia del timer que exige la migracion previa.
- Corrida real sobre 3e42838: exit 0, done{pages:60,processed:896,failed:0}; base con 896 Series / 896 vinculos, 0 con sufijo, 0 slugs duplicados.
