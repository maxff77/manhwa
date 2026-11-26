# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router) + React 19, HeroUI v3 + Tailwind CSS v4, Prisma 7 + PostgreSQL, Better Auth, Serwist para la PWA y Playwright sobre Postgres real. npm y Node LTS. El detalle y las versiones fijadas viven en `docs/specs/v1.md`.

## Surface Mode

Operate. El visitante viene a completar una tarea —encontrar una Serie, leer un Capítulo, gestionar su Biblioteca— y la interfaz es primero una herramienta de su categoría. La expresión vive en tipografía, paleta, densidad y un gesto propio; nunca en sustituir la navegación o los controles estándar.

## Users

- **Visitante hispanohablante**: lee manhwa en Olympus desde el móvil; quiere descubrir Series, buscar por título y leer sin crear una cuenta.
- **Lector con cuenta**: quiere que su Progreso lo siga entre dispositivos, organizar su Biblioteca con Seguimientos y Colecciones, recibir Alertas de Capítulos nuevos y leer sin conexión.
- **Operador**: el equipo que ingiere el Catálogo completo de Olympus, sincroniza Series y Capítulos al visitarlos y cuida que la Fuente no se caiga ni se bloquee.

## Product Purpose

Una plataforma web en español, instalable como PWA, que ingiere el Catálogo de Olympus y ofrece catálogo navegable, búsqueda sin tildes ni mayúsculas, lector webtoon, cuentas, Biblioteca, Progreso sincronizado, Alertas Web Push y lectura offline.

El éxito de v1 es que un lector pueda pasar de descubrir una Serie a leer un Capítulo nuevo sin fricción, y retomar la lectura en otro dispositivo exactamente donde la dejó. La plataforma **no republica contenido**: la lectura online sirve las Páginas por hotlink desde el CDN de la Fuente.

## Positioning

La capa de lectura y organización que Olympus no da: un Catálogo con búsqueda normalizada y filtros, Progreso que sobrevive al cambio de dispositivo, Biblioteca personal, Alertas y lectura offline. No es una Fuente ni un agregador de metadata: en v1 hay una sola Fuente de contenido y los datos propios (Progreso, Seguimientos, Colecciones, Descargas) son el valor que Olympus no puede copiar.

## Operating Context

- El contenido vive en Olympus (`olympusxyz.com`); la plataforma lo ingiere y lo sirve en su propio catálogo. La identidad externa de una Serie vive en `SeriesSource.externalId`.
- La lectura online usa el CDN de Olympus por hotlink; no hay caché propia de imágenes en v1.
- La audiencia lee sobre todo en el móvil, en vertical, y quiere poder hacerlo en el metro o sin datos.
- v1 se dimensiona para 100 concurrentes, con Postgres propio y scripts de ingesta y alertas disparados por timers systemd. Sin colas, réplicas ni multi-región.
- El Catálogo de Olympus tiene 896 Series (medido el 2026-11-24); el anti-bot de Olympus bloquea una parte de las peticiones, así que el backfill debe ser reanudable.

## Capabilities and Constraints

**En v1**

- Catálogo público con filtros por género y estado, orden alfabético y por último Capítulo, y búsqueda local por título normalizado.
- Página de inicio con «Últimos capítulos», géneros y «Continúa leyendo» con sesión.
- Lector webtoon vertical con ventana de Páginas, restauración de posición, reintento de imagen y navegación al Capítulo anterior/siguiente.
- Cuentas con email+contraseña verificado, Google y Discord; sesiones de 30 días; borrado de cuenta en cascada.
- Biblioteca con Seguimientos, Colecciones y Progreso por Serie; mutaciones con sesión.
- Alertas Web Push agrupadas por Serie y pasadas, detectadas con `listRecentChapters`.
- PWA con Descargas por Capítulo en el dispositivo, revalidación y página «Sin conexión».

**Fuera de v1** (no construir todavía)

Comentarios y moderación (las tablas existen, sin API ni UI), MangaDex y metadata externa, caché de imágenes en R2, valoraciones y orden por popularidad, email de alertas, apps nativas y panel de administración.

**Restricciones**

- Una sola Fuente de contenido en v1. El `SourceAdapter` es la única superficie entre la plataforma y la Fuente; sin fallback silencioso a un adapter falso.
- No se inventan datos editoriales: `type`, `demographic`, `year`, `originalTitle`, `authors` quedan en su valor por defecto o vacíos hasta que exista una Fuente de metadata.
- El vocabulario de la interfaz y de los tests sale de `GLOSSARY.md` (Serie, Capítulo, Página, Seguimiento, Colección, Progreso, Descarga).
- Cualquier decisión de alcance se contrasta con `docs/specs/v1.md`; el detalle por área vive en `docs/specs/`.

## Brand Commitments

- Interfaz y contenido en español de España neutro; se evitan anglicismos cuando el `GLOSSARY.md` tiene el término.
- «Manhwa» es el nombre de trabajo del producto en la shell y el repositorio. No hay logotipo, paleta de marca ni assets gráficos propios todavía.
- La identidad visual usa la preset «Uber» del Theme Builder de HeroUI v3 (monocromo: el color lo ponen las portadas), con modo claro y oscuro y tipografía Geist. Elegida el 2026-11-25; el detalle vive en `DESIGN.md`.

## Evidence on Hand

- `docs/specs/v1.md`: contrato construible de v1; fuente de verdad del alcance.
- `docs/specs/`: catálogo, búsqueda, cuentas, alerts, offline, imágenes, adapter de Fuentes y comentarios.
- `GLOSSARY.md`: vocabulario del dominio.
- `prototype/reader/`: prototipo desechable del lector (ventana de Páginas y scroll vertical).
- `prisma/schema.prisma` y la migración inicial: modelo de datos completo de v1.
- Catálogo real ingerido de Olympus en la base de desarrollo (2026-11-24, registro en `docs/specs/catalog.md`): 896 Series y 27.028 Capítulos. No todas las Series llegan completas, porque la Fuente no lo expone: 13 sin portada, 77 sin géneros y 4 sin Capítulos. Toda pantalla que muestre una Serie tiene que funcionar sin portada, sin géneros o sin Capítulos.
- No hay fixtures reales, testimonios, métricas de tráfico ni assets de marca. No fabricarlos.

## Product Principles

1. **Leer no exige cuenta.** Todo lo público se lee sin sesión; solo guardar Progreso, Seguir, crear Colecciones y Descargar piden sesión.
2. **La Fuente manda.** El contenido y las imágenes vienen de Olympus; la plataforma añade la experiencia, no republica el contenido.
3. **El estado del lector no se pierde.** Progreso, Seguimientos y Descargas sobreviven a cambios de dispositivo, fallos de red y bloqueos de la Fuente.
4. **Una sola Fuente en v1.** El adapter se sustituye en tests, nunca en producción por accidente; sin fallback silencioso.
5. **Móvil primero y offline real.** La lectura vertical y la PWA son el camino principal, no un extra.

## Accessibility & Inclusion

WCAG 2.2 AA es el mínimo obligatorio en toda la interfaz. Cualquier cambio de diseño se revisa contra ese estándar.
