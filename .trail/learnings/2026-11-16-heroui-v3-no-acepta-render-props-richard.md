---
title: HeroUI v3 no acepta render props desde server components y su gris claro no pasa AA
author: Richard
date: 2026-11-16
branch: docs/modelo-datos
cost: { minutes: 1, tokens: 2064 }
id: l-8eb84c9c
scope: repo
status: active
src: agent
touches:
  - src/app/page.tsx
  - src/app/globals.css
  - DESIGN.md
---

## Decided
El título de la Card del estado vacío es un `<h2>` plano con las clases de `card__title` (`text-sm leading-6 font-medium`), no `Card.Title` (que renderiza `h3`). El token claro `--muted` se oscurece a `oklch(0.52 0.0138 285.94)` en `globals.css`: el default de HeroUI mide 4.43:1 sobre el canvas y WCAG AA pide 4.5:1.

## Tried and ruled out
`<Card.Title render={(props) => <h2 {...props} />}>` dentro de un server component: React no permite pasar funciones a client components y la página devuelve 500. `text-foreground/80` como parche de contraste: arregla una línea y deja el token roto para el resto de pantallas.

## Watch out
Cualquier `Card.Title` usado desde un server component arrastra el salto h1→h3. Si hace falta otro nivel, usar un heading plano con las clases del tema; no el prop `render`.

In the code:
- src/app/page.tsx
- src/app/globals.css
- DESIGN.md (sección Colors)
