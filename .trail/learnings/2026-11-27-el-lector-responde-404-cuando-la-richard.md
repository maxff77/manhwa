---
title: El lector responde 404 cuando la Fuente configurada no es la que tiene los datos ingeridos
author: Richard
date: 2026-11-27
branch: design/theme-uber
cost: { minutes: 288, tokens: 82977457 }
id: l-5fb9c914
scope: repo
status: active
src: agent
touches:
  - next.config.ts
  - package.json
  - playwright.config.ts
  - src/app/api/image-errors/route.ts
  - "src/app/api/series/[slug]/chapters/[externalId]/pages/route.ts"
  - "src/app/series/[slug]/capitulo/[externalId]/page.tsx"
  - src/components/reader.tsx
  - src/ingest/pages.ts
  - tests/api-chapter-pages.spec.ts
  - tests/api-image-errors.spec.ts
---

## Decided
El 404 del lector en desarrollo no era un bug del código: la base de desarrollo está ingerida desde Olympus (896 Series con vínculo `olympus`) y `.env` pedía `SOURCE_ADAPTER=fake`. El endpoint busca el vínculo de la Fuente activa y, sin él, responde 404 «Serie sin vínculo a la Fuente activa». La página de Serie registra lo mismo como `series-sync-skipped` con `reason: no-link-for-source`, así que el síntoma ya venía avisando desde #23.

La configuración de desarrollo se alinea con los datos que hay en la base: `.env` pasa a `SOURCE_ADAPTER=olympus`. El arnés de tests no depende de `.env`: `playwright.config.ts` fuerza `fake` en `webServer.env`, así que la suite sigue corriendo con fixtures.
El lector se queda en «Cargando Capítulo» al abrir la app desde el celular por la IP de la LAN, aunque la API responda 200 y en localhost todo funcione. La causa no está en el lector: Next bloquea el upgrade del WebSocket de HMR cuando el Origin no es localhost y responde algo que no es HTTP (medido: `Origin: http://<ip-LAN>:3001` → HTTP/0.9; `Origin: http://localhost:3001` → 101). El cliente de Turbopack espera ese canal y la ruta nunca hidrata: el HTML llega completo e idéntico en ambos orígenes, pero faltan los chunks que solo se piden tras conectar el canal.

`allowedDevOrigins: ["*.*.*.*"]` cubre cualquier IPv4 que asigne el router. La IP es DHCP con lease de ~2 h, así que fijar la IP concreta obligaría a editar la config cada vez. El matcher de Next (`isCsrfOriginAllowed`) parte por puntos y compara segmento a segmento, así que el comodín de cuatro segmentos coincide con IPv4 y nada más.

## Tried and ruled out
- Tocar el endpoint o el lector para «arreglar» el 404: el contrato es correcto; devolver Páginas de una Fuente distinta a la activa rompería la identidad `(seriesId, sourceId, externalId)`.
- Dejar `.env` en `fake` y sembrar Series falsas en la base de desarrollo: mezclaría datos de demo con las 896 Series reales y el catálogo quedaría inconsistente.
- Fijar la IP LAN concreta en `allowedDevOrigins`: funciona, pero la IP caduca con el lease DHCP.
- Buscar la causa en la CSP, en el adapter o en el manifiesto: descartado midiendo. Los headers y el HTML servidos son idénticos byte a byte entre localhost y la IP LAN; el endpoint devuelve 200 con sus Páginas en ambos.
- Sospechar de chunks rotos o truncados: todos responden 200 con cuerpo; lo que falta en LAN son chunks que el navegador nunca llega a pedir.

## Watch out
- Un 404 «Serie sin vínculo a la Fuente activa» señala desajuste entre `SOURCE_ADAPTER` y los vínculos de la base, no un fallo del adapter ni del anti-bot. Comprobar primero qué Fuente tienen los `series_sources` de esa Serie.
- El log `series-sync-skipped` / `no-link-for-source` en la página de Serie es el mismo desajuste visto desde otro lado: si aparece, el lector tampoco podrá abrir Capítulos.
- Cambiar `.env` no requiere reiniciar `next dev`: recarga las variables y la siguiente petición ya usa la Fuente nueva (medido).

In the code:
- `.env` (gitignored): `SOURCE_ADAPTER=olympus`, con comentario del porqué.
- `.env.example` sigue en `fake`: es la plantilla para arrancar sin datos ingeridos.
- Diagnóstico diferencial: mismo endpoint sobre la misma base con dos servidores propios, `SOURCE_ADAPTER=olympus` → 200 con manifiesto, `SOURCE_ADAPTER=fake` → 404.
- `select src.slug, count(*) from series_sources ss join sources src on src.id=ss."sourceId" group by src.slug` → olympus 896, fake 0.
- Verificado tras el cambio: `GET /api/series/los-gemelos-baek/chapters/162/pages` → 200; Reticle `verified: yes` desplazando el lector hasta «Cap. 162 · 21/49».
- El síntoma «se queda cargando» con la API en 200 puede ser hidratación, no datos. Comparar el número de scripts pedidos entre localhost y la IP LAN lo distingue en un paso.
- El bloqueo solo existe en `next dev` (`blockCrossSiteDEV`); la suite e2e corre `next start`, así que ningún test lo cubre. No hay seam: se verificó con un bucle headless desechable contra la IP LAN.
- El comodín no abre todo: orígenes no-IPv4 siguen en 403 (medido con evil.example.com y attacker.test).

- `next.config.ts`: `allowedDevOrigins: ["*.*.*.*"]`.
- Matcher: `node_modules/next/dist/server/app-render/csrf-protection.js` (`matchWildcardDomain`); bloqueo: `.../server/lib/router-utils/block-cross-site-dev.js`.
- Bucle rojo/verde: Playwright headless contra `http://<IP-LAN>:3001/series/<slug>/capitulo/<id>`, afirmando que aparece `pagina-0`. Antes: spinner eterno, 0 imágenes. Después: 6 `<img>` con src, 0 errores de consola.
