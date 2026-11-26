---
title: El theme es la preset monocroma Uber de HeroUI; las demás se descartaron por contraste o por chocar con los colores de estado
author: Richard
date: 2026-11-26
branch: main
cost: { minutes: 14, tokens: 581267 }
id: l-b04eb6d3
scope: repo
status: active
src: agent
touches:
  - PRODUCT.md
  - ".impeccable/live/config.json"
  - src/app/globals.css
  - DESIGN.md
---

## Decided
La interfaz usa la preset «Uber» del Theme Builder de HeroUI (monocromo: acento negro en claro, casi blanco en oscuro, grises sin tinte, radios de 4px) con Geist. El color lo ponen las portadas; los únicos tonos de la UI son los de estado. El CSS se generó con el propio generador del builder, no copiado a mano, y lleva dos ajustes para WCAG 2.2 AA en modo claro: --muted y --success.

## Tried and ruled out
- Default (la de antes), Airbnb, Discord: texto del botón principal por debajo de 4,5:1 (Default 3,59).
- Sky, Lavender, Mint, Spotify: en claro el acento queda a 1,5–2:1 del fondo; el anillo de foco no se ve.
- Netflix, Spotify: el acento es el rojo de error o el verde de éxito.
- Rabbit (naranja): el usuario lo eligió primero; se descartó porque su naranja (tono 36,7°) y su rojo de error (29,1°) tienen brillo parecido y un botón principal se confunde con uno destructivo. Moverlo no ayuda: queda entre el rojo (error) y el ámbar (aviso).
- Coinbase (índigo): pasa AA, pero no se eligió; queda como alternativa si se quiere un color de marca.

## Watch out
- Ninguna preset cumple AA tal cual: todas dejan el --muted claro en ~4,42:1 sobre el canvas.
- heroui.com/themes se pinta con JavaScript; WebFetch no ve las presets. Están en heroui-inc/heroui, rama v3, apps/docs/src/app/[lang]/themes/theme-values.ts.
- HeroUI declara sus variables en @layer base, así que las nuestras sin capa ganan sin subir especificidad.

In the code: src/app/globals.css (bloques :root/.dark exportados + comentarios de los ajustes AA), DESIGN.md (tabla de colores, «Accessibility overrides», Shapes). Para regenerar: descargar theme-values.ts, constants.ts y utils/generate-*.ts del builder, sustituir constants.ts por un shim sin imágenes/env y ejecutar generateMinimalCssVariables(themeValuesById.uber) con tsx.
