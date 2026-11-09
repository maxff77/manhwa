# Matching de metadata con MangaDex

**Issue:** #4 — Matching de metadata con MangaDex
**Fecha del estudio:** 2026-11-09 (snapshot; la cobertura de MangaDex cambia con el tiempo)
**Estado:** investigación completada

## Resumen ejecutivo

- **MangaDex expone todos los campos necesarios** para el matching: títulos localizados, títulos alternativos multilingües, descripción, año, estado, idioma original, idiomas traducidos, tags, demografía, links externos y relaciones de autor/artista/cover. Verificado contra el OpenAPI servido por la documentación oficial y contra respuestas reales.
- **Tasa de contraparte plausible medida: 28/50 series (56 %; IC 95 % aproximado 42–69 %)**. De ellas, 25/50 (50 %) se pueden resolver con matching exacto automatizable; las otras 3 requirieron juicio humano. La línea base de consultar solo el título español con los content ratings por defecto es 8/50 (16 %).
- **Ningún match exacto aceptado resultó falso** en la verificación manual (25/25). En cambio, aceptar automáticamente por similitud fuzzy con umbral 0,6 habría producido 2 falsos positivos de 2 candidatos en las series sin contraparte (33 y 35).
- **Estrategia recomendada:** normalización + consulta separada de cada alias + incluir `pornographic` cuando la serie sea adulta + aceptación automática **solo** de igualdad normalizada contra `title`/`altTitles`; el resto va a una cola de revisión humana con candidatos y evidencia. No auto-aceptar fuzzy.
- **Coste:** 50 consultas (pass A) tardaron **44,6 s** en secuencial con intervalo mínimo de 0,25 s (≤4 req/s); 0 respuestas 429. El pipeline completo de 50 series hizo 112 consultas en **97,1 s**. Extrapolado a las ~3.071 series de la biblioteca: ~46 min para pass A y ~100 min para el pipeline completo en secuencial. El límite de MangaDex (~5 req/s) no fue el cuello de botella: la latencia media (866 ms) dominó.

## Metodología

### Muestra

- Fuente: `https://api.manhwaweb.com/manhwa/library?page=N`.
- La biblioteca tenía **103 páginas de 30 series** (última página: 11), es decir, ~3.071 series. Verificado en páginas 1–3, 50, 100–103; el resto de páginas se asume lleno (inferencia por paginación).
- Muestra sistemática, no aleatoria: páginas **1, 26, 51, 76, 103**, primeras **10** series de cada una = **50 series**. Se eligieron páginas equiespaciadas para cubrir el catálogo.
- Para cada serie se consultó además el endpoint de detalle `https://api.manhwaweb.com/manhwa/see/{real_id}`, que devuelve `name_esp`, `name_raw`, `others_name`, `autor`, `artista`, `_sinopsis`, `_categoris`, `_tipo`, `_demografi`, `_erotico`, etc. Los 50 detalles respondieron correctamente.
- Fecha/hora UTC de la captura: `2026-11-09T12:32:22Z`.

### Consultas a MangaDex

- Endpoint: `GET https://api.mangadex.org/manga?title=<título>&limit=5&includes[]=author&includes[]=artist`, con `User-Agent` identificable y `Accept: application/json`.
- Control de tasa: intervalo mínimo de 0,25 s entre inicios de request (≤4 req/s, por debajo del límite global de ~5 req/s documentado). Sin paralelismo. **0 respuestas 429**.
- Tres pasadas:
  - **A (línea base, literal del ticket):** título español (`name_esp`), content ratings por defecto (MangaDex excluye `pornographic` salvo que se pida explícitamente).
  - **B (alias):** `name_raw` y cada entrada de `others_name`, consultados **por separado**; se detiene al encontrar igualdad exacta.
  - **C (adultos):** si `_erotico == "si"` y A/B no encontraron nada, se repite con `contentRating[]=safe&suggestive&erotica&pornographic`.
- **Revisión manual posterior:** todos los candidatos se revisaron contra `title` + `altTitles` + autores/artistas + plataforma/raw link. Se hicieron reintentos puntuales para falsos negativos (alias concatenados, variantes traducidas, búsqueda por autor).
- Criterio de "contraparte plausible": misma obra evidenciada por igualdad normalizada de título/alias, o equivalencia semántica/romanización corroborada por autor o plataforma. Los casos ambiguos se contaron como **no match**.

