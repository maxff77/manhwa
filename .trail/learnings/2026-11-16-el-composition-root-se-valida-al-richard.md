---
title: El composition root se valida al arrancar y Prisma no puede entrar en el bundle Edge
author: Richard
date: 2026-11-16
branch: docs/modelo-datos
cost: { minutes: 5, tokens: 39387 }
id: l-0f185d5b
scope: repo
status: active
src: agent
touches:
  - ".env.example"
  - ".factory/hooks.json"
  - ".gemini/settings.json"
  - ".github/hooks/reticle-prompt-capture.json"
  - ".nvmrc"
  - ".reticle.json"
  - ".reticle/.gitignore"
  - ".reticle/flows/manhwa-927de0d9/la-home-carga-sin-errores.json"
  - ".reticle/intent/index.json"
  - ".reticle/intent/la-home-carga-sin-errores/intent.json"
---

## Decided
La app valida `SOURCE_ADAPTER` al arrancar desde `instrumentation.ts` a través del composition root. Sin adaptador válido el servidor queda servible pero responde 500 y registra `SOURCE_ADAPTER no configurada`; no hay fallback a `fake`. El import del composition root es dinámico dentro del guard `NEXT_RUNTIME === "nodejs"`.

## Tried and ruled out
Import estático de Prisma en `instrumentation.ts`: Next compila el hook también para Edge y Turbopack avisa de `node:path` y `node:url`; el bundle Edge se contamina. `process.exit(1)` en el hook: Next captura el throw, deja el servidor en 500 y el fallo ya es visible en logs.

## Watch out
No cerrar `fake` con un guard de `NODE_ENV=production`: el arnés del spec v1 exige `next build && next start` con `SOURCE_ADAPTER=fake`. El no-fallback lo garantiza la ausencia de variable, no el entorno.

In the code:
- src/instrumentation.ts
- src/composition.ts
- src/sources/registry.ts
- playwright.config.ts (webServer env)
