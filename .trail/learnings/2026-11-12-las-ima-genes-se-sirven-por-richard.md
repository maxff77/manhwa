---
title: Las imágenes se sirven por hotlink y la caché propia queda como fallback read-through
author: Richard
date: 2026-11-12
branch: docs/modelo-datos
cost: { minutes: 1, tokens: 11995 }
id: l-3b54c980
scope: repo
status: active
src: agent
touches:
  - docs/specs/image-pipeline.md
  - docs/agents/issue-tracker.md
  - GLOSSARY.md
  - docs/specs/source-adapter.md
  - prisma/schema.prisma
---

## Decided
- v1 hotlink directo desde el CDN de Olympus; la API devuelve URLs opacas y el lector no asume host.
- Fallback R2 read-through on-demand en `GET /api/pages/<id>`, sin jobs ni sweeper: el reintento es el del navegador y la reanudación es la siguiente petición.
- Claves `pages/<pageId>/<8 hex de sha256(sourceUrl)>.<ext>`; sin dedup de contenido, single-flight por página y semáforo de 8 descargas por host.
- `Page` gana `attempts`, `lastError` y `lastAttemptAt` recién al activar la caché; 3 fallos → ERROR, cooldown 10 min; eviction por lifecycle de R2 a 90 días.
- Transición solo de servidor con `IMAGE_MODE=hotlink|r2`; el lector no cambia.

## Tried and ruled out
- Endpoint con redirect 302 en v1: duplica cada petición y no detecta bloqueos; se introduce recién al activar la caché.
- Proxy propio en v1: todo el ancho de banda de imágenes por el VPS, contra la premisa de no cachear.
- Llenado al sincronizar el catálogo: descarga el catálogo entero.
- Job asíncrono por capítulo: agrega estados y polling que el read-through elimina.
- Dedup por hash del contenido: necesita refcounts para la eviction.

## Watch out
- Si Olympus bloquea por IP del servidor, el read-through tampoco funciona; no hay diseño que lo salve.
- La CSP debe incluir el dominio público de R2 al activar el modo caché (los redirects se re-evalúan).
- Si cambia la URL en un re-sync cambia la clave; los objetos viejos quedan huérfanos hasta el lifecycle.

In the code: docs/specs/image-pipeline.md; endpoint futuro en `src/app/api/pages/[id]/route.ts`.
