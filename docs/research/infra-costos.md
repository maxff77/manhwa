# Costos y viabilidad de la infraestructura

**Ticket:** #3 — Costos y viabilidad de la infraestructura
**Fecha de consulta de precios:** 2026-11-09
**Monedas:** Hetzner publica en EUR sin IVA; Cloudflare/R2 en USD. Conversión usada: **1 EUR = 1,1165 USD**, tasa de referencia del BCE del **2026-11-06** [S17].

## Veredicto

**VIABLE.** El diseño de caché on-demand es viable hasta **al menos 10.000 lectores concurrentes**, el máximo pedido en este ticket. El costo mensual estimado es:

| Lectores concurrentes | Total con planes CX | Total con planes CPX (fallback) |
|---:|---:|---:|
| 100 | ~$11 | ~$24 |
| 1.000 | ~$46 | ~$80 |
| 10.000 | ~$274–331 | ~$365–422 |

El **egress es $0 en todos los escenarios**: R2 no cobra egress [S7] y Cloudflare no publica tarifa por ancho de banda ni por request en Free/Pro [S10]. El componente dominante es el **cómputo** a 100 y 1.000 lectores; a 10.000, **storage y cómputo quedan empatados** (~$105–140 de storage frente a ~$107–199 de cómputo). Storage es el único rubro que puede crecer sin control si falla la deduplicación o la eviction; con dedupe por capítulo está acotado por el catálogo completo (7 TB → ~$105/mes). Egress nunca domina.

---

## 1. Supuestos del modelo

No hay tráfico real medido todavía. Estos supuestos son de planificación y están marcados como tales:

