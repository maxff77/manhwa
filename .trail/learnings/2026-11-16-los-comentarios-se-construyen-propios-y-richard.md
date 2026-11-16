---
title: Los comentarios se construyen propios y anidados después de la v1
author: Richard
date: 2026-11-16
branch: docs/modelo-datos
cost: { minutes: 23, tokens: 163741 }
id: l-c0a8247a
scope: repo
status: active
src: agent
touches:
  - GLOSSARY.md
  - docs/specs/auth.md
  - docs/specs/comments.md
  - prisma/schema.prisma
  - docs/agents/issue-tracker.md
  - docs/specs/alerts.md
---

## Decided
Los comentarios son propios, no un widget de terceros, y se construyen después de la v1. Hilos separados por Capítulo y Serie, respuestas anidadas sin límite de datos con la sangría cortada al nivel 4 («continuar este hilo»), un solo «Me gusta», menciones @username con notificaciones in-app y moderación manual (rol MODERATOR, reportes, ocultar/restaurar/eliminar y bloqueo de comentarios por cuenta).

## Tried and ruled out
- Widget externo tipo Crowment: descartado porque la identidad y las menciones viven en nuestra cuenta, la moderación con roles no se integra con su panel, no hay exportación ni propiedad de datos documentada y el producto es nuevo y sin docs públicos.
- Respuestas de un solo nivel: se propuso como opción barata; el usuario eligió anidado sin límite. El coste se acota con carga por rama y corte visual, no con un tope de profundidad.
- Moderación automática o auto-ocultar por umbral de reportes: fuera de v1; todo lo decide una persona.

## Watch out
- El plugin `username` de Better Auth es la fuente de `User.username`; `nextCookies()` debe quedar último en `plugins`. Verificar `immutableUsername` y `displayUsername` contra 1.7.23 antes de confiar en ellos.
- El mapa vive en el issue #1. Un `gh issue edit --body-file` con un archivo temporal vacío borró su cuerpo; se restauró. Comprobar `test -s` antes de editar el cuerpo de un issue.
- La spec de comentarios es post-v1; el username sí toca el registro de v1 (spec de auth).

In the code: docs/specs/comments.md, prisma/schema.prisma (Comment, CommentReaction, CommentReport, Notification), docs/specs/auth.md, GLOSSARY.md. Commit 0cbf6a5. `trail check` exit 0. Sin package.json: `prisma validate` no se ejecutó.