### Normalización usada

1. Unicode NFKC y eliminación de diacríticos (NFD + categoría `Mn`).
2. `casefold()`.
3. Reemplazo de todo carácter no alfanumérico por espacio, conservando letras Unicode (hangul, kanji, etc.).
4. Colapso de espacios.
5. Comparación de igualdad sobre el resultado.

## Campos que expone la API pública de MangaDex

Verificado contra el OpenAPI oficial ([MD-SPEC]) y una llamada real a `GET /manga/{id}` con `includes[]=author&includes[]=artist&includes[]=cover_art` ([MD-API]).

| Campo | Forma | Ejemplo real verificado |
|---|---|---|
| `id`, `type` | UUID / `"manga"` | `6a8a10f6-b56e-47b4-8a36-951bec3900f0` |
| `attributes.title` | `LocalizedString` (idioma → string) | `{"en": "My New Girlfriend Is Not Human?"}` |
| `attributes.altTitles` | array de `LocalizedString` (una clave por entrada) | `[{"es-la": "¿Mi nueva novia no es humana?"}, {"ko": "..."}, {"ja-ro": "..."}]`; 14 entradas en el ejemplo |
| `attributes.description` | `LocalizedString` | idiomas `en`, `pt-br`, `tr` en el ejemplo (no había `es`) |
| `attributes.originalLanguage` | ISO 639-1/3 | `"en"`, `"ko"`, `"ja"`, `"zh"` |
| `attributes.availableTranslatedLanguages` | array de códigos | `["da","es-la","vi","pt-br","es","fr",...]` |
| `attributes.year` | entero o null | `2024` |
| `attributes.status` | `ongoing` / `completed` / `hiatus` / `cancelled` | `"ongoing"` |
| `attributes.contentRating` | `safe` / `suggestive` / `erotica` / `pornographic` | `"suggestive"` |
| `attributes.publicationDemographic` | `shounen` / `shoujo` / `josei` / `seinen` / null | null en el ejemplo |
| `attributes.tags` | array de tag: `attributes.name` localizado + `group` (`genre` / `theme` / `format`) | Action, Romance, Comedy, Self-Published, Monster Girls, Web Comic… |
| `attributes.links` / `officialLinks` | objeto `clave → URL` | `al`, `ap`, `mu`, `mal`, `kt`, `raw`, `engtl`, `bw`, `bl`, etc. |
| `attributes.lastVolume`, `lastChapter`, `latestUploadedChapter` | string / UUID | — |
| `attributes.createdAt`, `updatedAt`, `version`, `state`, `isLocked`, `chapterNumbersResetOnNewVolume` | varios | — |
| `relationships` | array de `{id, type, attributes}` | `author`, `artist`, `cover_art`, `manga`, `creator` (vistos en la respuesta real) |
| Autor/artista | vía `includes[]=author` / `includes[]=artist`; `attributes.name` | `"NeitheYAGI"` (mismo id como author y artist) |

Notas:

- `altTitles` es multilingüe y es la pieza clave para el matching: en la muestra aparecieron alias en español, inglés, coreano, japonés, chino, etc.
- `description` puede no existir en español aunque `availableTranslatedLanguages` incluya `es`. No es fiable como señal de matching.
- Los tags vienen con nombre localizado; en las respuestas observadas solo se rellenó `en`.
- La metadata de capítulos (idioma del capítulo, grupo, etc.) está en endpoints aparte; no se investigó aquí.
- Los `links` externos (`al` AniList, `mal` MyAnimeList, `ap` Anime-Planet, `mu` MangaUpdates, `kt` Kitsu) permiten un matching por ID **si** la otra fuente los expone. En el detalle de manhwaweb observado no aparecen IDs equivalentes de AniList/MAL; no se localizó un campo de links externos, así que no se usaron.

## Comportamiento del parámetro `title` (verificado empíricamente)

