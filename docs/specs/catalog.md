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

### Backfill y refresco diario (#21)

Un solo comando sirve para la carga inicial y para el refresco diario:

```bash
npm run catalog:backfill   # tsx scripts/backfill-catalog.ts
```

- Recorre `search("")` página a página y hace upsert de `Source`, `Series` y `SeriesSource`. La identidad de la Fuente vive en `SeriesSource (sourceId, externalId)`; el slug interno se asigna solo al crear y no cambia aunque cambie el título.
- **Serie nueva o sin Capítulos**: pide `getSeries` (sinopsis, géneros, autores, año, estado) y la primera página de `listRecentChapters`. No marca `chaptersSyncedAt`: eso es de la sincronización al visitar la Serie.
- **Serie existente con Capítulos**: actualiza título, portada y estado desde el resumen del listado; no vuelve a pedir detalle ni Capítulos.
- Un fallo del adapter en una Serie se registra y se sigue con las demás. Un fallo de transporte del listado (`UPSTREAM`, `RATE_LIMITED`, `BLOCKED`) se reintenta hasta 2 veces con backoff (1 s, 2 s): el spec del contrato deja ese reintento al job, no al adapter. Agotados los reintentos, la pasada corta. Nada persistido se borra. Reejecutar reanuda: lo ya completo se salta sin peticiones extra.
- El proceso toma `pg_try_advisory_lock(hashtext('manhwa:catalog-backfill'))`; si otro lo tiene, sale 0 con `lock-busy`. Logs JSON a stdout (`page`, `series-created`, `series-failed`, `chapter-skipped`, `chapter-duplicate`, `catalog-retry`, `catalog-failed`, `done`, `fatal`). Sale 1 si hubo fallos o excepción.
- La Fuente la elige `SOURCE_ADAPTER` vía composition root; sin valor el script falla, nunca cae en `fake`.

La corrida contra Olympus la ejecuta una persona o el timer, no el agente (mismo criterio que el smoke de #20):

```bash
SOURCE_ADAPTER=olympus npm run catalog:backfill
```

Son ~60 páginas de catálogo más dos peticiones por Serie nueva (~890 Series): unas 1.840 peticiones espaciadas 500 ms, del orden de 20–30 min. Si el anti-bot corta la pasada, se relanza el mismo comando.

### Migración de identidad (una sola vez por base)

```bash
npm run catalog:migrate-identity   # tsx scripts/migrate-series-identity.ts
```

Solo hace falta en una base que ya tenga Series ingeridas con el `externalId` viejo (el slug completo, con sufijo `-YYYYMMDD-HHMMSSmmm`). Deja el slug sin sufijo como identidad y fusiona los duplicados que ese sufijo produjo, conservando la fila más reciente (`updatedAt`), que es la que la última pasada refrescó.

- Una Serie con Seguimiento, Progreso, Colección o Comentario **no se borra**: la cascada se llevaría esos datos. Se omite con log (`merge-skipped`) para revisión humana y el proceso sale 1.
- Toma el mismo advisory lock que el backfill: no puede correr a la vez que él (`lock-busy` → exit 1).
- Es idempotente: reejecutarla devuelve `renamed=0 merged=0 skipped=0`.
- Logs JSON a stdout: `identity-renamed`, `series-merged`, `merge-skipped`, `rename-skipped`, `done`, `fatal`.

Una base nueva no la necesita: el adapter ya expone la identidad estable desde la primera ingesta.

### Unidades systemd

> **Antes de activar el timer (#21):** la base tiene que estar migrada a la identidad estable con `npm run catalog:migrate-identity`. El slug que expone Olympus lleva un sufijo `-YYYYMMDD-HHMMSSmmm` que el mirror regenera a diario; con ese sufijo en `SeriesSource.externalId`, cada pasada creaba Series duplicadas (medido el 2026-11-24: 973 filas para 896 Series del catálogo). El adapter ya expone el slug sin sufijo como identidad y resuelve el vivo desde el catálogo cacheado, así que con la base migrada el timer es seguro.

```ini
# /etc/systemd/system/manhwa-catalog.service
[Unit]
Description=Manhwa catalog daily refresh
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/srv/manhwa
ExecStart=/usr/bin/npm run catalog:backfill
Environment=SOURCE_ADAPTER=olympus
```

```ini
# /etc/systemd/system/manhwa-catalog.timer
[Unit]
Description=Run Manhwa catalog refresh daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=15min
Persistent=true
Unit=manhwa-catalog.service

[Install]
WantedBy=timers.target
```

`Persistent=true` recupera la pasada perdida si el VPS estaba apagado a la hora programada. No hay scheduler dentro de la app.

### Ejecución registrada (#21)

Migración de identidad sobre la base de desarrollo, 2026-11-24 (UTC):

```
{"event":"done","renamed":204,"merged":77,"skipped":0}
```

Reejecutada en el mismo run: `{"event":"done","renamed":0,"merged":0,"skipped":0}` — idempotente.

Backfill contra Olympus sobre `3e42838`, 2026-11-24T19:45Z: **exit 0**, `done{pages:60,processed:896,failed:0}`. Sin `catalog-retry`, `catalog-failed`, `series-failed`, `chapter-skipped`, `chapter-duplicate` ni `fatal`.

Estado de la base tras esa corrida:

| Métrica | Valor |
|---|---|
| Series / vínculos de Olympus | 896 / 896 (el catálogo vivo trae 896) |
| Vínculos con sufijo de fecha | 0 |
| Slugs internos duplicados | 0 |
| Series sin vínculo (huérfanas) | 0 |
| Capítulos | 27.028 |
| Series con Capítulos | 892 |
| `latestChapter` con fecha | 892 |
| `chaptersSyncedAt` marcado | 0 (el backfill no lo marca) |
| Advisory locks colgando | 0 |

Los huecos restantes son ausencia en la Fuente, verificados en vivo uno por uno, no fallos de ingesta:

- **4 Series sin Capítulos**: `listRecentChapters` devuelve página vacía en Olympus (`las-ensenanzas-del-rey-demonio-a-un-hombre`, `mi-simulador-de-cultivo`, `que-debo-hacer-ahora-que-la-heroina-escapo-de-su-libro`, `vida-de-cirugia`).
- **13 Series sin portada**: las 13 responden sin `coverUrl` en el detalle; 0 la exponen.
- **77 Series sin géneros**: 74 tienen sinopsis (detalle pedido); las 3 restantes responden con `genres: []` y sin sinopsis en vivo.

Una corrida anterior, antes del arreglo de identidad, dejó 973 Series para 896 del catálogo: el sufijo diario del mirror rompía `SeriesSource (sourceId, externalId)`. Ese fallo motivó `3e42838` y la migración de arriba.

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
