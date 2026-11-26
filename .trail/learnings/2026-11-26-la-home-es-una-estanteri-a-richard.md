---
title: "La home es una estantería de carriles de portadas con filtro de varios géneros, sin buscador"
author: Richard
date: 2026-11-26
branch: design/theme-uber
cost: { minutes: 15, tokens: 286510 }
id: l-c5bd27fa
scope: repo
status: active
src: agent
touches:
  - ".impeccable/questions/home-structure.json"
  - ".impeccable/mocks/decision/carriles.html"
  - ".impeccable/mocks/decision/indice.html"
  - ".impeccable/mocks/decision/por-dia.html"
  - src/components/genre-filter.tsx
  - src/components/rail.tsx
  - src/app/page.tsx
  - tests/home.spec.ts
---

## Decided
- La home pone «lo nuevo» primero: un carril horizontal «Últimos capítulos» (20 Series, portadas grandes) y debajo un carril por cada uno de los 3 géneros más populares. El usuario eligió esta estructura en una ronda de bocetos (2026-11-25).
- Los géneros son un filtro de varios a la vez (OR): chips seleccionables de HeroUI (TagGroup) ordenados por popularidad; la selección vive en la URL (`/?genre=A&genre=B`) para poder compartirla. Con filtro, la home muestra una rejilla de hasta 50 Series ordenada por último Capítulo y el recuento total.
- Cada carril de género excluye las Series ya mostradas en los carriles de arriba.

## Tried and ruled out
- Índice en tabla (una Serie por fila con miniatura): descartado por el usuario; las portadas, que dan el color en un tema monocromo, quedaban pequeñas.
- Feed agrupado por día («Hoy», «Ayer»…): descartado; con el Catálogo ingerido por backfill casi todo cae en el mismo día y solo saldría un grupo.
- Buscador por título en la home: el usuario lo dejó fuera de este rediseño («solo diseño»); va en otro ticket aunque la búsqueda ya existe en `/api/series?q=`.
- Carriles de género sin deduplicar: Acción cubre 759 de 896 Series y su carril repetía casi entero «Últimos capítulos».

## Watch out
- El filtro necesita JS (TagGroup es un componente cliente): antes de hidratar, tocar un chip no navega. Los enlaces «Ver todo» y «Quitar filtros» sí funcionan sin JS.
- En los tests, los géneros son filas de un grid: `getByRole("row", { name: "Acción", exact: true })` dentro de `getByRole("grid", { name: "Géneros" })`, no enlaces.

In the code:
- `src/app/page.tsx` (`loadShelves`, `RAIL_GENRES = 3`, `FILTER_LIMIT = 50`), `src/components/rail.tsx`, `src/components/genre-filter.tsx`, `tests/home.spec.ts`.
- Brief de superficie con el contrato de dirección: `.impeccable/surfaces/src-app-page-tsx.md`.
