---
version: 1
slug: "src-app-series-slug-page-tsx"
primary_target: "src/app/series/[slug]/page.tsx"
related_targets: []
---

# Serie (`/series/[slug]`)

Mode: Operate. Visitante hispanohablante, sobre todo en móvil, sin sesión. Tarea: decidir si lee esta Serie y empezar (Capítulo 1) o saltar a lo nuevo (último Capítulo); encontrar un Capítulo concreto. El usuario insiste: «nosotros vendemos por lo visual».

Respuestas fijadas (2026-11-26): la portada desenfocada pinta la cabecera (botones y texto siguen monocromos); «Empezar a leer» + «Último: Cap. N»; Capítulos de nuevo a viejo con botón para invertir.

Contenido real: títulos de hasta 112 caracteres; sinopsis de hasta 1.634 (16 Series sin ella); 13 sin portada; 4 sin Capítulos; de 0 a 15 géneros; números decimales (17,15); Capítulos sin fecha (pocos); autores vacíos en el Catálogo real. El lector aún no existe: los enlaces a Capítulo dan 404 hasta su ticket.

## Direction contract

THESIS: La Serie es un calendario de entregas bajo una cabecera pintada por su propia portada: Capítulos agrupados por mes en casillas, lo nuevo arriba, ritmo y pausas visibles de un vistazo. Rechaza la ficha de portada pequeña con una lista plana «Capítulo N · fecha».

OWN-WORLD: Monocromo Uber de DESIGN.md, Geist, radios de 4 px. El único color es la portada: enorme, desenfocada y saturada a sangre tras la cabecera, con velo oscuro; la cabecera vive siempre en tema oscuro (botón principal casi blanco). Casillas blancas con borde fino, cifra tabular semibold y día pequeño; «Nuevo» es la casilla sólida del acento.

STORY: El visitante ve portada y título, entiende estado y tamaño de la Serie, y pulsa «Empezar a leer» o «Último: Cap. N». Si busca uno, baja al calendario, ve cuándo salió cada Capítulo e invierte el orden.

FIRST VIEWPORT: Móvil: barra; cabecera pintada con portada de 116 px, título de 24 px, «En emisión · 35 Capítulos», chips de género translúcidos y los dos botones en rejilla 1:1; sinopsis a 3 líneas con «Leer más»; «Capítulos 35» con el conmutador; asoma el primer mes, 4 casillas por fila. Escritorio: cabecera a todo el ancho, portada de 224 px, título de 40 px; sinopsis en columna lateral junto al calendario. Gesto propio: cabecera de mes «Noviembre de 2026 · 4 Capítulos»; lo publicado en 7 días queda marcado «Nuevo».

FORM: Calendario de entregas, posición 7 de 7 en la lista ordenada. seed:8868d19c195f89b5

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
