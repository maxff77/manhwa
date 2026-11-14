# Pipeline de imágenes

Spec del ticket [#8](https://github.com/maxff77/manhwa/issues/8). Cómo se sirven las Páginas al lector y cómo se pasa a caché propia si la Fuente bloquea el hotlink.

## Decisión

**v1: hotlink directo.** La API devuelve la URL de origen de cada Página y el navegador descarga de `media.imagesolymp.xyz`. El servidor no proxya la lectura online, no descarga y no cachea imágenes. **Excepción:** las Descargas offline pasan por un proxy de solo streaming (`/api/offline/pages/<pageId>`) para evitar el padding de cuota de las respuestas opacas; ver `docs/specs/offline-pwa.md`.

**Caché en R2: fallback diseñado, no construido.** Se activa si Olympus bloquea el hotlink. El diseño está abajo; el código se escribe cuando ocurra.

## Contrato con el lector

- La API de páginas devuelve una lista de `{ position, url }`; `url` es **opaca**: el lector no asume host, patrón ni expiración.
- Los `<img>` del lector llevan `referrerpolicy="no-referrer"` (el hotlink está verificado sin Referer).
- CSP: `img-src https://media.imagesolymp.xyz`. En modo caché se suma `'self'` y el dominio público de R2 (verificar que los redirects se re-evalúen contra la CSP).
- El lector no consulta `Page.status`. En v1 todas las filas quedan `PENDING`: significa «no cacheada», no «no servible».

## Fallo de imagen

- Un reintento automático con cache-buster; después, placeholder local con botón «reintentar». No hay placeholders generados en el servidor.
- Cada `onerror` de imagen hace `navigator.sendBeacon` a un endpoint que solo escribe una línea de log estructurada (`pageId`, `chapterId`, `url`, timestamp). Sin tabla ni estado.
- La detección del bloqueo de hotlink es la tasa de errores en esos logs; el cambio a modo caché es una decisión manual del operador, nunca automática.

## Sincronización de páginas

En cada `getChapterPages` exitoso, el pipeline reemplaza el conjunto por posición:

- upsert por `@@unique([chapterId, position])` actualizando `sourceUrl`;
- borra las filas con posición mayor o igual a la nueva longitud.

Un fallo del adapter no toca la DB: el contrato nunca devuelve listas parciales.

## Modo caché (fallback)

### Activación y transición

- Flag de entorno `IMAGE_MODE=hotlink|r2`, leído al armar la respuesta de páginas.
- En `r2`, la API devuelve URLs de plataforma `/api/pages/<id>` (mismo origen). El lector no cambia: ya renderiza el `url` que venga.
- Rollback = flip del flag. No hay release de cliente en ninguna de las dos direcciones.

### Servido

`GET /api/pages/<id>`:

- busca la `Page` **solo por id**; nunca acepta una URL como parámetro (no es un proxy abierto);
- `READY` → `302` a la URL pública del bucket R2 (dominio propio, sin URLs firmadas);
- no `READY` → read-through: descarga `sourceUrl`, devuelve los bytes y sube a R2 en paralelo; single-flight por `pageId`, semáforo de 8 descargas concurrentes por host de la Fuente, timeout por descarga.

### Claves de objeto

`pages/<pageId>/<primeros 8 hex de sha256(sourceUrl)>.<ext>`

- `ext` sale del `Content-Type`; se persisten `r2Key`, `mimeType` y `bytes`.
- Sin deduplicación de contenido: la deduplicación es el single-flight. Si un re-sync cambia la URL, cambia la clave y nunca se sirve la imagen vieja; el objeto huérfano lo barre el lifecycle.

### Estado y reintentos

Al activar el modo caché, `Page` gana `attempts Int @default(0)`, `lastError String?` y `lastAttemptAt DateTime?`.

- 3 fallos consecutivos → `ERROR`.
- Una petición nueva tras un cooldown de 10 minutos reintenta igual: `ERROR` es señal para operación («qué páginas están rotas hoy»), no lápida.
- Sin sweeper de fondo: el read-through reintenta solo cuando alguien lee.

### Eviction

Regla de lifecycle de R2: borrar objetos a los 90 días de creados. Cero código; la próxima lectura repuebla por read-through. El número de días se ajusta sin tocar código.

## Riesgos abiertos

- Si Olympus bloquea por IP del servidor y no solo el hotlink del navegador, el read-through tampoco funciona. Se detecta con los logs del endpoint; no hay diseño que lo evite.
- El hotlink expone las URLs del CDN y la IP del lector a Olympus. Aceptado en v1.
- Si la Fuente agrega URLs firmadas o expirables, el read-through falla igual que el hotlink y hace falta re-sincronizar el capítulo para refrescar `sourceUrl` (y con eso cambia la clave).
- Coordinación con #9 (offline): las Descargas usan el proxy de streaming `/api/offline/pages/<pageId>` y se cachean por `pageId`, no por URL de origen. Un cambio de `IMAGE_MODE` no invalida lo descargado. Ver `docs/specs/offline-pwa.md`.

## Checklist al activar

- [ ] `READY` → 302 a R2; `PENDING` → read-through.
- [ ] 10 peticiones concurrentes a la misma Página → 1 sola descarga al origen.
- [ ] Re-sync con URL nueva → clave nueva; la vieja no se sirve.
- [ ] 3 fallos → `ERROR`; petición tras cooldown reintenta.
- [ ] CSP incluye `'self'` y el dominio de R2.
