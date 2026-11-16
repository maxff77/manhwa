---
title: "Prisma 7 en Next 16 pide generador nuevo, config aparte y adaptador de Postgres"
author: Richard
date: 2026-11-16
branch: docs/modelo-datos
cost: { minutes: 24, tokens: 248818 }
id: l-b908722b
scope: repo
status: active
src: agent
touches:
  - package.json
  - tsconfig.json
  - next.config.ts
  - postcss.config.mjs
  - prisma.config.ts
  - prisma/schema.prisma
  - docker-compose.yml
  - ".env.example"
  - ".env"
  - src/app/globals.css
---

## Decided
Prisma 7 se integra con el generador `prisma-client` y `output` fuera de `node_modules`, un `prisma.config.ts` que aporta `DATABASE_URL`, y `@prisma/adapter-pg` en runtime. Next necesita `serverExternalPackages: ["@prisma/adapter-pg", "pg"]`. El `datasource` ya no lleva `url`.

## Tried and ruled out
Mantener `prisma-client-js` y `url = env("DATABASE_URL")` en el schema: Prisma 7 es ESM-only y el CLI ya no carga `.env` solo. La configuración de Prisma 6 rompe `generate` y `migrate`.

## Watch out
`migrate dev` no genera el cliente: el build corre `prisma generate` antes de `next build`. En la limpieza entre tests, excluir `_prisma_migrations` del TRUNCATE o se pierde el estado de migraciones.

In the code:
- prisma/schema.prisma
- prisma.config.ts
- src/lib/db.ts
- next.config.ts
- tests/support/db.ts
- package.json (scripts build/test:e2e)