| Supuesto | Valor | Justificación / estado |
|---|---:|---|
| Lectores concurrentes `C` | 100 / 1.000 / 10.000 | Pico simultáneo, según el ticket. |
| DAU / pico | 5× | Supuesto de planificación: el pico horario sería ~20% del DAU. **No medido.** Si el ratio real es 10×, duplicar vistas, storage y operaciones. |
| Capítulos por lector y día | 5 | Consumo típico de webtoon (lectura por capítulos). **Supuesto.** |
| Días por mes | 30 | Convención. |
| Tamaño por capítulo | 25 MB | Dato del ticket. |
| Imágenes por capítulo | 50 | Derivado: ~500 KB por imagen. **Supuesto**; con 100 imágenes/capítulo, Class A se duplica. |
| **Tasa de conversión lectura→caché `m`** | **5%** | Fracción de vistas de capítulo que producen un fetch nuevo al origen y una escritura en R2. Ver justificación abajo. Sensibilidad a 2% y 10%. |
| Hit ratio del CDN | 95% | Imágenes inmutables, URLs únicas y TTL largo. **Supuesto**; sensibilidad a 0% abajo. |
| Régimen de storage | TTL/LRU 30 días | Se guarda ~un mes de escrituras; tope físico = catálogo completo (7 TB, según el mapa #1). |
| Cómputo | Sizing asumido | 1× CX33 (100), 1× CX43 + 1× CX33 (1.000), 4× CX43 + 1× CX53 (10.000). **Sin benchmark: UNVERIFIED.** Sin load balancer (precio no verificado en fuente primaria). |
| Free tier R2 | 10 GB-mes, 1M Class A, 10M Class B | Solo Standard [S7]. |
| Impuestos | Precios sin IVA | Hetzner: “excl. VAT” [S1][S2]. Cloudflare: precios de lista en USD [S10]. |

### Justificación de la tasa de conversión (5%)

`m` es la fracción de lecturas que **no** estaban en caché y, por tanto, se descargan de la fuente y se escriben en R2. 5% equivale a que cada capítulo cacheado sirva ~20 lecturas antes de ser evictado.

- Los capítulos son **inmutables** y se deduplican por capítulo: un mismo capítulo se cachea una sola vez aunque lo lean miles de personas.
- La audiencia se concentra en un *hot set* de series; el resto del catálogo se llena lentamente.
- A 100 concurrentes implica **93,75 GB nuevos/mes**, coherente con la afirmación del mapa de que “el v1 real ocupa decenas de GB”.
- A 10.000 concurrentes implica 9,375 TB nuevos/mes, **más que el catálogo completo de 7 TB**, lo cual es imposible. Por eso el modelo se acota al catálogo: el número real de capítulos únicos está limitado por el contenido existente. Es decir, 5% es conservador (cota superior) a gran escala.

La tasa real debe medirse con telemetría de cache miss; ver sensibilidad en la sección 5.

---

## 2. Precios verificados

### 2.1 Hetzner Cloud (VPS)

Fuente: páginas oficiales de Hetzner Cloud, consultadas el **2026-11-09** [S1][S2]. Precios en **EUR, sin IVA**. La página de planes indica “Price incl. IPv4”; la documentación de Primary IPs lista la IPv4 a €0,50/$0,60/mes por separado [S6] — discrepancia menor que se anota abajo.

Línea **CX / CAX (Cost-Optimized)**, EU, 20 TB de tráfico incluido:

| Plan | vCPU | RAM | Disco NVMe | Precio mensual | Precio/hora |
|---|---:|---:|---:|---:|---:|
| CX23 | 2 | 4 GB | 40 GB | €5,99 | €0,0096 |
| CAX11 (Arm) | 2 | 4 GB | 40 GB | €6,49 | €0,0104 |
| CX33 | 4 | 8 GB | 80 GB | €8,99 | €0,0144 |
| CAX21 (Arm) | 4 | 8 GB | 80 GB | €10,99 | €0,0176 |
| CX43 | 8 | 16 GB | 160 GB | €16,49 | €0,0264 |
| CAX31 (Arm) | 8 | 16 GB | 160 GB | €21,49 | €0,0344 |
| CX53 | 16 | 32 GB | 320 GB | €29,99 | €0,0481 |
| CAX41 (Arm) | 16 | 32 GB | 320 GB | €41,49 | €0,0665 |

**Aviso de disponibilidad:** al momento de la consulta, la línea Cost-Optimized figuraba como **“Currently not available”** en la página principal [S3] y los 8 planes aparecían marcados como no disponibles [S1]. Los precios son los publicados, pero la compra puede requerir esperar stock o usar CPX.

Línea **CPX (Regular Performance)**, EU/Singapur:

| Plan | vCPU | RAM | Disco NVMe | Tráfico EU / SG | Precio mensual EU / SG |
|---|---:|---:|---:|---|---:|
| CPX02 | 1 | 1 GB | 20 GB | 20 TB / 0,5 TB | €6,49 / €7,99 |
| CPX12 | 1 | 2 GB | 40 GB | 20 TB / 0,5 TB | €11,99 / €15,99 |
| CPX22 | 2 | 4 GB | 80 GB | 20 TB / 1 TB | €19,99 / €26,99 |
| CPX32 | 4 | 8 GB | 160 GB | 20 TB / 2 TB | €35,99 / €49,49 |
| CPX42 | 8 | 16 GB | 320 GB | 20 TB / 3 TB | €69,99 / €93,99 |
| CPX52 | 12 | 24 GB | 480 GB | 20 TB / 4 TB | €100,99 / €134,99 |
| CPX62 | 16 | 32 GB | 640 GB | 20 TB / 5 TB | €130,49 / €172,49 |

CPX en **US** (HIL1/ASH1), con tráfico incluido menor: CPX11 2/2/40 GB, 1 TB, €17,99; CPX21 3/4/80 GB, 2 TB, €32,49; CPX31 4/8/160 GB, 3 TB, €62,99; CPX41 8/16/240 GB, 4 TB, €120,99; CPX51 16/32/360 GB, 5 TB, €238,49.

**Facturación y tráfico:**
- Precio mensual es un **tope**: si se borra el servidor antes de fin de mes, se paga solo la tarifa horaria; el tope nunca se supera [S1].
- Tráfico incluido: **20 TB/mes en EU** para CX, CPX y CAX; solo cuenta el tráfico **saliente**; el entrante y el interno son gratis [S4][S5].
- Exceso: **€1 ($1,20) por TB**, facturado en bloques de 100 MB, y aplica también a cloud servers y load balancers [S4][S5].
- IPv4 primaria: €0,50/$0,60/mes; IPv6 gratis [S6]. La tabla de precios dice “Price incl. IPv4” [S1]; se usa el precio publicado y se anota que podría haber +€0,50/mes si la IPv4 no estuviera incluida.

### 2.2 Cloudflare R2

Fuente: página oficial de precios de R2, consultada el **2026-11-09** [S7]. Precios en USD.

| Concepto | Standard | Infrequent Access |
|---|---:|---:|
| Storage | **$0,015 / GB-mes** | $0,01 / GB-mes |
| Class A (por millón) | **$4,50** | $9,00 |
| Class B (por millón) | **$0,36** | $0,90 |
| Data retrieval | Ninguno | $0,01 / GB |
| Egress | **Gratis** | **Gratis** |
| Duración mínima | Ninguna | 30 días |

**Free tier mensual (solo Standard):** 10 GB-mes de storage, **1 millón de Class A** y **10 millones de Class B** [S7]. No aplica a Infrequent Access.

- **Class A** = operaciones que mutan estado: `PutObject`, `CopyObject`, multipart uploads, `ListObjects`, cambios de configuración.
- **Class B** = lecturas: `GetObject`, `HeadObject`, `HeadBucket`, `UsageSummary`.
- **Deletes son gratis.** No hay mínimo de permanencia en Standard, así que la eviction agresiva es barata.
- **Egress directo desde R2 es $0**, incluso vía API S3, Workers o `r2.dev` [S7].

**Cómo se sirve al navegador:** para producción hay que conectar un **Custom Domain** al bucket; así las peticiones pasan por el caché de Cloudflare [S8][S9]. `r2.dev` está limitado, pensado para desarrollo y **no cachea** [S8][S9]. El tamaño máximo cacheable por archivo en Free/Pro/Business es **512 MB**; Enterprise 5 GB [S9][S11]. Las imágenes de un capítulo (~500 KB) quedan muy por debajo.

### 2.3 Cloudflare CDN: Free vs Pro

Fuente: comparativa oficial de planes Network & CDN, consultada el **2026-11-09** [S10].

| Plan | Precio | Límites numéricos publicados | Bandwidth / requests |
|---|---:|---|---|
| **Free** | **$0/mes** | 70 reglas + 10K Bulk Redirects; 5 schemas; <100 hostnames | CDN incluido; **sin cupo publicado** de bandwidth ni de requests |
| **Pro** | **$20/mes facturado anual** ($240/año) o **$25/mes mensual** | 225 reglas + 25K Bulk Redirects; 5 schemas | CDN incluido; **sin cupo publicado** |
| Business | $200/mes anual o $250/mes mensual | 450 reglas; SLA 100% | CDN incluido; sin cupo publicado |
| Contract/Enterprise | Custom | 2.700 reglas; SLA | Custom |

- Cloudflare **no publica** una asignación de ancho de banda ni de requests para Free/Pro en la comparativa; el CDN figura como incluido en todos los planes [S10]. No hay precio por GB ni por request documentado.
- **Tamaño máximo cacheable:** 512 MB por archivo en Free, Pro y Business; 5 GB en Enterprise [S11].
- **Términos de servicio:** el texto del Self-Serve Subscription Agreement consultado (actualizado el 2025-09-12) **no contiene** la antigua cláusula 2.8 que prohibía servir “un porcentaje desproporcionado de imágenes/audio/video” [S12]. Sí permanece la cláusula §2.2.1(b) que prohíbe crear una “undue burden” sobre el servicio; es el único riesgo de fair use, sin umbral numérico [S12].
- **Add-ons con costo variable que hay que evitar en esta arquitectura:** Argo Smart Routing ($0,10/GB), Cache Reserve (usage-based) y Load Balancing ($0,50 por 500k requests) [S10]. No son necesarios para el caso base.
- R2 + Custom Domain: el egress de R2 es $0 y el CDN de Cloudflare no cobra bandwidth, así que **la entrega de imágenes no tiene costo variable por GB** en esta arquitectura, siempre que no se activen esos add-ons [S7][S10].

### 2.4 Cupo de Cache Storage / IndexedDB en el navegador (PWA)

Cache Storage, IndexedDB y OPFS comparten el cupo del Storage API. `localStorage`/`sessionStorage` tienen un límite aparte de ~5 MiB cada uno (10 MiB en total) y no sirven para capítulos [S14].

| Navegador | Cupo por origen | Cupo total del navegador | Notas |
|---|---:|---:|---|
| Chrome / Chromium | **60% del disco total** | **80% del disco total** | Basado en el tamaño total del disco, no en espacio libre. Incógnito ~5%. [S13][S14] |
| Firefox | **menor de 10% del disco o 10 GiB** por grupo eTLD+1 (best-effort) | — | Persistente: hasta 50% del disco, tope 8 TiB, fuera del límite de grupo. [S14] |
| Safari 17+ / iOS 17+ (app de navegador) | **60% del disco** | **80% del disco** | Otras apps embebidas: 15% por origen / 20% total. Cross-origin frames: 10% del padre. [S15] |
| Safari <17 | ~1 GiB por origen, luego prompt | — | Comportamiento anterior a macOS 14/iOS 17. [S14] |

**Eviction:**
- En Chrome/Firefox, al superar cuotas o bajo presión de disco se evicta por **LRU y por origen completo** (IndexedDB y Cache Storage juntos); `navigator.storage.persist()` reduce la eviction [S14].
- **Safari/WebKit:** desde iOS/iPadOS 13.4 y Safari 13.1, ITP borra **todo el storage script-writable** (IndexedDB, Cache API, service worker) tras **7 días de uso de Safari sin interacción con el sitio** [S16]. Las web apps añadidas a la pantalla de inicio usan un contador separado y no estaban pensadas para perder datos [S16]; la política 2023 les da el cupo de app de navegador (60%/80%) [S15].

**Lectura práctica:** con 25 MB/capítulo, el límite de Firefox (10 GiB) da para **~409 capítulos** offline; Chrome/Safari permiten miles, pero dependen del disco libre. El cupo no es el limitante del servidor; el limitante real es la eviction de Safari y el espacio del usuario. Usar `navigator.storage.estimate()`, `navigator.storage.persist()` y un botón explícito de “descargar capítulo”.

---

## 3. Fórmula del costo

Con `C` = lectores concurrentes, `m` = tasa de conversión lectura→caché:

```
views_mes      = C × 5 (DAU/pico) × 5 (capítulos/día) × 30 (días) = 750 × C
cap_nuevos     = views_mes × m
GB_nuevos      = cap_nuevos × 25 MB / 1000
storage_$      = max(0, GB_almacenados − 10 GB free) × $0,015
ClassA_ops     = cap_nuevos × 50 (objetos/capítulo)
ClassA_$       = max(0, ClassA_ops − 1.000.000) / 1.000.000 × $4,50
ClassB_ops     = views_mes × 50 × (1 − hit_ratio_CDN)
ClassB_$       = max(0, ClassB_ops − 10.000.000) / 1.000.000 × $0,36
cómputo_$      = precio_EUR × 1,1165
CDN_Free_$     = $0
```

Storage en régimen estable con TTL/LRU de 30 días = un mes de escrituras. Tope físico: catálogo completo de 7 TB = 280.000 capítulos de 25 MB.

---

## 4. Resultados (caso base: `m` = 5%)

| C | Vistas/mes | Cap. nuevos/mes | GB nuevos/mes | Storage R2 | Class A | Class B | CDN Free | Cómputo CX | **Total/mes** |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 75.000 | 3.750 | 93,75 | $1,26 | $0,00 | $0,00 | $0 | $10,04 | **$11,29** |
| 1.000 | 750.000 | 37.500 | 937,5 | $13,91 | $3,94 | $0,00 | $0 | $28,45 | **$46,30** |
| 10.000 | 7.500.000 | 375.000 | 9.375 | $140,47 | $79,88 | $3,15 | $0 | $107,13 | **$330,63** |
| 10.000 (tope catálogo 7 TB) | 7.500.000 | ≤280.000 | ≤7.000 | $104,85 | $58,50 | $3,15 | $0 | $107,13 | **$273,63** |

- **Pro** añade $20/mes (anual) o $25/mes (mensual) por zona; no cambia el costo por bandwidth ni por request [S10].
- **Fallback CPX** (si CX no está disponible): 1× CPX22 → **$23,58** a 100; 1× CPX32 + 1× CPX22 → **$80,35** a 1.000; 3× CPX32 + 1× CPX42 → **$422,19** a 10.000 (naive) o **$365,19** con tope de catálogo. Sizing sin benchmark: UNVERIFIED.
- **Cómputo:** CX33 €8,99 (100); CX43 €16,49 + CX33 €8,99 (1.000); 4× CX43 + CX53 €95,95 (10.000). Sin load balancer.

**Tráfico Hetzner → R2:** las escrituras nuevas se suben desde el scraper al bucket y cuentan como salida. A 10.000 con `m`=5% son 9,375 TB/mes, por debajo de los 20 TB EU incluidos [S4]. El exceso de €1/TB empieza a ~10.700 concurrentes con `m`=10%, o a ~21.300 con `m`=5%; incluso entonces es un costo menor (€1/TB).

**Steady state con catálogo lleno:** storage $104,85 + cómputo $107,13 + Class B $3,15 ≈ **$215/mes** a 10.000, con solo capítulos nuevos entrando. El catálogo actual acota el storage.

---

## 5. Sensibilidad

### Tasa de conversión `m`

| `m` | 100 | 1.000 | 10.000 (naive) | 10.000 (tope catálogo) |
|---:|---:|---:|---:|---:|
| 2% | $10,45 | $33,92 | $195,63 | $273,63 |
| **5% (base)** | **$11,29** | **$46,30** | **$330,63** | **$273,63** |
| 10% | $12,70 | $68,80 | $555,63 | $273,63 |

A 10.000, cualquier `m` ≥ ~3,7% satura el catálogo de 7 TB; por encima de eso el costo queda acotado por el catálogo, no por el tráfico.

### Otras sensibilidades

- **CDN con 0% de hit** (todo va a R2): +$0 a 100; +$9,90 a 1.000; +$131,40 a 10.000. Sigue por debajo de storage + cómputo.
- **Sin eviction (12 meses):** a 100, 1,125 TB → $16,72/mes de storage ($26,76 total); a 1.000, 11,25 TB → $168,60 ($200,99 total); a 10.000 el acumulado teórico (112,5 TB) es imposible porque supera el catálogo de 7 TB. Con dedupe, storage no crece más allá del catálogo; solo crece sin control si se guardan variantes/re-encodes o duplicados.
- **100 imágenes/capítulo:** Class A se duplica en operaciones (a 10.000: $164,25 en vez de $79,88, porque el free tier de 1M no se duplica). Storage y cómputo no cambian.
- **DAU/pico = 10× en vez de 5×:** duplicar vistas, storage y operaciones; el cómputo puede requerir un nodo más. El veredicto no cambia.

---

## 6. Conclusión

1. **Viable.** No hay una pared de costo en el rango 100–10.000 lectores concurrentes. El total estimado va de ~$11/mes (100) a ~$274–331/mes (10.000) con CX, y de ~$24 a ~$365–422 con CPX.
2. **Componente dominante:** **cómputo** a 100 y 1.000 lectores (~$10 y ~$28 con CX, frente a $1,26 y $13,91 de storage). A 10.000, **storage y cómputo están empatados** (~$105–140 vs ~$107–199); Class A es tercero (~$58–80). **Egress = $0 en todos los casos** y nunca domina. Si hay que elegir un rubro a vigilar: **storage**, porque es el único que puede crecer sin techo natural; con dedupe y tope de catálogo está acotado a ~$105/mes.
3. **Egress no es un riesgo de costo** en esta arquitectura: R2 cobra $0 por egress y Cloudflare no tarifa bandwidth en Free/Pro. El riesgo de CDN es de fair use (§2.2.1(b)), no de factura.
4. **El límite real no es el costo** sino la fuente: rate limits/403 del origen (ticket #8), legal/takedown y la tasa de acierto real del caché. La PWA no cambia el costo del servidor; su límite es el cupo del navegador y la eviction de Safari a 7 días.
5. **Antes de construir:** medir `m` y el hit ratio del CDN con telemetría; confirmar disponibilidad y precio final de los planes CX (hoy “Currently not available”); y decidir explícitamente el presupuesto de storage/eviction (ticket #8).

---

## 7. Pendiente / UNVERIFIED

- **Sizing de cómputo:** no hay benchmark; los planes asignados son una estimación. UNVERIFIED.
- **DAU/pico = 5×:** supuesto de planificación, no dato medido. UNVERIFIED.
- **`m` = 5% y hit ratio CDN = 95%:** supuestos; deben medirse con telemetría. UNVERIFIED.
- **Precio de load balancer Hetzner:** no se encontró en una página primaria; se omitió del cálculo. UNVERIFIED.
- **Disponibilidad de la línea CX:** la página oficial la marcaba “Currently not available” el 2026-11-09 [S3]; puede cambiar. El fallback CPX está disponible.
- **IPv4 en el precio mostrado:** la página de planes dice “Price incl. IPv4” [S1]; la documentación de Primary IPs la lista a €0,50/$0,60/mes [S6]. No se pudo resolver la discrepancia; se usa el precio publicado y se anota el posible +€0,50/mes.
- **“Unmetered” bandwidth de Cloudflare:** no hay límite numérico publicado, pero tampoco una garantía contractual de “unmetered”; rige §2.2.1(b). UNVERIFIED como garantía.
- Los precios cambian; revalidar antes de comprar.

---

## Fuentes (consultadas el 2026-11-09 salvo indicación)

- **[S1]** Hetzner Cloud — Cost-Optimized plans: https://www.hetzner.com/cloud/cost-optimized/ (consultada 2026-11-09).
- **[S2]** Hetzner Cloud — Regular Performance (CPX) plans: https://www.hetzner.com/cloud/regular-performance/ (consultada 2026-11-09).
- **[S3]** Hetzner Cloud — página principal, disponibilidad “Currently not available”: https://www.hetzner.com/cloud/ (consultada 2026-11-09).
- **[S4]** Hetzner Docs — Traffic, incluido y exceso €1 ($1,20)/TB: https://docs.hetzner.com/robot/general/traffic/ (consultada 2026-11-09).
- **[S5]** Hetzner Docs — Cloud billing FAQ, tráfico entrante gratis y bloques de 100 MB: https://docs.hetzner.com/cloud/billing/faq/ (consultada 2026-11-09).
- **[S6]** Hetzner Docs — Primary IPs, IPv4 €0,50/$0,60/mes: https://docs.hetzner.com/cloud/servers/primary-ips/overview/ (consultada 2026-11-09).
- **[S7]** Cloudflare R2 — Pricing: https://developers.cloudflare.com/r2/pricing/ (consultada 2026-11-09).
- **[S8]** Cloudflare R2 — Public buckets, `r2.dev` no producción y Custom Domains con caché: https://developers.cloudflare.com/r2/buckets/public-buckets/ (consultada 2026-11-09).
- **[S9]** Cloudflare Cache — Enable cache in an R2 bucket, Custom Domain y límite de 512 MB: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ (consultada 2026-11-09).
- **[S10]** Cloudflare — Network & CDN plan comparison (Free/Pro/Business/Contract, precios y límites): https://www.cloudflare.com/plans/network-cdn.md (consultada 2026-11-09).
- **[S11]** Cloudflare Cache — Cache by status code, máximo cacheable 512 MB Free/Pro/Business y 5 GB Enterprise: https://developers.cloudflare.com/cache/how-to/configure-cache-status-code/ (consultada 2026-11-09).
- **[S12]** Cloudflare — Terms of Service, texto del 2025-09-12; sin cláusula non-HTML, §2.2.1(b) “undue burden”: https://www.cloudflare.com/terms/ (consultada 2026-11-09).
- **[S13]** web.dev — Storage for the Web, Chrome 60%/80% y eviction de Safari a 7 días: https://web.dev/articles/storage-for-the-web (consultada 2026-11-09).
- **[S14]** MDN — Storage quotas and eviction criteria (Chrome, Firefox, Safari, Cache Storage/IndexedDB): https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria (consultada 2026-11-09).
- **[S15]** WebKit Blog — Updates to Storage Policy (2023-08-10): 60%/80% apps de navegador, 15%/20% apps embebidas, Home Screen apps: https://webkit.org/blog/14403/updates-to-storage-policy/ (consultada 2026-11-09).
- **[S16]** WebKit Blog — Full Third-Party Cookie Blocking and More (2020-03-24): borrado de storage script-writable a los 7 días sin interacción: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ (consultada 2026-11-09).
- **[S17]** Banco Central Europeo — referencia EUR/USD 1,1165 del 2026-11-06: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml (consultada 2026-11-09).
