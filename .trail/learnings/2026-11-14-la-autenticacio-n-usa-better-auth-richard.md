---
title: La autenticación usa Better Auth con verificación obligatoria y sin estado anónimo
author: Richard
date: 2026-11-14
branch: docs/modelo-datos
cost: { minutes: 37, tokens: 106981 }
id: l-43b5dcdc
scope: repo
status: active
src: agent
touches:
  - docs/specs/auth.md
  - prisma/schema.prisma
  - docs/specs/source-adapter.md
  - docs/specs/image-pipeline.md
---

## Decided
- Better Auth 1.7.23 fijada, Usuario en Postgres propio; email+contraseña, Google y Discord. Verificación de email obligatoria antes del primer login; leer no exige cuenta.
- Sesiones en BD de 30 días deslizantes con revocación inmediata; Argon2id en vez del scrypt por defecto; rate limit por ruta persistido en BD.
- Sin biblioteca anónima: progreso, seguimientos y colecciones exigen login; no hay fusión al registrarse. Las cuentas se borran en duro con cascada.

## Tried and ruled out
- Auth.js: sin v5 estable, en mantenimiento de seguridad y con Credentials solo admite JWT (no revocable), así que no cumple la sesión revocable.
- Implementación propia con Lucia/Oslo: Lucia deprecada desde marzo de 2025; reescribir sesiones, tokens y rate limiting no aporta nada a esta escala.

## Watch out
- Better Auth encadena breaking changes (1.5, 1.6 y 1.7 en un año): pinear 1.7.23 y leer release notes antes de subir.
- El adaptador Prisma soporta 5–7; `npm latest` ya resuelve un RC de 8. Pinear prisma@7.10.
- El rate limit es solo por IP; no frena un ataque distribuido contra una cuenta. `revokeSessionsOnPasswordReset` solo es atómico con `transaction: true`.
- `User.name` es NOT NULL en Better Auth: el formulario lo rellena con la parte local del email si se deja vacío.

In the code:
- docs/specs/auth.md (decisión, flujos, configuración y checklist)
- prisma/schema.prisma (User extendido + Session, Account, Verification, RateLimit)
- Validación: DATABASE_URL='postgresql://user:pass@localhost:5432/manhwa' npx -y prisma@6 validate --schema prisma/schema.prisma
