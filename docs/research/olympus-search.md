# Búsqueda textual en Olympus

**Ticket:** #14 — Mecanismo de búsqueda de Olympus (mapa #1)
**Fecha del estudio:** 2026-11-14 (snapshot; el sitio no documenta su API y cambia sin aviso)
**Estado:** investigación completada

## Resumen ejecutivo

- **Hoy no existe búsqueda textual server-side en `olympusxyz.com`.** `/api/series` solo pagina y filtra por `type`; los parámetros de texto (`search`, `q`, `query`, `name`, `title`, `buscar`, `s`, `nombre`, `filter[name]`) se ignoran: devuelven un payload **byte a byte idéntico** a la página 1 sin filtro. No es un falso negativo: se probó con `academia`, palabra que sí está en el catálogo (primer resultado de la página 1).
- **`/api/search` ya no existe en el host actual.** Responde 404 de Nuxt tanto con `q` como con `name`. Existió una búsqueda server-side histórica en un subdominio de API (`GET /api/search?name=<q>`, con la extensión imponiendo mínimo 3 caracteres y un máximo de 40 por un límite de la API) que usaban clientes de terceros en 2025; el subdominio de API (`panel.<dominio>`) hoy no resuelve para el dominio actual.
- **La búsqueda es client-side sobre el catálogo completo.** Los dos clientes mantenidos que se encontraron la implementan así: descargan `GET /api/series/list` (un JSON con todo el catálogo), lo cachean (10 min o 1 h) y filtran por `name` con `contains` case-insensitive. `GET /api/series/list` responde 200 `application/json` en el host actual (verificado con descarga acotada; no se descargó el catálogo).
- **Recomendación para `search(query)`:** query vacía → `GET /api/series?page=N` (15 por página, 60 páginas, 890 cómics) con cursor opaco de página; query no vacía → fetch único de `/api/series/list` cacheado en el adapter, filtro local por nombre normalizado y paginación local con cursor opaco de offset. Fetch + JSON alcanza; no hace falta navegador headless.

## Respuesta directa

