---
title: "El lector se queda con B: ventana con precarga y liberación, no gestión nativa"
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 1, tokens: 8476 }
id: l-ba6b3c85
scope: repo
status: active
replaces: l-1640def8
src: agent
touches:
  - prototype/reader/NOTES.md
---

## Decided
La estrategia de render del lector es B: figura con `aspect-ratio` real, ventana `[actual-2, actual+5]` con `src` y liberación de las imágenes lejanas. El contador de imágenes cargadas mide memoria retenida: debe quedarse bajo y acotado. C (`content-visibility`) queda descartada como estrategia principal porque no libera imágenes por sí sola.

## Tried and ruled out
- Elegir C por el contador "cargadas N/300": el usuario lo interpretó como actividad y eligió C; al explicarle que el contador mide memoria retenida, corrigió a B. El contador es un indicador de debug, no una feature.
- A (naive) queda descartada: sin dimensiones reservadas no puede restaurar posición ni acotar memoria.

## Watch out
- Trade-off de B: con un fling muy rápido pueden verse huecos grises hasta que cargan las siguientes; la precarga de 5 cubre el scroll normal.
- Memoria e iOS siguen sin medirse en dispositivo: validar en iOS Safari con un capítulo completo.
- Para pruebas HITL: decir el objetivo en una frase y hacer que las variantes se distingan sin explicación.

## In the code:
- `prototype/reader/index.html` — variantes A/B/C, píldora `←`/`→`, HUD con contador.
- `prototype/reader/serve.py` — genera 300 páginas y sirve por LAN.
- `prototype/reader/NOTES.md` — resultado y pendientes.
- Rama `prototype/webtoon-reader` (desechable, no se mergea).
