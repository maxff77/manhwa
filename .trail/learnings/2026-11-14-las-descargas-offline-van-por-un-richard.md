---
title: Las descargas offline van por un proxy propio porque Chrome cobra cuota por respuesta opaca
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 2, tokens: 19671 }
id: l-dcf6bade
scope: repo
status: active
src: agent
touches:
  - docs/specs/offline-pwa.md
  - docs/specs/image-pipeline.md
  - GLOSSARY.md
---

## Decided
Las Descargas offline pasan por `GET /api/offline/pages/<pageId>` (streaming del servidor, sin caché en servidor) y se guardan en Cache Storage por `pageId`. La lectura online sigue por hotlink. Motivo: las imágenes de Olympus no envían CORS; descargarlas directo produce respuestas opacas y Chrome suma un padding aleatorio de 0–14.431 KiB (media ~7 MiB) por imagen a la cuota. Un Capítulo real de 80 imágenes (~14 MiB) costaría ~560 MiB de cuota. El proxy mismo origen evita el padding y da tamaño real. La clave por `pageId` hace que un cambio `IMAGE_MODE=hotlink|r2` no invalide lo descargado.

## Tried and ruled out
- Descarga directa no-cors con padding: inviable en Chrome/Android; el tope de 1 GB para Precarga automática no admitiría ni un Capítulo.
- Cachear por URL de origen: se invalida al cambiar de modo de imágenes y la URL es volátil.

## Watch out
- El proxy expone la IP del VPS a Olympus y gasta ancho de banda. Las imágenes respondieron 200 sin Referer y con UA de bot (probado 2026-11-14), pero el anti-bot de las páginas no garantiza el CDN a futuro.
- En iOS el almacenamiento se borra a los 7 días sin uso salvo app en pantalla de inicio; `persist()` no lo evita.
- `navigator.storage.estimate().quota` en Chrome devuelve `usage + 10 GiB`, no la cuota real: no usarlo para decidir si cabe.

In the code: docs/specs/offline-pwa.md, docs/specs/image-pipeline.md, ticket #9. Medición 2026-11-14: capítulos de Olympus 18–80 imágenes, 1,4–7,8 MiB (media 80–178 KiB/imagen).