1. **Busca en `title` y en `altTitles`, en cualquier idioma.** Consultas con el alias español (`"Conocí al protagonista masculino en una celda"`), sin tilde (`"Conoci..."`) y con el título coreano devolvieron la misma obra con título primario en inglés.
2. **Es insensible a mayúsculas y tildes.**
3. **Los tokens se combinan con AND dentro de un mismo título localizado.** Prueba controlada con una obra cuyo alias de manhwaweb concatenaba dos títulos distintos:
   - `title=Kinpatsu Ojousama to Shimoneta Danshi, The Golden Girls & Shimoneta Boy` → `total=0`
   - `title=Kinpatsu Ojousama to Shimoneta Danshi` → `total=1`
   - `title=The Golden Girls & Shimoneta Boy` → `total=2` (incluye la misma obra)
   Esto es una **inferencia** a partir del comportamiento; no está documentado.
4. **`contentRating` por defecto = `[safe, suggestive, erotica]`; `pornographic` queda excluido.** Para manhwaweb, con series adultas, hay que pasar explícitamente los cuatro valores. Esto rescató 5 de los 28 matches.
5. **`limit`** máximo 100 (default 10); `offset + limit ≤ 10.000` en colecciones. `order` admite `relevance`. En 4 pruebas comparativas, `order[relevance]=desc` no hizo aparecer ninguna correspondencia que no estuviera ya; en una de ellas cambió el top-5 pero siguió sin incluir la obra correcta. El spec declara `latestUploadedChapter: desc` como default, aunque con `title` los resultados observados parecían ordenados por relevancia. **Comportamiento observado, no documentado.**
6. **No hay búsqueda batch por título.** El único batch es `ids[]` (hasta 100 UUIDs). No sirve para descubrir correspondencias desde títulos.

## Resultados de la muestra

### Tasa de contraparte plausible

| Etapa | Matches | Tasa | IC 95 % aprox. (Wilson) |
|---|---:|---:|---|
| A. Solo título español, ratings por defecto | 8/50 | 16 % | 8–29 % |
| A + alias exactos (ratings por defecto) | 19/50 | 38 % | — |
| + `pornographic` para adultos | 23/50 | 46 % | 33–60 % |
| + alias compuestos partidos (split) | 25/50 | 50 % | 37–63 % |
| + revisión/asistencia humana | **28/50** | **56 %** | **42–69 %** |

- **Precisión de los matches exactos:** 25/25 verificados manualmente como plausibles (0 falsos positivos exactos en esta muestra). No es una precisión contra ground truth independiente: la verificación se hizo con título/alias + autor/plataforma.
- **Duplicados:** las entradas 24 y 25 son dos registros distintos de manhwaweb para la misma obra; ambas mapean al mismo UUID de MangaDex. Por obra única: **27/49 = 55 %**.
- **Adultos vs. no adultos:** 8/14 (57 %) vs. 20/36 (56 %). La cobertura es similar, pero en adultos el `contentRating` por defecto elimina una parte importante del catálogo.
- **Ranking:** de los 25 matches exactos, 24 estaban en la posición 1 y 1 en la posición 3 (The Third Party). Hay que escanear los 5 resultados, no solo el top-1.
- **Fuzzy:** en las 22 series sin contraparte, solo 2 superaron similitud 0,6 (`El precio de quedarse` 0,70 y `El padre rey demonio y su hija heroína` 0,69), y ambas eran obras distintas. Un umbral de 0,6 auto-aceptado habría dado 2/2 falsos positivos.
- **Búsqueda por autor:** se probaron 9 autores de series sin match (Kkamdol, 착한생각, Nikumaru, Haeinsul, 제임스, Park Seong-hyun, Geulmangjaengi, Mao bunny, Willy). **Ninguno rescató una serie.** La búsqueda por autor sirve para verificar, no para descubrir. Además requiere 2 requests por serie (resolver autor + consultar manga) y los nombres romanizados no coinciden de forma fiable.
- **Señales de verificación que sí funcionaron:** coincidencia de autores/artistas (NeitheYAGI, Motgini = 맛기니, Enjelicious, Nagawa Hiiro, Noise, An Gyeong-al = angyungal, Tajima Elloh = Tajima L-O) y coincidencia de plataforma/raw (lezhin, toptoon, naver, kakao). No son obligatorias: hay registros de manhwaweb con autores ausentes o incorrectos.

### Tiempos y límite de tasa

Medición real (secuencial, 0,25 s de intervalo mínimo):

| Métrica | Valor |
|---|---:|
| Consultas pass A (50 series) | 50 |
| Tiempo pass A | 44,64 s |
| Consultas totales (A+B+C) | 112 |
| Tiempo total del pipeline | 97,08 s |
| Latencia media | 866 ms |
| Latencia máxima | 1.436 ms |
| Respuestas 429 | 0 |
| Throughput efectivo | ~1,1 req/s |

