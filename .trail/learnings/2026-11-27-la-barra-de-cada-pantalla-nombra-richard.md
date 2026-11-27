---
title: La barra de cada pantalla nombra cómo subir un nivel; el lector suma un botón de inicio
author: Richard
date: 2026-11-27
branch: design/theme-uber
cost: { minutes: 7, tokens: 173489 }
id: l-88b3a869
scope: repo
status: active
src: agent
touches:
  - src/components/site-header.tsx
  - "src/app/series/[slug]/page.tsx"
  - src/app/page.tsx
  - src/components/reader.tsx
  - DESIGN.md
---

## Decided
- Modelo de navegación elegido por el usuario (2026-11-27): cada pantalla dice cómo subir. Inicio (Catálogo) muestra «Manhwa» + tema; la Serie muestra «‹ Catálogo» en lugar de la marca; el lector muestra «‹ título · Capítulo N · página/total» como un solo enlace a la Serie, más una casa (Inicio) y el tema.
- El usuario se quejaba de que no había «ir al inicio» ni «regresar al título» al leer. Lo que faltaba de verdad era la casa en el lector y un blanco grande para volver a la Serie: la flecha sola (44 px, sin texto) no se reconocía.
- Inicio y Serie usan un componente compartido (antes la barra estaba copiada en los dos archivos).

## Tried and ruled out
- Barra «completa» con Buscar, Biblioteca y Cuenta: esas páginas aún no existen; serían botones a ninguna parte. DESIGN.md prohíbe navegación sin un segundo destino real.
- Migas de pan «Manhwa › Serie › Capítulo» en el lector: en el móvil los títulos (hasta 112 caracteres) se cortan demasiado.
- Casa a la izquierda del lector: dos botones de «salir» juntos se confunden.

## Watch out
- El enlace del título del lector se nombra «Volver a la Serie: <título> Capítulo N · x/y» (prefijo sr-only). Un test que busque un enlace por el título de la Serie con regex en el lector ahora encuentra este también.
- No usa `buttonVariants` lg: su `:active` escala a 0,97 y en un bloque tan ancho el salto se nota. Copia a mano el hover de `ghost` (`hover:bg-default`, `rounded-3xl`).
- En desarrollo, el indicador «N» de Next y el widget de Reticle tapan anterior/siguiente de la barra inferior del lector en el móvil. En producción no salen.

In the code:
- src/components/site-header.tsx (`SiteHeader`, prop `back`)
- src/components/reader.tsx (barra superior, icono `HOME`)
- src/app/page.tsx, src/app/series/[slug]/page.tsx
- DESIGN.md (Application wiring)
