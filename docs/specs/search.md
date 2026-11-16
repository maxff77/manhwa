# Búsqueda del catálogo

Spec del ticket [#15](https://github.com/maxff77/manhwa/issues/15). Cómo busca la plataforma Series por título en v1.

## Alcance

- **Solo Catálogo**: busca sobre las Series ya ingestadas en la DB. No busca en la Biblioteca del Usuario ni en Colecciones.
- **Solo títulos**: `title` y `originalTitle`. Sinopsis y autores quedan fuera de la búsqueda textual; los géneros y el estado filtran en `docs/specs/catalog.md`.
- **Sin fuzzy**: no hay tolerancia a erratas, sinónimos ni transliteraciones en v1.
- **Fuera de este spec**: filtros, orden sin `q` y página de inicio; se definen en `docs/specs/catalog.md`.

## Datos

- La búsqueda lee únicamente la tabla `Series`. **No hay consulta en vivo a Olympus** para Series no ingestadas: duplicaría el tráfico, chocaría con el anti-bot y rompería la deduplicación canónica de `Series`.
- El primer vertical slice del scraper debe ingerir el catálogo completo de Olympus (**890 Series al 2026-11-14**). Si la ingesta queda parcial, la búsqueda también.
- Se añaden dos columnas a `Series`: `titleNormalized` y `originalTitleNormalized`. Se llenan al crear o actualizar la Serie con una única función `normalizeTitle()`.
- Normalización: NFD, se quitan las marcas diacríticas, minúsculas y espacios colapsados. La puntuación se conserva.
- Cambiar `normalizeTitle()` obliga a re-backfillear ambas columnas.

## Coincidencia

- `q` se recorta. Máximo 100 caracteres y 8 términos separados por espacios; los términos sobrantes se ignoran.
- **Todos los términos deben coincidir**: cada término aparece como substring en `titleNormalized` o en `originalTitleNormalized` (la condición se evalúa por término, no por columna).
- Sin mínimo de caracteres. `q` sin términos (ausente, vacía o solo espacios) no restringe el texto: la petición es un listado de catálogo y le aplican los filtros y el orden de `docs/specs/catalog.md`.
- Los caracteres `%`, `_` y `\` de cada término se escapan antes del `ILIKE`. Consulta SQL parametrizada.
- Sin `unaccent`, sin `pg_trgm` y sin índice GIN en v1: el escaneo de ~890 filas es de microsegundos. El índice se evalúa cuando el catálogo pase de ~10.000 Series o la p95 supere 50 ms.
- `tsvector` descartado: no hace substring y el stemming estorba con nombres propios y préstamos.

## Orden

1. Coincidencia exacta: la consulta completa normalizada es igual a `titleNormalized` o `originalTitleNormalized`.
2. Prefijo: `titleNormalized` o `originalTitleNormalized` empieza por la consulta completa normalizada.
3. Resto de coincidencias por término.

Desempate: `titleNormalized` ascendente, luego `id` ascendente. Sin popularidad (Follow arranca en cero) y sin `updatedAt` (cambia en cada scrape y no mide relevancia).

## API

`GET /api/series?q=<texto>&genre=<g>&status=<s>&sort=<orden>&limit=<n>&cursor=<opaco>`

- Pública, sin sesión.
- Modo búsqueda solo cuando `q` tiene algún término. Sin términos, es un listado de catálogo con filtros y orden propios (`docs/specs/catalog.md`).
- En modo búsqueda el orden es el de relevancia: enviar `sort` → `400`.
- `limit`: 20 por defecto, máximo 50. Fuera de `1..50` → `400`.
- `cursor`: opaco, codifica el offset y una huella de `q`+filtros+orden. No coincide o es inválido → `400`. La última página devuelve `nextCursor: null`.
- Respuesta:

  ```json
  {
    "items": [
      {
        "id": "cuid",
        "slug": "academia-de-la-ascension",
        "title": "Academia de la Ascensión",
        "coverUrl": "https://media.imagesolymp.xyz/comics/covers/11/x.webp",
        "status": "ONGOING",
        "type": "MANHWA",
        "latestChapter": { "number": 201, "publishedAt": "2026-11-07T13:36:00.000Z" }
      }
    ],
    "nextCursor": "b3JkZXI6MjA"
  }
  ```

- `coverUrl` es la portada ya resuelta según el modo de imágenes vigente (`docs/specs/image-pipeline.md`).
- `latestChapter` es `null` si la Serie no tiene Capítulos ingeridos.
- Sin `total` en la respuesta: el cliente pagina con `nextCursor`.
- Errores de validación (`limit`, `cursor`, `q` de más de 100 caracteres) → `400` con cuerpo `{ "error": "<motivo>" }`.

## Criterios de aceptación

- [ ] `q=academia` devuelve «Academia de la Ascensión» y no Series que no contienen el término.
- [ ] `q=ACADEMIA` y `q=académia` devuelven el mismo conjunto.
- [ ] `q=academia ascension` encuentra «Academia de la Ascensión» (términos separados, cualquier orden).
- [ ] `q=100%` no devuelve todo: el wildcard se escapa.
- [ ] `q=` (sin términos) devuelve la primera página del catálogo, igual que sin `q`.
- [ ] `q=academia&sort=latest` devuelve `400`.
- [ ] Un `cursor` emitido con otra búsqueda, filtros u orden devuelve `400`.
- [ ] Cada ítem incluye `latestChapter` (o `null`).
- [ ] `limit=51` y `cursor` inválido devuelven `400`.
- [ ] Con datos estables, dos páginas consecutivas no repiten ni saltan Series.
- [ ] Las coincidencias exactas y de prefijo aparecen antes que las coincidencias internas.
- [ ] La respuesta no expone `titleNormalized` ni otros campos internos.
- [ ] La búsqueda no hace peticiones a Olympus.

## Riesgos

- **Ingesta parcial**: la búsqueda solo es completa si el primer vertical slice ingiere las 890 Series.
- **Drift de normalización**: cambiar `normalizeTitle()` sin backfill deja Series invisibles para ciertos términos.
- **Escala**: a partir de ~10.000 Series o p95 > 50 ms, migrar a `pg_trgm` + GIN. El cursor opaco permite cambiar la implementación sin tocar al cliente.
- **Puntuación conservada**: `rezero` no encuentra «Re:Zero» en v1. Aceptado; el plegado de puntuación se evalúa si aparecen casos reales.
