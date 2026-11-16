---
title: El catálogo v1 filtra solo por género y estado y no ordena por popularidad
author: Richard
date: 2026-11-16
branch: docs/modelo-datos
cost: { minutes: 11, tokens: 111649 }
id: l-b37024c6
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/specs/catalog.md
  - docs/specs/search.md
  - docs/agents/issue-tracker.md
  - docs/specs/source-adapter.md
---

## Decided
- El catálogo v1 filtra por género y estado (parámetros repetibles, OR dentro del mismo filtro, AND entre filtros) y ordena por título (defecto) o por último Capítulo (`MAX(Chapter.publishedAt)`, Series sin Capítulos al final).
- Un solo `GET /api/series` para búsqueda y catálogo: `q` con términos = búsqueda (manda relevancia, `sort` da 400); sin términos = catálogo con filtros y orden. Cursor opaco con offset + huella de `q`+filtros+orden.
- La home se renderiza en servidor contra Prisma, sin `/api/home`: continúa leyendo (solo logueados), últimos capítulos, géneros y buscador.

## Tried and ruled out
- Filtros por tipo, demografía, año, autores y erótico: Olympus no los expone y MangaDex queda opcional; un filtro que siempre devuelve vacío es peor que no tenerlo.
- Orden por popularidad con `total_views`/`monthly_views` de Olympus: el único ítem observado traía 0, no está verificado y el contrato del adapter no los captura.
- «Recién añadido» por `Series.createdAt`: es la fecha de ingesta y el backfill inicial iguala todas.
- Valoraciones propias y recomendaciones personalizadas en v1: sin votos ni uso el día 1; quedan en el fog del mapa.

## Watch out
- `sort=latest` obliga al primer vertical slice a recorrer la primera página `direction=desc` del listado de Capítulos de todas las Series; si no, `latestChapter` queda null y el orden degrada a título.
- Los géneros son strings de Olympus comparados por igualdad exacta; al entrar otra Fuente habrá que decidir el merge de taxonomía.

In the code:
- docs/specs/catalog.md
- docs/specs/search.md
- GLOSSARY.md (Filtro)
- Issue #16, mapa #1