- El límite documentado es **~5 req/s por IP** ([MD-LIMITS]); el throughput medido quedó muy por debajo porque la latencia (~0,87 s) domina. El suelo teórico a 5 req/s sería 10 s para 50 consultas y 22 s para 112; no es alcanzable en secuencial desde esta red.
- **Extrapolación aritmética** a las ~3.071 series: pass A ≈ 46 min; pipeline completo (2,24 requests/serie ≈ 6.880 requests) ≈ 100 min. Son cálculos, no una medición de la biblioteca completa.
- **Concurrencia:** con 3 workers a ~0,87 s/request se obtendrían ~3,4 req/s, todavía por debajo de 5; el pipeline completo bajaría a ~34 min. Con 4 workers, ~4,5 req/s y ~25 min. **Inferencia no medida**; MangaDex advierte que los patrones abusivos pueden provocar throttling o bloqueo, así que recomiendo 2–3 workers con backoff exponencial y caché.

## Ejemplos

### Aciertos

1. **#1 `¿Mi Nueva Novia no es Humana?` → `My New Girlfriend Is Not Human?`**
   - MangaDex: `6a8a10f6-b56e-47b4-8a36-951bec3900f0`.
   - Evidencia: `altTitles` incluye exactamente `{"es-la": "¿Mi nueva novia no es humana?"}`; el autor `NeitheYAGI` coincide en ambos lados. Match en la primera consulta, posición 1.

2. **#24 `La señorita rubia y el chico de los chistes verdes` → `Kinpatsu Ojousama to Shimoneta Danshi`**
   - MangaDex: `ab7ddc35-b6de-4b23-ae14-3256abde910f`.
   - Evidencia: el `others_name` de manhwaweb era una concatenación (`"Kinpatsu Ojousama to Shimoneta Danshi, The Golden Girls & Shimoneta Boy"`); consultarla entera devolvió 0. Al partirla por la coma, el título japonés devolvió 1 resultado exacto. Autor: `Tajima Elloh` en MangaDex vs. `Tajima L-O` en manhwaweb (misma persona, romanización distinta).

3. **#26 `La señora de la casa fue mi profesora` → `My Madam was my Teacher`**
   - MangaDex: `80c1d26b-a384-4785-aa06-aabba33fd29d`.
   - Evidencia: `altTitles` incluye exactamente el título español. Es adulta (`contentRating: pornographic`), por lo que **solo apareció al incluir `pornographic`**; con los ratings por defecto la consulta no la devolvía. Raw: Toomics.

### Fallos

1. **#5 `¿La Tarea es una Inspeccion de Agujeros...?`**
   - Nombres probados: `"What A Hole Inspection Is Homework"` y `"구멍 검사가 과제라니요"`.
   - Resultado: 0 resultados en ambos casos, incluso incluyendo `pornographic`. No hay contraparte localizable (o no está indexada en MangaDex).

2. **#21 `La venganza de la ingeniera mágica`**
   - Resultado: la consulta principal devolvió `Mahou Shoujo Madoka☆Magica: Homura Revenge!` (similitud 0,41) y la variante inglesa devolvió `The Revenge of the Abandoned Daughter of a Prestigious Magic Family` (0,46). Ninguna es la obra. Ilustra que el top-5 puede ser ruido y que hay que exigir igualdad exacta.

3. **#33 `El precio de quedarse`**
   - Resultado: `An Exorbitant Wife` (alias español `El Precio De La Esposa`; similitud 0,70).
   - Es una obra distinta (título y premisa no coinciden). Si se auto-aceptara por fuzzy con umbral 0,6, sería un falso positivo. Se clasificó como **sin match**.
   - Caso ambiguo adicional: #35 `El padre rey demonio y su hija heroína` vs. `The Adventures of a Demon King's Daughter` (alias español `Renací como la hija del rey demonio`; similitud 0,69). Título y premisa difieren; contado como no match, pero podría ser un match con metadata deficiente.

## Estrategia recomendada

### Pipeline propuesto

