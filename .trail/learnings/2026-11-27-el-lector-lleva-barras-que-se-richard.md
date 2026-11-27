---
title: El lector lleva barras que se ocultan al leer y la lista de Capítulos viaja en el manifiesto
author: Richard
date: 2026-11-27
branch: design/theme-uber
cost: { minutes: 9, tokens: 327965 }
id: l-8a1521bf
scope: repo
status: active
src: agent
touches:
  - "src/app/api/series/[slug]/chapters/[externalId]/pages/route.ts"
  - src/components/reader.tsx
  - tests/reader.spec.ts
  - tests/api-chapter-pages.spec.ts
---

## Decided
- El lector tiene dos barras: arriba volver a la Serie, título, «Capítulo N · página/total», tema y una línea de progreso; abajo anterior, «Capítulo N» (abre la lista) y siguiente. Se ocultan al bajar leyendo, vuelven al subir, al tocar la lectura, al enfocar con teclado o cerca de los extremos. El usuario pidió (2026-11-27) poder ver varios episodios, regresar y anterior/siguiente sin llegar al final.
- La lista de Capítulos es una cuadrícula de números en un Drawer inferior de HeroUI, ascendente, con el actual en acento y centrado al abrir. Los datos van en el manifiesto de Páginas (`chapters`), y anterior/siguiente salen de esa misma lista: una consulta en vez de tres.
- En el móvil anterior y siguiente son flechas sin texto visible (el nombre accesible sigue): con etiquetas, a 390 px el botón central se cortaba en «Cap. …».

## Tried and ruled out
- `scrollIntoView` para centrar el Capítulo actual en la lista: también mueve la ventana del lector y guardaría una posición falsa. Se ajusta `scrollTop` del `.drawer__body` a mano.

## Watch out
- El salto de la restauración de posición cuenta como «bajar»: hay que poner `lastY` justo después del `scrollTo` o las barras arrancan ocultas.
- Los `data-testid` `capitulo-anterior` / `capitulo-siguiente` viven solo en el bloque final; la barra inferior no los lleva para no duplicarlos en los tests.
- Tailwind v4 oculta con la propiedad `translate`, no `transform`: un chequeo con `getComputedStyle(...).transform` dice «none» aunque la barra esté oculta.
- Los flujos de Reticle guardados que esperaban «Cap.» se actualizaron a «Capítulo N · x/y»; la réplica sigue arrancando antes de que el lector cargue (spinner), así que se verificó conduciendo a mano.

In the code:
- src/components/reader.tsx (`chrome`, `listOpen`, `lastY`, `centerInList`, barras y Drawer)
- src/app/api/series/[slug]/chapters/[externalId]/pages/route.ts (`chapters` en el manifiesto)
- tests/reader.spec.ts («la lista de Capítulos marca el actual y salta a otro»), tests/api-chapter-pages.spec.ts
