---
title: Las alertas de capítulos van por push y se detectan con una sola página de novedades
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 22, tokens: 107095 }
id: l-24b6373d
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/specs/source-adapter.md
  - prisma/schema.prisma
  - docs/specs/alerts.md
  - docs/agents/issue-tracker.md
---

## Decided
- v1 avisa solo por Web Push; el email queda como canal posterior. La PWA ya existe y el push no cuesta por mensaje; Resend solo cubre auth.
- El poller corre cada 5 min con un systemd timer y un advisory lock, sin cola ni tabla de jobs. Solo vigila Series con algún Seguimiento con alertas activas.
- La cadencia depende del estado: emisión activa 15 min, emisión lenta 6 h, emisión muerta/hiatus 24 h, finalizadas/canceladas 7 días como red de seguridad.
- La detección pide solo la primera página de capítulos, más nuevos primero, y se detiene al encontrar uno ya conocido. Se añadió `listRecentChapters` como quinta operación del contrato: una petición en vez de las ~6 de la lista completa.
- Una notificación por Serie agrupando capítulos, con `tag` para reemplazar la anterior. Sin digest entre Series.
- Solo se alerta a Seguimientos anteriores al `createdAt` del Capítulo; seguir una Serie no avisa de lo ya publicado.
- No hay corte por inactividad y no se desactiva una Serie sola.
- Envío best-effort sin outbox: si falla, la alerta se pierde y el Capítulo sigue visible en la Serie.

## Tried and ruled out
- Email en v1: plantillas, baja, rebotes y el plan gratuito de Resend (100/día) se agota con alertas por capítulo.
- Sondear la lista completa de capítulos: 6 peticiones por serie de 226 capítulos y ~14 % de probabilidad de agotar reintentos con el anti-bot medido, frente a ~2,4 % con una petición.
- Cola de jobs (pg-boss) o cron dentro de Next: el timer del sistema con lock cubre un solo poller y no añade dependencias.
- Outbox con reintento: una tabla y un worker para un fallo raro; el servicio push ya encola con TTL.
- Digest cross-Serie, centro de alertas in-app y pausa por inactividad: fuera de v1.

## Watch out
- Olympus no tiene endpoint de "capítulos nuevos": lo más cercano es la lista paginada con `direction=desc`. No hay forma de pedir "desde el capítulo X".
- La unicidad de número por serie+fuente puede chocar si el origen repite números; el poller usa `createMany` con `skipDuplicates` y registra la anomalía.
- Web Push en iOS solo funciona con la PWA instalada en la pantalla de inicio (16.4+); una parte de los usuarios no recibirá avisos.
- `Series.status` se refresca al visitar la Serie: una finalizada que vuelva a emitir se detecta por la revisión semanal, pero el estado puede quedar desactualizado.

In the code:
- docs/specs/alerts.md
- docs/specs/source-adapter.md (`listRecentChapters`)
- prisma/schema.prisma (`PushSubscription`, estado de polling en `SeriesSource`)
- GLOSSARY.md (Alerta)