1. **Obtener la serie** de `library` y su detalle (`/manhwa/see/{real_id}`) para tener `name_esp`, `name_raw`, `others_name`, `autor`, `artista`, `_erotico`, `_plataforma`.
2. **Construir variantes de título**:
   - `name_esp` como consulta principal.
   - `name_raw` y **cada** entrada de `others_name`.
   - Partir cada string por `,`, `;`, `|`, `" / "` y `" - "` (solo con espacios alrededor); descartar fragmentos de menos de ~3 caracteres y duplicados normalizados.
   - Limitar a ~5 variantes por serie para acotar coste.
3. **Normalizar** según la sección de metodología antes de comparar.
4. **Consultar MangaDex** para cada variante, en secuencia o con 2–3 workers:
   - `GET /manga?title=<variante>&limit=5`
   - `includes[]=author` y `includes[]=artist` solo si se quieren señales de verificación; para el matching puro se pueden omitir y resolver los matches aceptados en batch con `ids[]` (más barato en bytes; no medido de forma controlada).
   - Si `_erotico == "si"`: `contentRating[]=safe&suggestive&erotica&pornographic`. Si no, omitir y usar el default.
   - Parar la serie en cuanto haya igualdad exacta normalizada contra `title` o cualquier `altTitles`.
5. **Aceptar automáticamente solo igualdad normalizada.** Medido: 25/25 correctos. Si dos resultados distintos empatan en igualdad exacta, marcar para revisión (no observado en la muestra, pero es una salvaguarda).
6. **Verificar** cada match aceptado con señales baratas: solapamiento de autor/artista (tolerando romanización), dominio del `raw`/`engtl` contra `_plataforma`, año y `contentRating`. No exigirlas como condición: la metadata de manhwaweb es irregular.
7. **Cola de revisión humana** para los no exactos:
   - Mostrar top 3 candidatos por variante, con similitud, autores, año, plataforma y content rating.
   - La similitud (SequenceMatcher o Jaccard de tokens) se usa **solo para ordenar**, nunca para aceptar. Umbral 0,6 produjo 2/2 falsos positivos en esta muestra.
   - El revisor confirma o rechaza. Los 3 matches "asistidos" de la muestra (Ryokan, God-Level Fisherman, Norozaki) son ejemplos de este flujo: requirieron romanización o traducción que las variantes automáticas no contenían.
8. **Persistir el mapeo** `real_id` de manhwaweb → UUID de MangaDex, variante que coincidió, confianza, fecha y revisor. Reutilizarlo; solo consultar series nuevas o no resueltas. Revalidar periódicamente como precaución ante entradas eliminadas o fusionadas en MangaDex (no verificado en este estudio).
9. **No usar la búsqueda por autor como descubrimiento primario:** 9 pruebas, 0 rescates. Solo como evidencia en la cola de revisión.

### Por qué esta estrategia

- La igualdad exacta sobre `title` + `altTitles` tiene **precisión perfecta en la muestra** (25/25) y cubre la mitad del catálogo (50 %).
- El título español solo cubre el 16 %; la mayor parte del valor está en los alias y en no excluir `pornographic`.
- El fuzzy auto-aceptado es peligroso: los dos candidatos con similitud ≥0,6 eran obras distintas. La verificación humana es barata si solo se aplica al ~44 % restante y hay evidencia estructurada.
- El coste es asumible: una pasada de backfill de ~3.071 series con el pipeline completo son ~6.900 requests, ~100 min secuenciales o ~25–35 min con concurrencia moderada. Después, solo series nuevas.

### Estimación de cobertura esperada

Si la tasa muestral se mantiene: ~50 % de matches exactos automáticos (IC 95 % 37–63 %) y ~56 % tras revisión asistida (IC 95 % 42–69 %). Para ~3.071 series: ~1.530 matches automáticos y ~1.720 tras revisión. **Extrapolación**, no medición de la biblioteca completa.

## Restricciones de uso de MangaDex

De la documentación oficial ([MD-DOCS], [MD-LIMITS]):