| Pregunta del ticket | Respuesta |
|---|---|
| Endpoint/parámetro de búsqueda | **Ninguno vigente.** `/api/series` ignora parámetros de texto; `/api/search` (histórico) hoy 404 |
| ¿Server-side o client-side? | **Client-side sobre el catálogo completo** (`/api/series/list`); el backend no ofrece filtro textual |
| Paginación del catálogo | `/api/series?page=N`, 15 por página, 60 páginas, 890 cómics (2026-11-14) |
| Paginación de la búsqueda | Local, definida por el cliente (20/página Mihon; 30/página Msopla). El adapter la define |
| ¿Fetch + JSON o headless? | **Fetch + JSON**; sin headless. El único paso que requiere HTML sigue siendo la página de capítulo (#13) |

## Metodología

- Todas las peticiones con `User-Agent: ManhwaPlatformBot/1.0 (+https://github.com/maxff77/manhwa)`, `Accept: application/json`, sin paralelismo.
- Fecha/hora UTC de la captura: `2026-11-14T16:26:41Z`–`2026-11-14T16:30:37Z`.
- Peticiones puntuales: **31 peticiones HTTP a `olympusxyz.com`** (8 chunks JS, 3 manifiestos de build, robots y home, y 18 a rutas `/api/...`), 1 a `olympus.pages.dev` y 1 intento DNS a `panel.olympusxyz.com`. Son 6 más que la guía de ~25 por la inspección de bundles; ninguna descargó el catálogo completo (el GET a `/api/series/list` se cortó a 4 KiB con `--max-filesize`).
- Sin 403, 429 ni redirección al host trampa en ninguna petición. No hubo bloqueo.
- Se respetó `robots.txt`: Cloudflare Managed Content Signals, `User-agent: * / Allow: /`, con bloqueo explícito de ClaudeBot, Claude-Web, anthropic-ai, GPTBot, CCBot y otros. No se usó WebFetch ni navegador.
- La UI del buscador es un modal tipo command palette: el HTML server-rendered trae `<button class="searchbtn" aria-label="Buscar series">` con atajo `⌘K`; no hay ruta `/buscar` ni `/search` en el payload.

## Evidencia: `/api/series` no tiene búsqueda textual

Control: `GET https://olympusxyz.com/api/series?page=1` → **200**, `application/json`, 9.925 bytes.

```json
{"data":{"series":{"current_page":1,"from":1,"last_page":60,"per_page":15,"to":15,"total":890,
  "data":[{"id":11,"name":"Academia de la Ascensión",
           "slug":"academia-de-la-ascension-20261114-080134843",
           "status":{"id":1,"name":"Activo"},
           "cover":"https://media.imagesolymp.xyz/comics/covers/11/tmpedu9scno-lg.webp",
           "chapter_count":201,"type":"comic","total_views":0,"monthly_views":0}, ...]},
 "recommended_series":{...}}}
```

- 15 items en página 1; campos del item: `id`, `name`, `slug`, `status`, `cover`, `cover_srcset`, `chapter_count`, `type`, `total_views`, `monthly_views`.
- `GET /api/series?page=2` → **200**, 9.758 bytes, `current_page: 2`, primer item `Almacenes ocultos en el Apocalipsis`. La paginación funciona.
- `GET /api/series?type=novela&page=1` → **200**, 7.405 bytes, 9 items, `last_page: 1`, `total: 9`, todos `type: "novel"`. **Los filtros estructurados sí funcionan**; lo que se ignora es el texto.

### Parámetros de texto probados (todos ignorados)

Cada uno se comparó con el control usando `cmp`; todos devolvieron **200 con 9.925 bytes idénticos** al control.

| Parámetro | Valor | Resultado |
|---|---|---|
| `search` | `academia` | idéntico al control |
| `q` | `murim` | idéntico al control |
| `query` | `academia` | idéntico al control |
| `name` | `academia` | idéntico al control |
| `title` | `academia` | idéntico al control |
| `nombre` | `academia` | idéntico al control |
| `buscar` | `academia` | idéntico al control |
| `s` | `academia` | idéntico al control |
| `filter[name]` | `academia` | idéntico al control |

`academia` aparece en el catálogo (primer item: "Academia de la Ascensión"), así que una búsqueda server-side funcional habría devuelto un subconjunto, no la página 1 completa. El ticket #13 había probado `search`; esta investigación confirma que el problema no es el nombre del parámetro en ese endpoint.

## Evidencia: `/api/search` hoy no existe

| Petición | Status | Respuesta |
|---|---:|---|
| `GET /api/search?q=academia` | 404 | `{"error":true,...,"statusCode":404,"statusMessage":"Page not found: /api/search?q=academia"}` (404 de Nuxt, no de la API) |
| `GET /api/search?name=academia` | 404 | Mismo 404 de Nuxt con `name` |
| `GET /api/series/search?q=academia` | 404 | `{"statusMessage":"Series not found"}`: el router lo interpretó como `/api/series/{slug}` con slug `search` |

Nota: `HEAD` no está soportado por las rutas de la API (`HEAD /api/series?page=1` devuelve 404 aunque `GET` devuelve 200), así que `HEAD` no sirve para sondear rutas en este sitio.

### Existió: `GET /api/search?name=` (histórico, host muerto)

La extensión de Mihon/Keiyoushi para Olympus, en su versión de 2025-03-13 ([KEI-HIST]), hacía:

```kotlin
val apiUrl = "$apiBaseUrl/api/search".toHttpUrl().newBuilder()
    .addQueryParameter("name", query.substring(0, min(query.length, 40)))
    .build()
return GET(apiUrl, headers)
```

- Mínimo 3 caracteres impuesto por la extensión; máximo 40 por un límite de la API ("reduce search query length to api limit" en el mensaje del commit).
- `apiBaseUrl` era un subdominio aparte: `dashboard.<dominio>` y, desde 2026-06-23, `panel.<dominio>` ([KEI-URL]).
- Hoy `https://panel.olympusxyz.com` **no resuelve** (curl error 6, `Could not resolve host`). El dominio que usaba la extensión en esa época era otro (`olympusbiblioteca.com`), así que el host exacto de la API histórica no se puede reconstruir con certeza.
- En junio de 2026 la extensión ya había desactivado la búsqueda (`searchMangaRequest` lanzaba `UnsupportedOperationException`) mientras seguía usando `/api/series/list` ([KEI-JUN]). Es decir, la desaparición de `/api/search` es anterior a esta investigación.

## Evidencia: la búsqueda es client-side sobre `/api/series/list`

- `GET https://olympusxyz.com/api/series/list` → **200**, `application/json`. La descarga se cortó deliberadamente a 4 KiB (`curl --max-filesize 4096`, exit 56), así que no se guardó el catálogo ni se midió su tamaño.
- Extensión de Mihon/Keiyoushi, versión actual ([KEI-EXT], 2026-11-03):

```kotlin
private suspend fun fetchSeriesList() = seriesListMutex.withLock {
    val series = client.get("$baseUrl/api/series/list", Fetch.XHR).parseAs<PayloadMangaDto>()
    val comics = series.data.asSequence().filter { it.type == "comic" }.toList()
    ...
}

override suspend fun getSearchMangaList(page: Int, query: String, filters: FilterList): MangasPage {
    fetchSeriesList()
    val filteredList = seriesList.filter { it.name.contains(query, ignoreCase = true) }
    val paginatedList = filteredList.drop((page - 1) * 20).take(20)
    val hasNextPage = page * 20 < filteredList.size
    return MangasPage(paginatedList.map { it.toSManga() }, hasNextPage)
}
```

  Cache: 1 hora. DTO ([KEI-DTO]): `PayloadMangaDto(val data: List<MangaDto>)`, con `MangaDto(id, name, slug, cover?, type?, summary?, status?, genres?)`.
- Extensión Tachiyomi de Msopla ([JAVA-EXT], commit 2026-11-11), reconstruida "a partir del APK 1.4.1 con el mismo comportamiento":

```java
 * - Búsqueda: local, sobre el catálogo completo (/api/series/list, caché de 10 min).
...
private synchronized List<JsonObject> catalog() throws Exception {
    ...
    for (JsonElement element : data(read(request("/api/series/list")))) { ... }
}
...
static MangasPage search(List<JsonObject> catalog, int page, String query) {
    String needle = normalized(query);   // NFD, quita diacríticos, lowercase, trim
    ...
    if (normalized(str(item, "name")).contains(needle)) { matches.add(manga(item)); }
    ... // SEARCH_PAGE_SIZE = 30
}
```

Dos clientes independientes convergen en el mismo patrón: no hay endpoint de búsqueda y el catálogo completo se obtiene con `/api/series/list`.

**Inferencia (no verificada directamente):** el modal `⌘K` del propio sitio hace lo mismo. No se localizó el chunk JS que contiene el llamador del buscador: se inspeccionaron el chunk de entrada y 7 chunks precargados, más los manifiestos de build de Nuxt, y ninguno contenía `Buscar series` ni rutas `/api/`. La conclusión se apoya en el comportamiento del backend (sin parámetro de texto) y en los dos clientes.

### Payload de `/api/series/list` (forma según los clientes, no descargado)

```json
{ "data": [
  { "id": 11, "name": "...", "slug": "...", "cover": "https://media.imagesolymp.xyz/...",
    "type": "comic", "summary": "...", "status": {"id": 1, "name": "Activo"},
    "genres": [{"id": 1, "name": "Acción"}] }
] }
```

Los DTO de ambos clientes lo tratan como una lista plana (sin paginador) y lo llaman sin `page`; si la respuesta trae campos extra de paginación, los clientes los ignoran. Incluye todos los tipos; ambos clientes filtran `type == "comic"` del lado del cliente. No se descargó para no traer el catálogo entero, así que tamaño, orden exacto y presencia de `summary`/`genres` no están verificados en primera persona.

## Payloads y paginación del catálogo (verificado)

| Aspecto | Valor |
|---|---|
| Endpoint | `GET https://olympusxyz.com/api/series?page=N` |
| Página | 1-based (verificado `page=1` y `page=2`). Ausencia o valores inválidos: no probado |
| Tamaño de página | 15 (`per_page: 15`) |
| Páginas | 60 (`last_page: 60`) |
| Total | 890 (`total: 890`; #13 reportó 889 el 2026-11-12) |
| Tipo por defecto | solo cómics (`type: "comic"` en los 15 items de la página 1) |
| Novelas | `?type=novela` → 9 items, 1 página, `type: "novel"` |
| Envoltura | `data.series` (paginador) + `data.recommended_series` (ignorable) |
| Item | `id`, `name`, `slug`, `status{id,name}`, `cover`, `cover_srcset`, `chapter_count`, `type`, `total_views`, `monthly_views` |

## Recomendación para `search(query)` del contrato

Contrato de referencia: `docs/specs/source-adapter.md` (ticket #6). Firma: `search(query: string, cursor?: string): Promise<SourceSearchPage>`; query vacía = recorrer el catálogo; `cursor` opaco; `nextCursor === undefined` = no hay más.

### Query vacía: catálogo paginado

1. `GET /api/series?page=<n>` con `n` desde el cursor (default 1).
2. Mapear cada item a `SourceSeriesSummary`:
   - `externalId`: slug de la página, es decir `<prefijo>-<slug de API>` (p. ej. `comic-el-hijo20-225-de-la-espada13424`). El contrato lo define como el slug de la URL `/series/<slug>`; #13 verificó que la página lleva el prefijo de tipo y la API no.
   - `title`: `name`.
   - `coverUrl`: `cover`.
   - `url`: `https://olympusxyz.com/series/<externalId>`. Para cómics el prefijo es `comic-` (verificado en #13); para novelas `novela-` es **asumido** a partir de la ruta `/series?tipo=novela` y no se verificó una URL de novela.
3. `nextCursor` = base64url de `{v:1, p:<current_page + 1>}`; `undefined` cuando `current_page >= last_page`. El pipeline nunca lo interpreta.
4. Ignorar `recommended_series`. No intentar forzar otro tamaño de página (`per_page` no se probó; no está documentado).
5. Cada página son ~10 KB; no necesita caché.

### Query no vacía: filtro local con caché

1. **Un solo fetch** de `GET /api/series/list`; cachear en el módulo del adapter con TTL de **10 minutos** (el cliente de Msopla usa 10 min; el de Mihon, 1 h). Deduplicar fetches concurrentes y respetar "una petición en vuelo por host".
2. Filtrar `type === "comic"` para que el universo de la búsqueda coincida con el del catálogo por defecto. Si en el futuro se incluyen novelas, filtrar ambos tipos y construir la URL con el prefijo correcto.
3. Normalizar consulta y nombre: NFD, eliminar marcas diacríticas, `lowercase`, `trim`; comparar con `normalizedName.includes(normalizedQuery)`. Es la normalización del cliente de Msopla y hace la búsqueda insensible a mayúsculas y tildes. No hay evidencia del comportamiento del buscador del sitio; la semántica es decisión del adapter y debe documentarse en su código.
4. Sin mínimo artificial de caracteres. La extensión histórica imponía 3, pero al filtrar localmente no hace falta; el cursor acota el resultado.
5. Paginación local de 20–30 items (recomiendo **20**, comparable a los 15 del catálogo; 30 es lo que usa Msopla). Preservar el orden de `/api/series/list`; el catálogo paginado observado está en orden alfabético por `name` y es razonable asumir el mismo orden en la lista completa, pero no se verificó. No reordenar.
6. Cursor opaco: base64url de `{v:1, q:<hash corto de la query normalizada>, o:<offset>}`. Si `q` no coincide, reiniciar en `offset = 0` en vez de lanzar (defensivo ante cursores viejos). `undefined` cuando `offset + pageSize >= matches.length`.
7. Errores: si `/api/series/list` devuelve no-200, HTML o JSON inválido, lanzar `SourceError("UPSTREAM")` o `SourceError("PARSE")`. **No devolver lista vacía** (el contrato prohíbe listas parciales y una lista vacía mentiría sobre "sin resultados").
8. **No** hacer fallback a recorrer las 60 páginas de `/api/series` para buscar: son 60 peticiones (~1 min con la serialización del contrato) por cada query. Si algún día se necesita, que sea una decisión explícita con caché y ticket propio.
9. Invalidez de caché: el catálogo cambia (889 → 890 entre el 12 y el 14 de noviembre). Un TTL de 10 min acota la deriva; la paginación por offset sobre una lista cacheada puede desalinearse si expira a mitad de una paginación. Es aceptable para búsqueda y debe quedar documentado.

### Por qué no headless

`/api/series/list` y `/api/series?page=N` son JSON. El adapter puede implementar `search` completo con fetch + parser, sin navegador. Coincide con la conclusión de #13: solo `getChapterPages` requiere parsear HTML.

### Mapeo al checklist del contrato

| Caso del checklist | Implementación |
|---|---|
| Query con resultados | filtro local sobre `/api/series/list` cacheado |
| Query vacía (catálogo) | `/api/series?page=N` |
| Cursor con más páginas | `{p: next_page}` o `{o: offset + pageSize}` |
| Cursor final | `undefined` cuando no hay más |

## Riesgos y preguntas abiertas

- **`/api/series/list` no está documentado y su tamaño no se midió.** Es el catálogo completo (los clientes lo cachean), probablemente cientos de KB. Si el endpoint cambia o desaparece, la búsqueda no vacía falla; el precedente de `/api/search` demuestra que la superficie de la API es volátil.
- **No se capturó la petición real del modal del sitio.** La conclusión client-side es inferencia respaldada por el backend (sin parámetro de texto) y por dos clientes independientes, no por el bundle del sitio. El chunk del buscador no se localizó dentro del presupuesto de peticiones.
- **Semántica de matching del sitio desconocida.** No se sabe si su UI pliega tildes, si busca en `summary`/autores o solo en `name`. Los clientes de terceros usan solo `name` (Mihon case-insensitive; Msopla además sin tildes).
- **Deriva del catálogo:** `total` pasó de 889 (#13, 2026-11-12) a 890 (2026-11-14). Cualquier snapshot envejece.
- **Prefijo `novela-` asumido** para URLs de novelas; no verificado. #13 solo verificó `comic-`.
- **`type` por defecto = cómics** verificado en página 1, pero no se comprobó que las 60 páginas sean todas cómics; el `total: 890` y la existencia de un filtro separado para 9 novelas lo hacen consistente. Las novelas parecen no tener capítulos/páginas en el mismo modelo; fuera del alcance de este ticket.
- **No se probaron otros subdominios de API** (`api.`, `dashboard.`, `panel.` de otros dominios) ni el backend directo. El `/api/search` histórico vivía en `panel.<dominio>`; si sobrevive en otro host, no se encontró. Los clientes mantenidos ya no lo usan.
- **Sin rate limit observado** en 31 peticiones puntuales. No hay límite documentado; mantener la política del contrato (1 en vuelo, delay configurable).

## Fuentes

- **[OL-ROBOTS]** `https://olympusxyz.com/robots.txt` — consultado 2026-11-14. Cloudflare Managed Content Signals; `User-agent: * / Allow: /`; bloqueo de ClaudeBot, Claude-Web, anthropic-ai, GPTBot, etc.
- **[OL-HOME]** `https://olympusxyz.com/` — HTML server-rendered, 2026-11-14. `x-powered-by: Nuxt`, buildId `b63e1dcb-831a-46d1-9033-d80190fc683d`; botón `searchbtn` con `aria-label="Buscar series"` y `⌘K`.
- **[OL-API]** `GET https://olympusxyz.com/api/series?page=1`, `?page=2`, `?type=novela&page=1` y las 9 variantes de parámetros de texto listadas arriba — 2026-11-14. Respuestas 200 JSON; comparadas con `cmp`.
- **[OL-404]** `GET https://olympusxyz.com/api/search?q=academia`, `GET https://olympusxyz.com/api/search?name=academia`, `GET https://olympusxyz.com/api/series/search?q=academia` — 2026-11-14, todas 404.
- **[OL-LIST]** `GET https://olympusxyz.com/api/series/list` — 2026-11-14, 200 `application/json`; descarga acotada a 4 KiB con `curl --max-filesize`, sin conservar el cuerpo.
- **[KEI-EXT]** Extensión Mihon/Keiyoushi `OlympusScanlation.kt`, commit `3aeaa88e267d59755003c23a6db6c7d33ce201a2` (2026-11-03): <https://github.com/keiyoushi/extensions-source/blob/3aeaa88e267d59755003c23a6db6c7d33ce201a2/src/es/olympusscanlation/src/eu/kanade/tachiyomi/extension/es/olympusscanlation/OlympusScanlation.kt>. Búsqueda local sobre `/api/series/list`, caché 1 h, 20 por página.
- **[KEI-DTO]** `Dto.kt` de la misma extensión: `PayloadMangaDto(val data: List<MangaDto>)`, `MangaDto`. <https://github.com/keiyoushi/extensions-source/blob/3aeaa88e267d59755003c23a6db6c7d33ce201a2/src/es/olympusscanlation/src/eu/kanade/tachiyomi/extension/es/olympusscanlation/Dto.kt>.
- **[KEI-HIST]** Commit `d1c8f4512c873429333eaaf399ce057e4fcb0351` (2025-03-13), "Olympus Scanlation: Update domain and reduce search query length to api limit": uso histórico de `GET /api/search?name=<q>`; la extensión imponía mínimo 3 caracteres y el commit limita el máximo a 40 por un límite de la API. <https://github.com/keiyoushi/extensions-source/commit/d1c8f4512c873429333eaaf399ce057e4fcb0351>.
- **[KEI-URL]** Commit `d00920947ae25b3906585079030f99eae5f795b0` (2026-06-23), "Update API URL": `apiBaseUrl` pasa de `dashboard.<dominio>` a `panel.<dominio>`. <https://github.com/keiyoushi/extensions-source/commit/d00920947ae25b3906585079030f99eae5f795b0>.
- **[KEI-JUN]** Archivo `OlympusScanlation.kt` en `d0092094`: búsqueda desactivada con `UnsupportedOperationException` y catálogo ya vía `/api/series/list`. Misma URL que [KEI-EXT] con `?ref=d0092094`.
- **[JAVA-EXT]** Extensión Tachiyomi de Msopla, `OlympusXYZ.java`, commit `bce8a3d0d228eb25ea8b35cb2982148bacef6cc0` (2026-11-11): comentario "Búsqueda: local, sobre el catálogo completo (`/api/series/list`, caché de 10 min)", `catalog()` con TTL 10 min, filtro NFD sin tildes, 30 por página. <https://github.com/Msopla/tachimanga-extensions/blob/bce8a3d0d228eb25ea8b35cb2982148bacef6cc0/src/olympusxyz/src/eu/kanade/tachiyomi/extension/es/olympusxyz/OlympusXYZ.java>.
- **[T13]** Issue #13, "Mecanismo de listado de capítulos de Olympus": slugs de API sin prefijo, capítulos vía `/api/series/<slug>/chapters`, páginas de capítulo en HTML. <https://github.com/maxff77/manhwa/issues/13>.
- **[SPEC]** `docs/specs/source-adapter.md` (ticket #6): contrato `SourceAdapter`, `search(query, cursor?)`, `SourceSearchPage`, `SourceError`. <https://github.com/maxff77/manhwa/issues/6>.

## Anexo: resumen de peticiones

31 peticiones HTTP a `olympusxyz.com` (agrupadas; los conteos son exactos por grupo), 1 a `olympus.pages.dev` y 1 intento DNS.

| Grupo | Peticiones | Resultado observado |
|---|---|---|
| Política y shell | `GET /robots.txt`, `GET /` | 200; UA propio permitido; UI del buscador y buildId |
| Bundles Nuxt | 8 JS (entrada + 7 precargados) + 3 manifiestos de build | 200/404; no se localizó el llamador del buscador |
| Catálogo | `GET /api/series?page=1`, `?page=2`, `?type=novela&page=1` | 200; meta 15/60/890; filtro `type` funciona |
| Parámetros de texto | 9 variantes sobre `/api/series?page=1` | 200; todas idénticas byte a byte al control |
| Búsqueda server-side | `/api/search?q=`, `/api/search?name=`, `/api/series/search?q=` | 404 las tres |
| Catálogo completo | `GET /api/series/list` acotado a 4 KiB | 200 `application/json`; cuerpo no conservado |
| HEAD | `HEAD /api/series/list`, `HEAD /api/series?page=1` | 404 ambas; HEAD no soportado en ninguna ruta |
| Hosts de clientes | `GET olympus.pages.dev`; DNS `panel.olympusxyz.com` | 200 sin redirección; NXDOMAIN |

