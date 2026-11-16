# Catálogo navegable

Spec del ticket [#16](https://github.com/maxff77/manhwa/issues/16). Cómo se navega el Catálogo en v1 sin búsqueda textual: filtros, orden, endpoint de listado y página de inicio. La búsqueda por título se define en `docs/specs/search.md` y comparte el mismo endpoint.

## Alcance

- **Entra en v1**: filtros por género y estado, orden alfabético y por último Capítulo, endpoint de géneros, página de inicio.
- **No entra**: filtros por tipo, demografía, año, autores o contenido erótico (ninguno se pobla en v1 con Olympus); orden por popularidad; valoraciones; recomendaciones personalizadas. Ver «Fuera de alcance».
- Solo lee datos propios: ni los filtros ni el orden consultan a Olympus.

## Filtros

- **Género**: `genre`, repetible. Coincide por igualdad exacta contra los valores de `Series.genres` (los nombres canónicos que expone la Fuente, en español).
- **Estado**: `status`, repetible. Valores `ongoing`, `completed`, `hiatus`, `cancelled` (minúsculas); cualquier otro → `400`.
- **Combinación**: OR dentro del mismo filtro, AND entre filtros distintos. `?genre=accion&genre=romance&status=ongoing` = (Acción o Romance) y En emisión.
- Un género desconocido no es un error de contrato: devuelve `200` con lista vacía.
- Los filtros se aplican igual en modo catálogo y en modo búsqueda (junto a `q`).
- En v1 no hay filtros sobre campos que la ingesta no llena. `Series.type`, `demographic`, `year`, `originalTitle`, `authors` y `erotic` quedan fuera hasta que exista una Fuente de metadata que los pueble.

## Orden

- `sort=title` (por defecto): `titleNormalized` ascendente, desempate `id` ascendente.
- `sort=latest`: fecha del último Capítulo descendente (`MAX(Chapter.publishedAt)` por Serie), desempate `titleNormalized` ascendente y `id`. Las Series sin Capítulos van al final (`NULLS LAST`), no desaparecen.
- Sin `q`, el orden siempre es uno de esos dos. `sort` desconocido → `400`.
- Con `q` con términos manda la relevancia de `search.md`; enviar `sort` en ese modo → `400`.
- No hay orden por popularidad ni por novedad de ingesta en v1 (ver «Fuera de alcance»).

## API

### `GET /api/series`

Mismo endpoint que la búsqueda. Parámetros:

| Parámetro | Obligatorio | Valor |
|---|---|---|
| `q` | no | Texto de búsqueda. Sin términos → modo catálogo. |
| `genre` | no | Repetible. Nombre exacto de género. |
| `status` | no | Repetible. `ongoing`, `completed`, `hiatus`, `cancelled`. |
| `sort` | no | `title` (defecto) o `latest`. Solo en modo catálogo. |
| `limit` | no | 20 por defecto, máximo 50. Fuera de `1..50` → `400`. |
| `cursor` | no | Opaco. Codifica el offset y una huella de `q`+filtros+orden. |

- Pública, sin sesión.
- **Modos**: con `q` con términos → modo búsqueda (`search.md`); sin términos (ausente, vacía o solo espacios) → modo catálogo, con filtros y orden.
- **Cursor**: si la huella no coincide con `q`+filtros+orden de la petición, o el cursor es inválido, `400`. La huella se calcula sobre los valores normalizados, sin importar el orden ni los duplicados de los parámetros repetidos. El cliente descarta el cursor al cambiar cualquier filtro u orden. La última página devuelve `nextCursor: null`.
- **Respuesta** (idéntica en ambos modos):

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

- `latestChapter` es `null` si la Serie no tiene Capítulos ingeridos.
- Sin `total`; se pagina con `nextCursor`.
- Errores de validación → `400` con cuerpo `{ "error": "<motivo>" }`.

### `GET /api/genres`

- Pública, sin sesión.
- Devuelve los géneros distintos presentes en `Series.genres`, ordenados alfabéticamente: `{ "genres": ["Acción", "Aventura", "..."] }`.
- Cacheada 1 h. Sin conteos en v1.

## Página de inicio

- Se renderiza en el servidor (server component de Next.js) consultando Prisma directo. **No existe `/api/home`.**
- Secciones:
  - **Buscador**: envía a `GET /api/series?q=`.
  - **Continúa leyendo**: 10 Series con `Progress` del Usuario de la sesión, orden `Progress.updatedAt` descendente. Solo aparece con sesión y con al menos un Progreso.
  - **Últimos capítulos**: 20 Series con `sort=latest`. Visitante anónimo también la ve.
  - **Géneros**: rejilla con todos los géneros de `/api/genres`, enlazando al catálogo filtrado.
- Sin «Destacados» (no hay herramienta editorial en v1) y sin «Recién añadido» (`Series.createdAt` es la fecha de ingesta y el backfill inicial los iguala).
- Las secciones públicas se regeneran como máximo cada 60 s; el poller de Capítulos corre cada 5 min, así que la deriva es menor a un ciclo. «Continúa leyendo» se resuelve por petición.

## Ingesta

`sort=latest` exige que la ingesta conozca la fecha del último Capítulo de cada Serie. El primer vertical slice debe recorrer el listado de Capítulos de todas las Series ingestadas (basta la primera página con `direction=desc` por Serie) además del catálogo. Sin eso, `latestChapter` es `null` en todas y `sort=latest` degrada a `title`.

## Fuera de alcance

- **Filtros** por tipo, demografía, año, autores y erótico: campos vacíos en v1; dependen de MangaDex u otra metadata.
- **Popularidad**: Olympus expone `total_views`/`monthly_views`, pero no están verificados (el único ítem observado traía 0) y el contrato del adapter no los captura.
- **Valoraciones propias y recomendaciones personalizadas**: necesitan datos de uso; anotadas en el fog del [mapa](https://github.com/maxff77/manhwa/issues/1).
- **«Recién añadido»** como orden: sin señal útil al lanzar.

## Criterios de aceptación

- [ ] `genre=accion&genre=romance` devuelve Series con Acción **o** Romance.
- [ ] `genre=accion&status=completed` devuelve solo completas con Acción (AND entre filtros).
- [ ] `status=finalizado` devuelve `400`.
- [ ] Un género sin Series devuelve `200 { items: [], nextCursor: null }`.
- [ ] Sin `q`, el orden por defecto es alfabético y estable entre páginas con datos fijos.
- [ ] `sort=latest` ordena por fecha del último Capítulo; las Series sin Capítulos van al final.
- [ ] `sort=otro` devuelve `400`.
- [ ] `q=academia&sort=latest` devuelve `400`.
- [ ] `q=` (sin términos) devuelve la primera página del catálogo, no lista vacía.
- [ ] Un cursor emitido con otros filtros u orden devuelve `400`.
- [ ] Dos páginas consecutivas no repiten ni saltan Series con datos estables.
- [ ] Cada ítem incluye `latestChapter` (o `null`) y no expone campos internos.
- [ ] `/api/genres` devuelve la lista ordenada y sin duplicados.
- [ ] La home muestra «Últimos capítulos» y géneros para un visitante anónimo.
- [ ] La home muestra «Continúa leyendo» solo con sesión y Progreso.
- [ ] Ni los filtros ni el orden hacen peticiones a Olympus.

## Riesgos

- **Deriva del cursor con `latest`**: con cursor por offset, un Capítulo nuevo entre dos páginas puede repetir o saltar una Serie. Aceptado en v1; migrar a keyset `(publishedAt, id)` si molesta.
- **Ingesta parcial de Capítulos**: si el backfill no recorre el listado de cada Serie, `sort=latest` y `latestChapter` quedan vacíos en las no recorridas.
- **Taxonomía de géneros**: los nombres son los de Olympus. Al entrar MangaDex u otra Fuente habrá que decidir el merge de géneros; los filtros comparan igualdad exacta y una Serie con un género no normalizado no aparecerá.
- **Campos sin poblar**: `type` sale en la respuesta pero en v1 será el valor por defecto del pipeline; no usarlo para filtrar.