- El proyecto **debe acreditar a MangaDex**; si se muestran capítulos, también a los grupos de scanlation; **no se permiten anuncios ni servicios de pago** sobre la API; hay que atender las solicitudes de retirada de los grupos.
- **User-Agent obligatorio y no falsificado**; no se admite cabecera `Via`.
- **No hay CORS para sitios de terceros**: las llamadas deben hacerse desde backend/proxy del proyecto, no desde el navegador.
- **Las imágenes no se pueden hotlinkear**: hay que proxearlas.
- Límite global ~5 req/s por IP; al superarlo, 429, y si se insiste, 403/bloqueo temporal. No se reprodujo el 429 en este estudio (0 casos), así que el comportamiento exacto de escalado es **documentado pero no verificado empíricamente aquí**.
- `offset + limit ≤ 10.000` en endpoints de colección.

## Limitaciones y afirmaciones no verificadas

- La muestra es **sistemática, no aleatoria** (50 de ~3.071; páginas equiespaciadas). Los intervalos de confianza son aproximados y no corrigen clustering ni cambios temporales.
- La verificación manual no es ground truth independiente; se basó en título/alias + autor/plataforma. Hay metadata deficiente en manhwaweb: autores ausentes o distintos, y dos registros duplicados de la misma obra (24/25).
- **La cobertura de MangaDex cambia**: el estudio es un snapshot de 2026-11-09.
- La semántica de `title` (AND entre tokens dentro de un mismo título localizado, insensibilidad a tildes) se **infirió** de pruebas controladas; no está documentada.
- El orden por defecto con `title` pareció relevante en 4 pruebas, pero el spec declara `latestUploadedChapter: desc`. No se confirmó el mecanismo.
- No se reprodujo la respuesta 429 ni el escalado a 403; solo se cita la documentación.
- La API de manhwaweb **no tiene documentación pública encontrada**; los endpoints y campos son observados y pueden cambiar. No se midió su rate limit; se mantuvo ≤5 req/s por prudencia.
- No se reintentó con `pornographic` en series marcadas `_erotico == "no"`; si esa marca es incorrecta, puede haber falsos negativos adicionales.
- Las extrapolaciones de tiempo y los cálculos de concurrencia son aritmética sobre la muestra, no mediciones de la biblioteca completa.
- No se investigó la disponibilidad de capítulos/traducciones por idioma (solo `availableTranslatedLanguages` a nivel de manga).

## Apéndice: muestra completa (50 series)

