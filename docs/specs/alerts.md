# Detección y alertas de Capítulos nuevos

Spec del ticket [#10](https://github.com/maxff77/manhwa/issues/10). Cómo se detectan los Capítulos nuevos de las Series seguidas y cómo se avisa al Usuario.

## Alcance

- **Canal**: solo Web Push (PWA) en v1. Sin email y sin centro de alertas dentro de la app.
- **Solo Series seguidas**: una Serie se sondea únicamente si tiene al menos un Seguimiento con `alerts = true`. El catálogo no se sondea.
- **Solo Capítulos nuevos**: se avisa de los Capítulos descubiertos después de que el Usuario empezó a seguir la Serie.
- Fuera de v1: email, digest entre Series, reintento persistente de notificaciones y alertas de cambios de metadata.

## Conjunto vigilado y cadencia

Cada tick, el poller selecciona los `SeriesSource` con `nextCheckAt` vencido (o `null`) cuya Serie tenga algún `Follow` con `alerts = true`. El estado de la Serie decide la cadencia:

| Estado de la Serie | Cadencia |
|---|---|
| `ONGOING`, último Capítulo hace ≤ 7 días | 15 min |
| `ONGOING`, último Capítulo hace 8–30 días | 6 h |
| `ONGOING`, último Capítulo hace > 30 días o sin Capítulos | 24 h |
| `HIATUS` | 24 h |
| `COMPLETED` / `CANCELLED` | 7 días (red de seguridad; no se deja de sondear) |

- La fecha del último Capítulo sale de `MAX(publishedAt)`, con `MAX(createdAt)` como respaldo.
- Jitter de ±20 % por Serie para no concentrar peticiones.
- Lote máximo por tick: 100 Series; lo que no entra queda para el siguiente tick.
- Al crear un Seguimiento con `alerts = true`, se pone `nextCheckAt = now()` de su `SeriesSource` para que la primera revisión sea inmediata.
- Una Serie sin Seguimientos con alertas no se consulta. No se borra su estado; si alguien vuelve a seguirla, se reanuda.

## Detección

`listRecentChapters` (quinta operación del contrato, ver `docs/specs/source-adapter.md`) devuelve los Capítulos más recientes primero, 40 por página en Olympus.

1. Se pide la primera página con `direction=desc`.
2. Se recorre hasta encontrar un `externalId` ya conocido en la DB o agotar 3 páginas (120 Capítulos).
3. Se insertan los nuevos con `createMany({ skipDuplicates: true })` por `(seriesId, sourceId, externalId)`, en orden ascendente, guardando `publishedAt`. El segmento de URL se repite entre Series («1», «2»…), así que la identidad es por Serie y Fuente (#21).
4. Si se agotan las 3 páginas con todos los Capítulos nuevos, se registra la anomalía y se insertan los 120 más recientes; los anteriores los completa la sincronización completa al visitar la Serie.
5. Un Capítulo con `number: null` se omite con log (el esquema exige número); se reintenta en la siguiente pasada.

La detección no modifica Capítulos existentes ni procesa Capítulos borrados en la Fuente.

## Línea base del Seguimiento

Solo se alerta a los Seguimientos con `createdAt < chapter.createdAt`: el Capítulo se descubrió después de seguir la Serie. Seguir una Serie no dispara backfill ni avisa de Capítulos ya publicados. Dejar de seguir y volver a seguir reinicia la base.

La UI de Seguimiento vive en la página de la Serie, que sincroniza la lista completa antes de permitir seguir; por eso los Capítulos ya publicados suelen estar en la DB antes del `Follow` y no generan alerta.

## Notificación

- **Agrupación**: un push por Serie por pasada. Si hay varios Capítulos nuevos, un solo aviso; sin digest entre Series.
- **Texto**: título = título de la Serie. Cuerpo = `Capítulo <n>` si es uno; si son varios y los números son consecutivos, `N capítulos nuevos (<a>–<b>)`; si no son consecutivos, `N capítulos nuevos`.
- **Destino del toque**: un Capítulo → su lector; varios → página de la Serie.
- **Payload**:

  ```json
  {
    "title": "<título de la Serie>",
    "body": "Capítulo 221",
    "url": "/series/<slug>/capitulo/<externalId>",
    "tag": "series-<seriesId>"
  }
  ```

- `tag` por Serie: una alerta nueva reemplaza a la anterior en el dispositivo.
- Web Push con `web-push`: VAPID, TTL 24 h, urgencia `normal`, icono de la app.
- **Best-effort**: se envía al detectar, sin outbox ni reintento propio. Si el envío falla, se pierde esa alerta; el Capítulo sigue visible en la Serie. El servicio push (FCM/APNs/Mozilla) ya encola con TTL.

## Suscripciones push

- **Alta**: `POST /api/push/subscriptions` con `{ endpoint, keys: { p256dh, auth } }`. Requiere sesión. Upsert por `endpoint` único: el mismo dispositivo cambia de Usuario al iniciar sesión.
- **Baja**: `DELETE /api/push/subscriptions` con `{ endpoint }`. También al cerrar sesión.
- Un Usuario puede tener varias suscripciones (varios dispositivos); se envía a todas.
- Envío con 404/410 → se borra la suscripción. Otros errores → se registran; la suscripción se conserva.
- **Permiso**: se pide al pulsar «Seguir» por primera vez, con una explicación corta y solo tras ese clic; nunca al cargar la página. Si se deniega, el Seguimiento se guarda igual y ajustes permite reintentar.
- **iOS**: Web Push exige la PWA instalada en la pantalla de inicio (16.4+). Si no lo está, se muestran instrucciones de instalación en vez de pedir permiso.
- **Service worker**: handlers `push` y `notificationclick` en el service worker propio de Serwist (`swSrc`). `notificationclick` enfoca una pestaña existente o abre una nueva con la URL del payload.

## Job

- **Systemd timer** en el VPS cada 5 minutos, ejecutando `npm run alerts:poll` (`tsx scripts/poll-alerts.ts`).
- El script toma `pg_try_advisory_lock(hashtext('manhwa:alerts-poll'))`; si no lo consigue, sale con 0. La conexión lo libera al terminar.
- Una ejecución: seleccionar vencidos → por Serie, `listRecentChapters` → persistir → enviar → actualizar `lastCheckedAt`, `nextCheckAt` y `consecutiveFailures`.
- **Fallo** (`SourceError`): `consecutiveFailures++` y `nextCheckAt = now + min(1 h × 2^(consecutiveFailures−1), 24 h)`. **Éxito**: `consecutiveFailures = 0` y `nextCheckAt = now + cadencia`.
- Nunca se desactiva una Serie sola. A partir de 10 fallos consecutivos se registra un error visible en logs.
- Sin tabla de jobs ni cola en v1. El lock evita solapes; el timer reintenta en el siguiente tick.

### Unidades systemd

```ini
# /etc/systemd/system/manhwa-alerts.service
[Unit]
Description=Manhwa alerts poll
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/srv/manhwa
ExecStart=/usr/bin/npm run alerts:poll
```

```ini
# /etc/systemd/system/manhwa-alerts.timer
[Unit]
Description=Run Manhwa alerts poll every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Unit=manhwa-alerts.service

[Install]
WantedBy=timers.target
```

## Esquema

```prisma
model SeriesSource {
  // ...identidad existente...
  lastCheckedAt       DateTime?
  nextCheckAt         DateTime?
  consecutiveFailures Int      @default(0)

  @@index([nextCheckAt])
}

model PushSubscription {
  id            String    @id @default(cuid())
  userId        String
  endpoint      String    @unique
  p256dh        String
  auth          String
  userAgent     String?
  createdAt     DateTime  @default(now())
  lastSuccessAt DateTime?
  failures      Int       @default(0)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

`Follow.alerts` ya existía en el modelo de #2. No hay tabla de Descargas ni de alertas enviadas.

## Costo

Con 1.000 Series seguidas y una mezcla típica (40 % emisión activa, 30 % emisión lenta, 10 % hiatus, 20 % finalizadas): ~39.000 peticiones/día ≈ 0,45 req/s. El adapter serializa una petición por host y el lote de 100 por tick mantiene el pico bajo. El push no tiene costo por mensaje.

## Riesgos

- **Anti-bot de Olympus**: la medición de #12 dio 2 de 7 peticiones bloqueadas. Con 3 intentos del adapter, un chequeo de una petición tiene ~2,4 % de agotar reintentos (si los bloqueos son independientes). Si Olympus bloquea la IP del VPS de forma persistente, las alertas se retrasan hasta el backoff de 24 h.
- **Estado desactualizado**: `Series.status` se refresca al visitar la Serie. Una Serie marcada `COMPLETED` que vuelva a emitir se detecta con la revisión semanal y se alerta, pero el estado puede tardar en corregirse.
- **iOS**: una parte de los Usuarios no recibe push si no instala la PWA. No hay canal alternativo en v1.
- **Best-effort**: un crash entre insertar el Capítulo y enviar pierde esa alerta. Aceptado en v1; un outbox lo resolvería si el volumen lo justifica.
