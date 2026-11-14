---
title: "El lector quedó en C, elegido por el contador de debug y no por la sensación de lectura"
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 24, tokens: 77957 }
id: l-1640def8
scope: repo
status: active
src: agent
touches:
  - prototype/reader/serve.py
  - prototype/reader/index.html
  - prototype/reader/.gitignore
  - prototype/reader/NOTES.md
  - docs/agents/issue-tracker.md
  - GLOSSARY.md
---

## Decided
La estrategia de render del lector es C (`content-visibility` nativo, sin JS de ventana), con B (ventana JS + precarga de las siguientes 5) como fallback si iOS recarga la pestaña. No es una decisión validada en dispositivo: memoria e iOS quedaron sin medir.

## Tried and ruled out
Presentar tres variantes de carga (A naive, B ventana, C CSS) como si su diferencia se percibiera leyendo. El usuario vio las tres iguales y eligió C por el contador de imágenes cargadas, que es un indicador de debug: en A y C sube porque las imágenes se acumulan; en B se mantiene bajo porque se liberan. Elegir B por razonamiento (precarga + liberación) se descartó como criterio: la preferencia del usuario manda, pero no hubo una diferencia perceptible que la respalde.

## Watch out
- El contador "cargadas N/300" no es una feature ni una señal de calidad.
- Para la próxima prueba HITL: decir el objetivo en una frase y hacer que las variantes se distingan sin explicación; si no, se elige por un artefacto de debug.
- Validar memoria en iOS Safari con un capítulo completo antes de dar C por segura.

## In the code:
- `prototype/reader/index.html` — variantes A/B/C y píldora `←`/`→`; HUD con contador.
- `prototype/reader/serve.py` — genera 300 páginas y sirve por LAN.
- `prototype/reader/NOTES.md` — resultado y pendientes.
- Rama `prototype/webtoon-reader` (desechable, no se mergea).
- Issue #5 cerrado; mapa #1 actualizado.