| # | Serie (manhwaweb) | Resultado | MangaDex / candidato | Método |
|---:|---|---|---|---|
| 1 | ¿Mi Nueva Novia no es Humana? | match | `6a8a10f6-b56e-47b4-8a36-951bec3900f0` — My New Girlfriend Is Not Human? | Título ES exacto |
| 2 | ¿Le gustaria ir conmigo al Ryokan? | match | `9e39c29f-ef9e-467a-a9d1-950f6a874a2a` — Shall We Go To The Ryokan Together? | Adulto (manual) |
| 3 | ¿La vida también acepta donaciones? | sin match | Sin resultados (KO/EN); autor no está en MD | — |
| 4 | ¿La cuenta secundaria de mi hermana? | sin match | Sin resultados (KO); autor no está en MD | — |
| 5 | ¿La Tarea es una Inspeccion de Agujeros...? | sin match | Sin resultados (EN/KO), incluso incluyendo pornográfico | — |
| 6 | ¿Infidelidad Oficial? | sin match | Sin resultados; catálogo de Nikumaru no la contiene | — |
| 7 | ¿Hacemos un contrato? | match | `3566cc4c-c542-4e13-85d4-6a5a37bcef7e` — Would You Like to Sign the Contract? | Alias exacto |
| 8 | ¿Estudiamos en Noryangjin? | match | `779a8499-76eb-4dba-8e50-61f768e84488` — Should I Study at Noryangjin? | Adulto (+pornográfico) |
| 9 | ¿Estas viendo eso? | match | `18ae8269-b441-4692-a9bc-9e0a49750677` — You Watch Stuff Like That? | Adulto (+pornográfico) |
| 10 | ¿Es malo que el personaje principal sea un roleplayer? | sin match | Sin resultados (EN/KO); autor no está en MD | — |
| 11 | Renge to Naruto! | match | `275c3ee8-bdeb-4070-a333-6add23a8415a` — Renge to Naruto! | Título ES exacto |
| 12 | Renazco y Conquisto Bellezas en el Viaje al Oeste | sin match | Sin resultados (ZH/EN) | — |
| 13 | Renazco y Conquisto Bellezas En El Pasado | match | `454e3b5b-3c71-4329-a39a-5211347f9e86` — Chóngshēng Shuǐhǔ Shìjiè zhī Zuìqiáng Wǔ Dàláng | Alias exacto |
| 14 | Renacimiento en el apocalipsis: Alcanzando la cima abriendo cajas | sin match | Sin resultados (KO); autor no está en MD | — |
| 15 | Renacimiento del Emperador en el Mundo Inverso | sin match | Sin alias; sin resultados | — |
| 16 | Renacimiento del Dios Supremo de la Guerra | sin match | Sin coincidencia exacta (EN/ZH) | — |
| 17 | Renacimiento Sexual | sin match | Sin alias; sin resultados (incl. pornográfico) | — |
| 18 | Renacido como el Estratega del Hermano de mi Enemigo | sin match | Sin alias; sin resultados | — |
| 19 | Renacido En El Campo De Batalla Demoniaco | match | `26b2c6bc-f2f0-40a5-b6ec-b0ce31f88575` — Demonic Frontline: The 13th Flying Dragon Company | Alias exacto |
| 20 | Renacido Como Un Monstruo: El Auge Del Dios Bestia | sin match | Sin alias; sin resultados | — |
| 21 | La venganza de la ingeniera mágica | sin match | Solo resultado irrelevante (Madoka Magica) | — |
| 22 | La ultima especie | sin match | Sin resultados (incl. pornográfico) | — |
| 23 | La tercera fiesta | match | `930f985b-b254-4bac-9e95-a4c357e44f32` — The Third Party | Alias exacto |
| 24 | La señorita rubia y el chico de los chistes verdes | match | `ab7ddc35-b6de-4b23-ae14-3256abde910f` — Kinpatsu Ojousama to Shimoneta Danshi | Alias partido |
| 25 | La señorita rubia y el chico de los chistes verdes | match | `ab7ddc35-b6de-4b23-ae14-3256abde910f` — Kinpatsu Ojousama to Shimoneta Danshi | Alias partido |
| 26 | La señora de la casa fue mi profesora | match | `80c1d26b-a384-4785-aa06-aabba33fd29d` — My Madam was my Teacher | Adulto (+pornográfico) |
| 27 | La serpiente Negra | match | `39965fe5-08dc-4f10-84eb-4755c1d1f542` — Heuksa | Alias exacto |
| 28 | La semilla de la reina | match | `5154912e-5a83-4e80-b86e-9ad12e727417` — Queen's Seed | Alias exacto |
| 29 | La salvación de la mujer fatal | match | `67e79cef-5367-4977-bbbe-e47925cbc855` — Femme Fatale no Kyuusai | Alias exacto |
| 30 | La resurrecion del vacio | sin match | Sin alias; solo resultados irrelevantes | — |
| 31 | El principe abandonado atiende a una soldado enemiga en primera linea… | match | `f922e6e5-4f40-4f35-b0c0-44aaa00e8095` — Suterare Ouji ga Saizensen de ... Dainana Oujo datta Ken | Alias exacto |
| 32 | El principe Sun quiere ser una Esposa | match | `b7ebc129-8729-4121-9f11-c3260d3d97ed` — Sun-ouji wa Tsuma ni Naritai | Título ES exacto |
| 33 | El precio de quedarse | sin match | Solo 'An Exorbitant Wife' (ES: 'El Precio De La Esposa'); distinto | — |
| 34 | El pescador divino | match | `5ce8500e-acf4-406d-ab37-fe605b044a78` — God-Level Fisherman | Asistido |
| 35 | El padre rey demonio y su hija heroina | sin match | Cerca: 'The Adventures of a Demon King's Daughter'; título/premisa distintos (ambiguo) | — |
| 36 | El observador | sin match | Solo 'Senshun Kansoku'; obra distinta | — |
| 37 | El nigromante inigualable | sin match | Sin alias; sin resultados | — |
| 38 | El mundo paralelo con una relacion de hombres y mujeres de 1:39… | match | `547b5366-e71a-400d-b48e-7d4447ac1cf3` — Danjo-hi 1:39 no Heikou Sekai wa Omoi no Hoka Futsuu | Título ES exacto |
| 39 | El mundo bajo su sombra | sin match | Sin alias; sin resultados | — |
| 40 | El metodo de inversion con fecha de caducidad de un genio de Wall Street | sin match | Sin resultados (KO); autor solo tiene 'Coin Revenge' en MD | — |
| 41 | ¡No Me Maldigas, Norozaki-san! | match | `d821b5b0-1fdb-4bac-b700-f1fa6aa84410` — Norowanaide! Noroizaki-san! | Asistido |
| 42 | ¡Jefe! ¡Dame a tu hija! | match | `7623c704-e420-4b3c-a6b6-dd95f275a326` — Boss! Give Me Your Daughter! | Adulto (+pornográfico) |
| 43 | Reencarnación del Rey del Puño | match | `965fd49c-8f8a-49b6-a626-31590e325404` — Gwonwang Hwansaeng | Título ES exacto |
| 44 | No se si es amor, pero… | match | `4242c6d3-4ee4-4b0b-9ca0-23bd57952805` — Koi to Yobu ni wa Sasayaka desu ga | Alias exacto |
| 45 | NICOTINEKO | match | `6ad54367-4165-43ed-9a7d-71179c520180` — Yani Neko | Alias exacto |
| 46 | Miss Angel and Miss Devil | match | `34f043ef-a423-422a-8e26-a54720645ee5` — Miss Angel and Miss Devil | Título ES exacto |
| 47 | Me volvi enemigo de todo el servidor por ser demasiado descuidado | match | `e3303f89-7380-4814-abf9-b2da9a8da88e` — Wangyou: Yinwei Tai Lang, Wo Chengle Quan Fu Gongdi! | Título ES exacto |
| 48 | La Guia De Rankers Para Vivir Una Vida Ordinaria | match | `de3745b8-4a77-4f2c-8929-68395360793f` — Raengkoreul Wihan Bareun Saenghwal Annaeso | Título ES exacto |
| 49 | Japon invocada | match | `ef473f14-8c4d-435e-9015-b714512e69eb` — Nihonkoku Shoukan | Alias exacto |
| 50 | Inicio de sesion, en el infierno | sin match | Sin resultados (EN) | — |

