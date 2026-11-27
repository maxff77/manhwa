---
title: La página de Serie es un calendario de Capítulos por mes bajo una cabecera pintada por la portada
author: Richard
date: 2026-11-27
branch: design/theme-uber
cost: { minutes: 26, tokens: 501873 }
id: l-27d5a7b4
scope: repo
status: active
src: agent
touches:
  - ".impeccable/mocks/decision/serie-calendario.html"
  - ".impeccable/mocks/decision/serie-indice-tomo.html"
  - ".impeccable/mocks/decision/serie-poster.html"
  - src/components/synopsis.tsx
  - "src/app/series/[slug]/page.tsx"
  - DESIGN.md
  - src/app/globals.css
  - src/lib/format.ts
  - tests/series.spec.ts
---

## Decided
- La página de Serie agrupa los Capítulos por mes de publicación en casillas, de lo nuevo a lo viejo; los meses vacíos entre dos grupos se muestran como «Sin Capítulos: junio–agosto de 2026». El usuario eligió esta estructura en una ronda de bocetos (2026-11-26) frente a «Índice de tomo» (cifras grandes en filas) y «Póster» (portada a pantalla completa).
- La cabecera es la propia portada, desenfocada y saturada, detrás de un velo; vive SIEMPRE en tema oscuro con `className="dark"` en la sección. Funciona porque HeroUI redeclara también los tokens derivados (hover, soft) bajo `.dark`, así que Button y Chip de dentro usan el tema oscuro sin código aparte. El color no pasa a botones ni acentos: la regla monocroma de DESIGN.md sigue en pie.
- El orden (recientes / antiguos) vive en la URL (`?orden=antiguos`) con dos enlaces con las clases de ToggleButtonGroup, no con el componente cliente: funciona sin JS y las fechas se formatean solo en el servidor (un componente cliente las formatearía en la zona del navegador y rompería la hidratación).
- El segmento seleccionado usa el acento (`bg-accent`), no el `accent-soft` por defecto de HeroUI.
- «Nuevo» = publicado hace menos de 7 días; la casilla es del acento y la palabra sustituye a la fecha (que queda sr-only). Así mide lo mismo que las demás.

## Tried and ruled out
- `accent-soft` de HeroUI para el segmento seleccionado: 1,3:1 frente al otro segmento en claro e invisible en oscuro (medido con píxeles).
- Casilla «Nuevo» a dos columnas: rompía la primera fila del mes en móvil (el Capítulo siguiente quedaba solo en otra fila).
- Velo de la cabecera al 45 %: con una portada blanca el texto secundario bajaba de 4,5:1. Con 55 % → 70 % → 95 % el peor caso (portada blanca sustituida) da 5,3:1 o más.

## Watch out
- Los botones de HeroUI con la preset Uber miden 12 px de radio (`rounded-3xl` = 3 × 4 px) en toda la app, home incluida; DESIGN.md dice que botones y campos comparten la esquina de 4 px. Está sin decidir cuál de los dos manda.
- Las fechas del test de la Serie van a mediodía UTC a mitad de mes: con medianoche UTC el mes cambia según la zona del servidor (en America/Mexico_City el 1 de enero cae en diciembre).
- Reticle: un `reticle_act { steps }` cuyo último paso navega al lector (404, aún no existe) devuelve `unknown` porque la pestaña se desconecta; cada paso por separado con `reticle_act_and_wait` + `until: allOf[route, net]` da `verified: yes`.

In the code:
- src/app/series/[slug]/page.tsx (`calendar`, `pause`, `SortToggle`, `NEW_MS`, `generateMetadata` con la portada en openGraph)
- src/components/synopsis.tsx («Leer más» solo en móvil)
- src/app/globals.css (`@keyframes cover-wash`, `::selection`)
- src/lib/format.ts (`timeAgo` compartido con la home)
- tests/series.spec.ts
- Brief con el contrato de dirección: .impeccable/surfaces/src-app-series-slug-page-tsx.md
