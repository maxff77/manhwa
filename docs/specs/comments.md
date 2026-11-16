# Comentarios y moderación

Spec del ticket [#11](https://github.com/maxff77/manhwa/issues/11). Cómo se comentan Series y Capítulos, cómo se anidan las Respuestas y cómo se reportan y moderan. Se construye **después del lanzamiento de v1**; no bloquea la v1.

## Alcance

- **Entra**: hilo por Capítulo y por Serie, Respuestas anidadas sin límite de profundidad, «Me gusta», menciones `@username`, Notificaciones in-app, Reportes y moderación manual, bloqueo de comentarios por cuenta.
- **No entra**: widget externo, push o email de Respuestas/Menciones, edición de Comentarios, perfiles públicos, más reacciones, imágenes/GIF, Markdown, moderación automática o con IA, bloqueo entre Usuarios, cambio de username.
- **Depende de**: `User.username` y `User.role`, definidos en `docs/specs/auth.md` (actualizada por este ticket).

## Superficie

- **Hilo por Capítulo**: al final del lector del Capítulo.
- **Hilo por Serie**: en la página de la Serie.
- Son **independientes**: un Comentario de Capítulo no aparece en el hilo de la Serie.
- Lectura anónima. Escribir, responder, reaccionar, mencionar y reportar exige sesión.
- La identidad pública es `@username` y el avatar (`User.image`). Nunca se muestran `User.name` ni el email.
- Cada Comentario tiene ancla permalink (`#comentario-<id>`). Los Moderadores llevan distintivo «MOD».

## Modelo

### Comentario y Respuesta

- Una sola tabla `Comment` para ambos hilos: `chapterId = null` significa hilo de Serie; con `chapterId`, hilo de Capítulo. `seriesId` siempre está presente (se deriva del Capítulo) para listar y moderar.
- Una Respuesta es un Comentario con `parentId`. No hay límite de profundidad en datos.
- Invariantes de aplicación:
  - La Respuesta hereda `seriesId` y `chapterId` del padre.
  - El padre debe existir, ser visible y pertenecer al mismo hilo.
  - No se responde a un Comentario oculto o eliminado.
  - Un Comentario de Capítulo debe pertenecer a la Serie indicada.
- **Visibilidad efectiva**: un Comentario se muestra si ningún ancestro está `HIDDEN`; los ancestros `DELETED` se muestran como lápida. El autor y los Moderadores ven además los Comentarios ocultos que les correspondan. Aplica a listas, ramas, permalinks y Notificaciones.
- Presentación del árbol:
  - La sangría se corta en el **nivel 4**. A partir de ahí se muestra «continuar este hilo», que abre esa rama como hilo propio (raíz = ese Comentario) y reinicia la sangría.
  - Las ramas se cargan bajo demanda (§ API).
- Orden de las Respuestas: **cronológico ascendente** en todos los niveles.
- Orden del primer nivel: **Recientes** (defecto) o **Mejores** (`likeCount` descendente; desempate por fecha descendente y `id`).

### Reacción

- Un único «Me gusta» por Usuario y Comentario; toggle. Sin reacciones negativas ni set de emojis.
- Permitida en el propio Comentario.
- `Comment.likeCount` se mantiene denormalizado en la misma transacción que crea o borra la reacción.

### Menciones

- Sintaxis `@username`; solo resuelven si el Usuario existe. Hasta **5 menciones distintas** por Comentario; la sexta → `400 TOO_MANY_MENTIONS`.
- Se resaltan; no enlazan a perfil (no hay perfiles públicos en v1).
- Generan Notificación de tipo `MENTION`. Una mención a uno mismo se resalta pero no notifica.
- Un `@` que no corresponde a un username existente queda como texto.

### Formato del texto

- Texto plano, 1–2.000 caracteres Unicode tras recortar; solo espacios → `400 EMPTY_BODY`.
- Saltos de línea conservados; se eliminan caracteres de control salvo `\n`. Sin HTML ni Markdown. Las URLs quedan como texto no clicable.
- **Spoiler** `>!texto!<`, oculto hasta pulsarlo; el editor ofrece un botón que lo inserta. Los marcadores sin cerrar se muestran literales.
- Render por tokens a componentes React; nunca `dangerouslySetInnerHTML`.
- Sin edición. El autor puede eliminar; un Moderador también.

## Autenticación y límites

- Leer: público. Si hay sesión, la respuesta incluye `likedByMe` y los Comentarios ocultos propios.
- Escribir: sesión con `User.username` definido. Sin username → `409 USERNAME_REQUIRED`; la UI lo pide una vez.
- Cuenta bloqueada (`commentsBlockedAt`) → `403 COMMENTS_BLOCKED`.
- Límites por cuenta (Respuestas incluidas):
  - Estándar: 1 Comentario cada 10 s, 20/hora, 100/día.
  - Cuenta con menos de 24 h (`User.createdAt`): 1 cada 60 s, 5/hora, 20/día.
  - Se comprueban contando filas recientes de `Comment` por `authorId` y `createdAt`, sin tabla de rate limit.
  - Excedido → `429` con `Retry-After`.
- Reportes: 10/hora y 30/día por cuenta, contados sobre `CommentReport` por `reporterId` y `createdAt`; excedido → `429`. Solo se reporta un Comentario visible para quien reporta.

## Orden, paginación y API

### Convenciones

- Cursor opaco con huella de `sort` + hilo, como en `docs/specs/catalog.md`; huella que no coincide → `400`.
- `limit` de primer nivel: 20 por defecto, máximo 50. Ramas: 10 por defecto, máximo 50.
- Las listas devuelven `{ "items": [...], "nextCursor": "..." }`.
- Sin `total`.
- Errores de validación → `400` con `{ "error": "<motivo>" }`.

### Nodo de Comentario

```json
{
  "id": "cuid",
  "parentId": null,
  "body": "Texto con @ana y >!spoiler!<",
  "status": "VISIBLE",
  "createdAt": "2026-11-16T12:00:00.000Z",
  "author": { "username": "pedro", "image": null, "isModerator": false },
  "likeCount": 3,
  "likedByMe": false,
  "replyCount": 12,
  "replies": []
}
```

- `replies` trae hasta **2 Respuestas directas**, las más viejas, como vista previa.
- `status` solo es `HIDDEN` para el autor del Comentario o para Moderadores; el resto no recibe el nodo.
- En `DELETED`, `body` es `""` y `likeCount` es `0`; el nodo se devuelve solo si tiene Respuestas (lápida). `author` es `null` si la cuenta fue borrada; la UI muestra «Usuario eliminado».
- `replyCount` cuenta las Respuestas directas visibles para quien consulta.
- `likedByMe` es `false` sin sesión.
- `isModerator` se deriva de `User.role`.

### Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/series/[seriesId]/comments?sort=new\|best&cursor=&limit=` | público | Primer nivel del hilo de la Serie, con vista previa de Respuestas |
| `GET /api/chapters/[chapterId]/comments?sort=new\|best&cursor=&limit=` | público | Igual, hilo del Capítulo |
| `POST /api/series/[seriesId]/comments` `{ body }` | sesión | Crea Comentario de primer nivel |
| `POST /api/chapters/[chapterId]/comments` `{ body }` | sesión | Crea Comentario de primer nivel |
| `POST /api/comments/[commentId]/replies` `{ body }` | sesión | Crea Respuesta; el padre debe ser visible |
| `GET /api/comments/[commentId]/replies?cursor=&limit=` | público | Respuestas directas, cronológicas ascendentes |
| `PUT /api/comments/[commentId]/reaction` | sesión | Idempotente: deja el «Me gusta» |
| `DELETE /api/comments/[commentId]/reaction` | sesión | Idempotente: lo quita |
| `DELETE /api/comments/[commentId]` | autor o Moderador | Elimina; el autor borra el cuerpo, el Moderador lo conserva |
| `POST /api/comments/[commentId]/reports` `{ reason, note? }` | sesión | Reporta; no el propio; único por Usuario |
| `PATCH /api/comments/[commentId]/moderation` `{ action: hide\|restore\|delete }` | Moderador | Acción de moderación |
| `GET /api/moderation/reports?status=open&cursor=` | Moderador | Cola de Reportes |
| `PATCH /api/moderation/reports/[reportId]` `{ status: resolved\|dismissed }` | Moderador | Resuelve o descarta |
| `POST /api/moderation/users/[userId]/comments-block` `{ reason }` | Moderador | Bloquea comentarios y oculta en bloque los visibles |
| `DELETE /api/moderation/users/[userId]/comments-block` | Moderador | Desbloquea; no restaura Comentarios |
| `GET /api/notifications?cursor=` | sesión | Notificaciones propias con `unreadCount` |
| `PATCH /api/notifications/[notificationId]` | sesión | Marca leída |
| `POST /api/notifications/read-all` | sesión | Marca todas leídas |
| `POST /api/auth/is-username-available` `{ username }` | público | Disponibilidad, del plugin `username` de Better Auth |
| `POST /api/auth/update-user` `{ username }` | sesión | Elige username si aún no tiene, con `immutableUsername: true` |

- `PUT`/`DELETE` de reacción devuelven `{ likeCount, likedByMe }`.
- `POST` de Comentario o Respuesta → `201` con el nodo. `POST` de Reporte → `201 { "id", "status": "OPEN" }`.
- `PATCH` de moderación, `PATCH` de Notificación y bloqueo/desbloqueo → `204`.
- La cola de moderación devuelve `{ "items": [{ "id", "reason", "note", "createdAt", "comment": <nodo>, "reportCount": 3 }], "nextCursor": "..." }`.
- `GET` de hilos y ramas incluye la sesión si existe; nunca es obligatoria.
- `POST` sobre un hilo inexistente → `404`.
- `DELETE` de un Comentario ya eliminado → `204`; si no existe → `404`.
- Reporte duplicado → `409 ALREADY_REPORTED`; reporte propio → `400 CANNOT_REPORT_OWN`.
- Moderación sin rol → `403 FORBIDDEN`.
- `GET /api/comments/[id]/replies` de un padre `HIDDEN` → `404` para el público; el autor y los Moderadores lo ven. Un padre `DELETED` sí devuelve sus Respuestas.
- La cola de moderación no expone emails; muestra `@username` del reportante.

### Cursor y orden

- `sort=new`: `(createdAt DESC, id DESC)`.
- `sort=best`: `(likeCount DESC, createdAt DESC, id DESC)`.
- Ramas: `(createdAt ASC, id ASC)`.
- Notificaciones: `(createdAt DESC, id DESC)`, sin huella.
- La huella incluye el hilo, `sort` y, en ramas, el `parentId`.
- «Mejores» con `likeCount` que cambia entre páginas puede repetir o saltar nodos; aceptado, igual que `sort=latest` en el catálogo.

## Notificaciones

- Solo in-app. Sin push ni email en v1; el push existente es exclusivo de alertas de Capítulos.
- Tipos:
  - `REPLY`: al autor del Comentario padre.
  - `MENTION`: a cada username mencionado.
- Nunca al propio actor. Si el destinatario ya recibe `REPLY` en el mismo Comentario, no se crea `MENTION`.
- Una fila por destinatario, Comentario y tipo (`@@unique`).
- La campana muestra el contador de no leídas. La lista ordena por `createdAt DESC`; al pulsar, marca leída y navega al ancla.
- Si el Comentario está oculto o eliminado, o tiene un ancestro oculto, la Notificación no se lista; la fila se conserva. `unreadCount` aplica la misma regla.
- `GET /api/notifications` devuelve `{ "items": [{ "id", "type", "createdAt", "readAt", "url", "actor": { "username", "image" }, "excerpt" }], "nextCursor", "unreadCount" }`. `url` apunta al ancla del Comentario; `excerpt` son los primeros 120 caracteres del cuerpo.
- No hay preferencias por Usuario: todas las Respuestas y Menciones notifican.

## Reportes y moderación

- **Rol**: `User.role = MODERATOR`, asignado por SQL; no hay UI de roles.
- **Reporte**: cualquier Usuario con sesión, una vez por Comentario visible y no el propio. Motivos: `SPAM`, `ABUSE`, `OTHER`; nota opcional ≤500. Un Reporte no oculta nada por sí solo.
- **Cola**: Reportes `OPEN` por antigüedad ascendente, con el Comentario, su cadena de padres y el número de Reportes del Comentario.
- **Acciones**: ocultar, restaurar, eliminar, resolver o descartar el Reporte. También se puede ocultar desde el hilo. **Sin auto-ocultar** por umbral de Reportes.
- **Ocultar** (reversible): el Comentario y toda su rama desaparecen para los lectores; el autor ve el suyo con aviso «oculto por moderación»; los Moderadores lo ven. Se registran `moderatedById` y `moderatedAt`.
- **Restaurar**: vuelve a `VISIBLE`; la rama reaparece. Se actualizan `moderatedById` y `moderatedAt`.
- **Eliminar**:
  - Autor: cuerpo a `""`, `status = DELETED`, `deletedById = autor`.
  - Moderador: `status = DELETED`, `deletedById = moderador`; el cuerpo original se conserva en la DB para auditoría y la API nunca lo devuelve.
  - Si hay Respuestas, se muestra una lápida «Comentario eliminado» como padre y las Respuestas siguen visibles. Si no hay, el nodo no se lista.
  - Al eliminar, sus Reportes `OPEN` pasan a `RESOLVED`; `resolvedById` es el Moderador o `NULL` si lo eliminó el autor.
- **Comentario oculto o eliminado**: no admite Respuestas, reacciones ni Reportes nuevos. Las reacciones existentes se conservan en la DB.
- **Bloqueo de cuenta**: `commentsBlockedAt` + `commentsBlockedReason`; al bloquear se ocultan en bloque todos sus Comentarios visibles (y, por la regla de rama, sus Respuestas). La cuenta sigue leyendo y usando el resto de la plataforma. Desbloquear no restaura los Comentarios ocultos.
- **Borrado de cuenta**: `Comment.authorId`, `moderatedById`, `deletedById`, `CommentReport.reporterId` y `resolvedById` pasan a `NULL` (`onDelete: SetNull`); los Comentarios quedan anónimos y las Respuestas se mantienen. Las reacciones del Usuario caen en cascada; las Notificaciones que recibe también.

## Esquema

```prisma
enum UserRole {
  USER
  MODERATOR
}

enum CommentStatus {
  VISIBLE
  HIDDEN
  DELETED
}

enum CommentReportReason {
  SPAM
  ABUSE
  OTHER
}

enum CommentReportStatus {
  OPEN
  RESOLVED
  DISMISSED
}

enum NotificationType {
  REPLY
  MENTION
}

/// Comentario en el hilo de una Serie (chapterId null) o de un Capítulo.
/// Las Respuestas cuelgan de parentId sin límite de profundidad.
model Comment {
  id        String        @id @default(cuid())
  authorId  String?
  seriesId  String
  chapterId String?
  parentId  String?
  body      String
  status    CommentStatus @default(VISIBLE)
  likeCount Int           @default(0)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  moderatedById String?
  moderatedAt   DateTime?
  deletedById   String?
  deletedAt     DateTime?

  author    User?    @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  moderator User?    @relation("CommentModerator", fields: [moderatedById], references: [id], onDelete: SetNull)
  deleter   User?    @relation("CommentDeleter", fields: [deletedById], references: [id], onDelete: SetNull)
  series    Series   @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  chapter   Chapter? @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  parent    Comment? @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("CommentReplies")

  reactions     CommentReaction[]
  reports       CommentReport[]
  notifications Notification[]

  @@index([chapterId, parentId, status, createdAt, id])
  @@index([seriesId, parentId, status, createdAt, id])
  @@index([parentId, createdAt, id])
  @@index([authorId, createdAt])
  @@map("comments")
}

/// «Me gusta» de un Usuario a un Comentario. Uno por Usuario y Comentario.
model CommentReaction {
  commentId String
  userId    String
  createdAt DateTime @default(now())

  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([commentId, userId])
  @@index([userId])
  @@map("comment_reactions")
}

/// Reporte de un Usuario sobre un Comentario.
model CommentReport {
  id           String              @id @default(cuid())
  commentId    String
  reporterId   String?
  reason       CommentReportReason
  note         String?
  status       CommentReportStatus @default(OPEN)
  createdAt    DateTime            @default(now())
  resolvedAt   DateTime?
  resolvedById String?

  comment    Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  reporter   User?   @relation("ReportReporter", fields: [reporterId], references: [id], onDelete: SetNull)
  resolvedBy User?   @relation("ReportResolver", fields: [resolvedById], references: [id], onDelete: SetNull)

  @@unique([commentId, reporterId])
  @@index([status, createdAt])
  @@index([commentId])
  @@map("comment_reports")
}

/// Aviso in-app de una Respuesta o Mención.
model Notification {
  id        String           @id @default(cuid())
  userId    String
  actorId   String?
  commentId String
  type      NotificationType
  createdAt DateTime         @default(now())
  readAt    DateTime?

  user    User    @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor   User?   @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@unique([userId, commentId, type])
  @@index([userId, readAt, createdAt])
  @@map("notifications")
}
```

Además:

- `Series.comments Comment[]` y `Chapter.comments Comment[]`.
- En `User`: `username String? @unique`, `role UserRole @default(USER)`, `commentsBlockedAt DateTime?`, `commentsBlockedReason String?` y las relaciones inversas de `Comment`, `CommentReaction`, `CommentReport` y `Notification`.

## Criterios de aceptación

- [ ] Leer ambos hilos funciona sin sesión; escribir sin sesión devuelve `401`.
- [ ] Un Comentario muestra `@username` y avatar; nunca `name` ni email.
- [ ] Sin username, comentar devuelve `409 USERNAME_REQUIRED`; elegirlo una vez funciona; cambiarlo después falla.
- [ ] Se puede responder al menos a 3 niveles; a partir del nivel 4 aparece «continuar este hilo».
- [ ] La vista previa trae 2 Respuestas; «ver respuestas» carga la rama de 10 en 10.
- [ ] Las Respuestas van de más vieja a más nueva; el primer nivel alterna Recientes/Mejores.
- [ ] Un cursor con otra huella devuelve `400`.
- [ ] El «Me gusta» es idempotente y `likeCount` queda correcto; una reacción por Usuario y Comentario.
- [ ] La sexta mención distinta devuelve `400 TOO_MANY_MENTIONS`; una mención existente notifica; a uno mismo no.
- [ ] Una Respuesta notifica al autor del padre; el actor no se notifica a sí mismo.
- [ ] Reportar el propio Comentario devuelve `400`; duplicar un Reporte devuelve `409`.
- [ ] Ocultar hace desaparecer la rama; restaurar la devuelve; el autor ve su Comentario oculto.
- [ ] Eliminar deja lápida si hay Respuestas; el autor borra el cuerpo; el Moderador lo conserva y la API no lo sirve.
- [ ] Moderar sin rol devuelve `403`; la cola solo muestra Reportes abiertos.
- [ ] Bloquear una cuenta impide comentar (`403`) y oculta sus Comentarios; desbloquear no los restaura.
- [ ] Los límites de frecuencia de Comentarios y Reportes devuelven `429` con `Retry-After`.
- [ ] Borrar la cuenta anonimiza sus Comentarios y conserva los hilos.
- [ ] Un spoiler está oculto hasta pulsarlo; un `<script>` en el cuerpo se muestra como texto.
- [ ] Las Notificaciones se marcan leídas y no listan Comentarios ocultos.
- [ ] Borrar un Capítulo o una Serie elimina sus Comentarios en cascada.

## Riesgos

- **UI del árbol**: la profundidad sin límite más la sangría cortada al nivel 4 exige una vista de «continuar hilo» bien resuelta; si se improvisa, el árbol se vuelve ilegible en móvil.
- **`likeCount` denormalizado**: si la transacción de la reacción falla a medias, el contador deriva. Un recuento periódico desde `comment_reactions` lo corrige.
- **Cursor de «Mejores»**: los likes cambian entre páginas y pueden repetir o saltar nodos; aceptado, igual que `sort=latest` en el catálogo.
- **Username reciclado**: al borrar una cuenta su username queda libre; un `@username` viejo puede acabar resaltando a otra persona. No hay tabla de usernames retirados en v1.
- **Sin auto-ocultar**: con pocos Moderadores, el spam puede permanecer visible hasta que alguien revise la cola. Los límites y el bloqueo de cuenta lo acotan.
- **Notificaciones sin push**: las Respuestas y Menciones solo se ven al entrar; la participación puede quedar baja.
- **Cuerpo conservado**: las eliminaciones de Moderador retienen el texto para auditoría; si aparece información personal, la purga es manual.
- **Plugin de username**: `immutableUsername` y `displayUsername` se verifican contra Better Auth 1.7.23; si alguna opción no existe, la inmutabilidad y las palabras reservadas se aplican en el servidor.
- **`username` nullable**: las cuentas creadas por OAuth existen sin username hasta que lo eligen; sin él no pueden comentar.

## Fuera de alcance v1

- Push y email de Respuestas y Menciones.
- Perfiles públicos de Usuario y páginas de historial de Comentarios.
- Edición de Comentarios con historial.
- Reacciones múltiples, negativas o con emojis; imágenes y GIF.
- Markdown enriquecido más allá del spoiler.
- Moderación automática o con IA; auto-ocultar por umbral de Reportes.
- Bloqueo o silenciamiento entre Usuarios.
- Cambio de username.
- Avisos para Moderadores y preferencias de Notificación por Usuario.
