# Estrategia offline de la PWA

Spec del ticket [#9](https://github.com/maxff77/manhwa/issues/9). Qué funciona sin conexión, qué se descarga, dónde se guarda y cómo se sirve.

## Alcance

- **Con red**: todo.
- **Sin conexión**: lector de Capítulos descargados, Biblioteca, listas de Capítulos y páginas de Serie ya visitadas, y gestión de Descargas.
- **Solo con red**: catálogo y búsqueda.
- Ruta no cacheada sin conexión → página «Sin conexión» con accesos a Descargas y Biblioteca.
- Descargar exige sesión.

## Descarga y Precarga automática

**Descarga**: copia local de las Páginas de un Capítulo en el dispositivo. La unidad es el **Capítulo**, no la Serie. Es estado local del navegador: no hay tabla `Download` en el servidor ni estado «descargado» sincronizado entre dispositivos.

**Precarga automática**: Descarga iniciada por la app sin una petición explícita, con permiso del Usuario.

- Ajuste global, **apagado por defecto**; se ofrece en la primera Descarga manual.
- Solo en Wi-Fi.
- Alcance: Series con lectura reciente (las últimas abiertas), el **próximo Capítulo no leído**, uno por Serie; al abrir la app o al terminar un Capítulo.
- Tope de bytes para automáticas: **1 GB** por defecto (500 MB / 1 GB / 2 GB ajustable).
- Lo automático es evictable; lo manual nunca se borra sin confirmación.

## UI y cola

- Botón «Descargar» en el lector y en la lista de Capítulos.
- Sección «Descargas» en la Biblioteca: estado por Capítulo, tamaño, uso total y borrar.
- Estados: `pendiente`, `descargando (n/m)`, `listo`, `desactualizado`, `error`.
- Cola persistida en IndexedDB; un Capítulo a la vez, 4 imágenes en paralelo.
- La cola corre con la app abierta: Background Sync no existe en iOS ni Firefox.

## Cuota y evicción

Cache Storage e IndexedDB comparten la cuota del origen. Cifras verificadas el 2026-11-14:

| Navegador | Cuota |
|---|---|
| Chrome/Chromium | 60 % del disco por origen; 80 % global |
| Safari macOS/iOS | 60 % del disco por origen; 80 % global |
| Firefox | 10 % del disco o 10 GiB (best-effort), por grupo de sitios |

- `navigator.storage.estimate().quota` **no es fiable en Chrome**: devuelve `usage + 10 GiB` artificial. Los topes se imponen en la app y se captura `QuotaExceededError`.
- `navigator.storage.persist()` se pide en la primera Descarga. Chrome y Safari deciden por heurística sin preguntar; Firefox pregunta. En Safari **no** evita el borrado ITP.
- **iOS**: sin instalar en la pantalla de inicio, WebKit borra el almacenamiento escribible por script tras 7 días sin uso. La app avisa con instrucciones y muestra un aviso persistente en Descargas mientras no esté instalada.
- **Cuota llena**: antes de descargar se comprueba el espacio con el tope propio; si no cabe, se evictan automáticas no leídas empezando por la más antigua. Si aun así no cabe, se rechaza con mensaje claro y botón a Descargas. Nunca se borra una Descarga manual sin confirmación.

## Transporte de imágenes

Las imágenes de Olympus no envían cabeceras CORS. Una descarga directa sería una respuesta **opaca**, y los navegadores le cobran padding de cuota por respuesta (Chrome: 0–14.431 KiB, media ~7 MiB por imagen). Un Capítulo de 80 imágenes costaría ~560 MiB de cuota para ~14 MiB reales.

Por eso **las Descargas usan un proxy propio de solo streaming**:

- `GET /api/offline/pages/<pageId>` valida el `pageId` contra la DB, resuelve `sourceUrl` y reenvía los bytes. No acepta URLs como parámetro (no es un proxy abierto) y no cachea en servidor.
- La respuesta es del mismo origen: el service worker la guarda como 200 normal, con su tamaño real y sin padding.
- La **lectura online sigue por hotlink** (`docs/specs/image-pipeline.md`). El proxy solo atiende Descargas y no cambia el contrato del lector.
- Clave de Cache Storage: `/api/offline/pages/<pageId>`, estable por Página. Un cambio de `IMAGE_MODE=hotlink|r2` no invalida lo descargado.
- Un Capítulo descargado se sirve **cache-first incluso online**; la revalidación decide si quedó desactualizado.

## Service worker y metadata

- **Serwist 9.5.x** (línea mantenida a 2026-11-14): `@serwist/next` con webpack, `@serwist/turbopack` si Next 16 usa Turbopack.
- Estrategias:
  - app shell: precache;
  - Páginas descargadas: cache-first;
  - Biblioteca, listas de Capítulos y páginas de Serie: stale-while-revalidate;
  - catálogo y búsqueda: network-only, sin fallback;
  - navegación no cacheada: página offline.

## Revalidación y caducidad

- **Sin TTL**: una Descarga no expira.
- Al abrir un Capítulo descargado con red, se revalida el manifiesto (número y URLs de Páginas). Si cambió, el Capítulo pasa a `desactualizado` y se ofrece «volver a descargar»; hasta entonces se sirve la copia local.
- Si la Fuente borró el Capítulo, la copia sigue legible hasta que el Usuario la borre.

## Progreso sin conexión

- La posición de lectura se guarda en IndexedDB y se sincroniza al recuperar red, al abrir la app y al volver a ella; sin depender de Background Sync.
- Conflicto: última escritura gana, con timestamp del servidor al recibir la sincronización.
- **Sesión rechazada** (401) con la sesión local aún vigente por fecha → cuenta revocada o borrada: se purgan las Descargas y se pide login. El cliente guarda el `expiresAt` de la sesión para distinguir caducidad de revocación.
- **Sesión caducada por tiempo** → se conservan las Descargas y se pide login al reconectar.
- **Cierre de sesión explícito** → se purgan las Descargas.

## Límites medidos (2026-11-14)

- Capítulos reales de Olympus: **18–80 imágenes**, 1,4–7,8 MiB (media 80–178 KiB/imagen, máx. 696 KiB).
- Payload por Capítulo: ~1–14 MiB.
- Cache Storage no tiene límite documentado por entrada; el límite práctico es la cuota del origen.

## Fuera de alcance

- Descargar una Serie como unidad atómica. Si se añade, será una cola de Capítulos.
- Catálogo y búsqueda offline.
- Registro de Descargas en el servidor y estado entre dispositivos.
- Background Sync más allá de Chrome.

## Riesgos abiertos

- El proxy de Descargas expone la IP del VPS a Olympus y consume su ancho de banda. Verificado: las imágenes responden 200 sin Referer y con UA de bot, pero el anti-bot de las páginas no garantiza el futuro del CDN.
- En iOS, la supervivencia de las Descargas depende de que el Usuario instale la app; el aviso puede ignorarse.
- La evicción de automáticas puede borrar una precarga que el Usuario esperaba leer; se mitiga priorizando las no leídas y avisando en Descargas.

## Checklist de implementación

- [ ] App shell precacheado y página offline para rutas no cacheadas.
- [ ] `GET /api/offline/pages/<pageId>` valida el id, resuelve `sourceUrl`, hace streaming y no acepta URLs.
- [ ] Descarga de un Capítulo: N imágenes, 4 en paralelo, progreso n/m, estado en IndexedDB.
- [ ] Cache Storage con clave por `pageId`; servido cache-first.
- [ ] Revalidación del manifiesto al abrir con red; estado `desactualizado`.
- [ ] Cuota: aviso iOS sin instalar, uso visible, evicción de automáticas, rechazo claro.
- [ ] Progreso offline: cola en IndexedDB, sincronización en `online`/`visibilitychange`/arranque; 401 con sesión vigente purga Descargas.
- [ ] Cierre de sesión explícito purga Descargas.
- [ ] Precarga automática opt-in, Wi-Fi, próximo Capítulo no leído de Series recientes, tope 1 GB.
