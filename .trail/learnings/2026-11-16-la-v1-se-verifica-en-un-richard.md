---
title: "La v1 se verifica en un solo seam: la app corriendo"
author: Richard
date: 2026-11-16
branch: docs/modelo-datos
cost: { minutes: 11, tokens: 151084 }
id: l-c47f1b82
scope: repo
status: active
src: agent
touches:
  - docs/specs/v1.md
  - docs/specs/source-adapter.md
  - docs/specs/search.md
  - GLOSSARY.md
  - docs/specs/auth.md
  - docs/specs/catalog.md
  - docs/specs/alerts.md
  - docs/specs/offline-pwa.md
  - docs/specs/image-pipeline.md
---

## Decided
- Un solo seam de test para v1: la app Next.js corriendo, con Postgres real y el `FakeSourceAdapter`. Las peticiones HTTP cubren los contratos; Playwright cubre lector, service worker y offline. Reticle se suma como verificación en vivo del agente sobre el mismo montaje, no como reemplazo de la suite.
- El lector es un shell cliente prerenderizado: la ruta no depende de datos del servidor para arrancar, así el service worker la sirve offline y el cliente elige entre la API y el manifiesto guardado en IndexedDB.
- El spec añade al esquema `Series.titleNormalized`, `Series.originalTitleNormalized`, `SeriesSource.chaptersSyncedAt` y `Series.type` con default. Sin las dos primeras la Búsqueda no compila; sin `chaptersSyncedAt`, un poll reciente suprimiría la sincronización completa de la página de Serie.

## Tried and ruled out
- Route handlers en proceso con Vitest y Playwright solo para lo visual: dos arneses y los tests de servidor se saltan el HTTP real.
- Probar solo por HTTP, sin navegador: deja sin prueba la ventana del lector (decisión B) y la lectura offline, que son el corazón de la v1.

## Watch out
- El manifiesto de Olympus no expone dimensiones de imagen. El prototipo reservaba la ratio real porque su manifiesto la traía; en producción v1 usa una ratio por defecto y cachea las dimensiones naturales en IndexedDB tras la primera carga.
- El backfill debe pedir el detalle de cada Serie, no solo el listado: los géneros que alimentan los Filtros no vienen en el resumen del Catálogo.

In the code:
- docs/specs/v1.md e issue #17
- Prisma: `Series`, `SeriesSource`; migración greenfield