Notas de confianza sobre la tabla:

- **#13, confianza media:** el alias inglés coincide exactamente, pero el autor de manhwaweb (`Elders`) no aparece entre los autores de MangaDex (`Meow Meow Anime`, `Meow Culture`).
- **#41, confianza media:** romanización distinta (`Norozaki` vs. `Noroizaki`); no hay autor en manhwaweb para corroborar.
- **#8:** el autor de MangaDex (`Nuwaru`) no coincide con el de manhwaweb (`청냥`), pero el título coreano alternativo es exacto y la plataforma (`toptoon`) coincide.
- **#26:** manhwaweb lo marca como `manhwas.net` y MangaDex tiene raw de Toomics; el título español alternativo es exacto.
- **#2:** corroborado por autor (`Motgini` = `맛기니`) y por el raw de Lezhin.

## Fuentes

- **[MD-DOCS]** MangaDex API documentation — índice y Acceptable Usage Policy: <https://api.mangadex.org/docs/> (consultado 2026-11-09).
- **[MD-LIMITS]** MangaDex API — Limitations and Requirements (rate limit global ~5 req/s por IP, 429/403, User-Agent, CORS, imágenes): <https://api.mangadex.org/docs/2-limitations/> (consultado 2026-11-09).
- **[MD-SPEC]** OpenAPI de MangaDex servido por la documentación: <https://api.mangadex.org/docs/static/api.yaml> (descargado 2026-11-09). Path `GET /manga` (parámetros `title`, `limit`, `contentRating[]`, `order`, `includes[]`), schemas `Manga`, `MangaAttributes`, `LocalizedString`, `Relationship`, `ReferenceExpansionManga`.
- **[MD-API]** Llamadas reales a la API pública, 2026-11-09: `https://api.mangadex.org/manga?title=...&limit=5&includes[]=author&includes[]=artist` y `https://api.mangadex.org/manga/{uuid}?includes[]=author&includes[]=artist&includes[]=cover_art`; también `https://api.mangadex.org/author?name=...`.
- **[MW-API]** API no documentada de manhwaweb, observada 2026-11-09: `https://api.manhwaweb.com/manhwa/library?page=N` (30 por página, `data` + `next`, 103 páginas) y `https://api.manhwaweb.com/manhwa/see/{real_id}` (detalle con `name_raw`, `others_name`, `autor`, `artista`, `_sinopsis`, `_categoris`).
