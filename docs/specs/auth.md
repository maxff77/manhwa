# Autenticación y cuentas

Spec del ticket [#7](https://github.com/maxff77/manhwa/issues/7). Cómo se identifica un Usuario, cómo se guardan sus credenciales y sesiones, y qué tablas añade al esquema.

## Decisión

**Better Auth 1.7.23**, versión fijada. El Usuario vive en Postgres propio; ningún proveedor externo guarda la identidad. Métodos: email+contraseña, Google y Discord.

Alternativas descartadas (verificado el 2026-11-14):

- **Auth.js / NextAuth**: no hay v5 estable (`5.0.0-beta.32`); está en mantenimiento de seguridad y su propia documentación recomienda Better Auth para proyectos nuevos. Con el proveedor Credentials no admite sesiones de base de datos: solo JWT, que no se puede revocar antes de expirar.
- **Implementación propia (guía de Lucia / Oslo)**: Lucia está deprecada desde marzo de 2025. Habría que escribir sesiones, tokens de verificación y reset, vinculación de cuentas y rate limiting sin ganar nada a esta escala.

La decisión acepta los defaults de Better Auth salvo lo marcado como **override** en este documento.

## Superficie

| Función | v1 |
|---|---|
| Leer sin cuenta | Sí. No se guarda nada: sin progreso, Seguimientos ni Colecciones anónimas, y no hay fusión al registrarse |
| Email+contraseña | Sí, con verificación obligatoria antes del primer login |
| Google / Discord | Sí |
| Vinculación automática | Solo con email verificado por el proveedor y email local verificado |
| Cambio de contraseña | Sí, con reautenticación |
| Cerrar todas las sesiones | Sí |
| Nombre visible | Opcional en el formulario; `User.name` es NOT NULL |
| Cambio de email | No |
| 2FA | No |
| Exportación de datos | No |

## Flujos

### Registro y verificación

- Formulario: email, contraseña y nombre opcional. Si el nombre queda vacío se guarda la parte local del email (Better Auth exige `name` NOT NULL).
- Contraseña: 8–128 caracteres (default de Better Auth), sin reglas de composición.
- Hash: **override** con Argon2id de `@node-rs/argon2` (defaults `m=19456 KiB`, `t=2`, `p=1`, alineados con el baseline de OWASP). El scrypt de serie de Better Auth queda ~4× por debajo de ese baseline.
- Al registrarse se envía un enlace de verificación (JWT firmado, `expiresIn` 1 hora) por Resend.
- `requireEmailVerification: true`: sin verificar, el login email+contraseña responde `403 EMAIL_NOT_VERIFIED`. `sendOnSignIn: true` reenvía el enlace en cada intento, acotado por el rate limit de `/send-verification-email`.
- `autoSignInAfterVerification: true`: al abrir el enlace, el dispositivo queda con sesión iniciada y vuelve a la página que inició el registro.

### Login

- Email+contraseña con mensaje de error genérico en la UI («Email o contraseña incorrectos»), sin distinguir si el email existe.
- Botones de Google y Discord, sin contraseña.
- Cada intento pasa por el rate limit de `/sign-in/email`.

### OAuth

- **Google**: scopes `openid`, `email`, `profile` (no sensibles, no requieren verificación de app). Consent screen publicado. Redirect URI `https://<dominio>/api/auth/callback/google`.
- **Discord**: scopes `identify`, `email`. Redirect URI `https://<dominio>/api/auth/callback/discord`.
- Discord puede devolver `email: null` en cuentas creadas solo con teléfono. Sin email no se puede crear el Usuario (`email` NOT NULL): la UI muestra un error y sugiere otro método.
- Vinculación: defaults de Better Auth (`enabled: true`, `trustedProviders: []`, `disableImplicitLinking: false`). La vinculación implícita exige que el proveedor reporte el email como verificado **y** que el Usuario local tenga `emailVerified` (`requireLocalEmailVerified` default `true`). No se marcan proveedores como confiables.

### Recuperación de contraseña

- `POST /request-password-reset` envía un enlace con token de 1 hora, guardado en `verification` como `reset-password:<token>`.
- `revokeSessionsOnPasswordReset: true` + `transaction: true` en el adaptador Prisma: el cambio de contraseña y la revocación de todas las sesiones son atómicos.
- La UI responde igual exista o no la cuenta, para no enumerar emails.

### Sesiones

- Sesión en base de datos con token opaco en cookie `better-auth.session_token` (con HTTPS pasa a `__Secure-better-auth.session_token`). Atributos: `HttpOnly`, `Secure` en producción, `SameSite=Lax`, `Path=/`.
- **override** `expiresIn: 30 días`, `updateAge: 1 día` (default 7 días). `freshAge` queda en su default de 1 día y lo usa el borrado de cuenta.
- `cookieCache` desactivado: la revocación en base de datos es inmediata en todos los dispositivos.
- Logout revoca la sesión actual; «cerrar sesión en todos los dispositivos» usa `revokeSessions()`; `revokeOtherSessions()` para «cerrar las demás».
- Servidor: `auth.api.getSession({ headers: await headers() })` en páginas y route handlers. En `proxy.ts` solo se comprueba la presencia de la cookie para redirects optimistas; la sesión se valida siempre en el servidor.
- Limite conocido: el token robado vale hasta que expira o se revoca; no hay binding a dispositivo.

### Rate limiting

- `storage: "database"` (**override**), ventana por defecto 100 req/10 s.
- **override** por ruta:
  - `/sign-in/email`: 5 por 60 s
  - `/sign-up/email`: 3 por 60 s
  - `/request-password-reset`: 3 por 60 s
  - `/send-verification-email`: 3 por 60 s
- Clave del límite: `ip|path`. Detrás del proxy inverso hay que configurar `advanced.ipAddress.ipAddressHeaders: ["x-forwarded-for"]` (o `trustedProxies`); sin IP resoluble todos los clientes comparten cubo. El proxy debe sobrescribir `X-Forwarded-For`, no confiar en el que manda el cliente.
- Sin contador de fallos por email en v1: el rate limit es por IP. Un ataque distribuido contra una cuenta concreta no se frena por cuenta. Queda anotado como límite conocido.
- Las llamadas a `auth.api` desde el servidor no pasan por el limitador.

### Borrado de cuenta

- **override** `user.deleteUser.enabled: true`. Hard delete inmediato, sin periodo de gracia.
- Sin `sendDeleteAccountVerification`: el borrado no necesita clic en email.
- Cuentas con contraseña: la UI pide escribir el email y la contraseña. Cuentas solo OAuth: la sesión debe ser fresca (<1 día, `freshAge`); si es más vieja, hay que volver a entrar antes de borrar.
- Better Auth borra `session`, `account` y `user`; las tablas del dominio caen por cascada (`Follow`, `Progress`, `Collection`, `CollectionSeries`). El contenido compartido (Series, Capítulos, Páginas) no se toca.
- Las filas de `verification` no se borran con el Usuario; expiran solas (tokens de reset a 1 hora, estado OAuth de corta vida). No hace falta job de limpieza.
- Respuestas del endpoint: `200 User deleted`; `400 INVALID_PASSWORD`; `400 SESSION_EXPIRED`; `404 CREDENTIAL_ACCOUNT_NOT_FOUND`; `401 UNAUTHORIZED`.

## Esquema

Las tablas de auth siguen la convención del repo: modelos Prisma en inglés, tabla en snake_case plural con `@@map`, campos en camelCase. Better Auth valida nombres de modelo y campos; los nombres físicos de tabla le son indiferentes, así que `@@map("sessions")` y compañía son seguros. Los nombres de modelo (`User`, `Session`, `Account`, `Verification`, `RateLimit`) no se cambian.

| Modelo | Tabla | Notas |
|---|---|---|
| `User` | `users` | `name` NOT NULL; `emailVerified`; `image`; `updatedAt`. `id` sin default |
| `Session` | `sessions` | `token` único; `expiresAt`, `ipAddress`, `userAgent`; FK a `User` con `onDelete: Cascade` |
| `Account` | `accounts` | Identidad por proveedor (`providerId`, `accountId`); `password` guarda el hash Argon2id con `providerId: "credential"`. Unique `(providerId, accountId)` añadido por nosotros (Better Auth no lo exige) |
| `Verification` | `verifications` | Tokens de un solo uso: reset (`reset-password:<token>`) y estado OAuth. Índice por `identifier` |
| `RateLimit` | `rate_limits` | `key` única, `count`, `lastRequest BigInt`. Solo con `storage: "database"` |

Detalles del esquema:

- Los ids de las cinco tablas de auth los genera Better Auth en JS (string de 32 caracteres), sin default en la base. El resto de modelos del dominio conservan `cuid()`.
- `Follow`, `Progress` y `Collection` no cambian: sus FK a `User` ya tienen `onDelete: Cascade`.
- La verificación de email no usa filas de `verification`: es un JWT firmado. `verification` guarda reset y estado OAuth.
- Better Auth no emite unique en `Account(providerId, accountId)`; el nuestro evita identidades duplicadas y no lo rechaza la validación de esquema.

## Configuración

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    password: {
      hash: (password) => hash(password),
      verify: ({ hash: stored, password }) => verify(stored, password),
    },
    sendResetPassword: async ({ user, url }) => { /* Resend */ },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => { /* Resend */ },
  },
  socialProviders: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    discord: { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
  user: { deleteUser: { enabled: true } },
  advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
  plugins: [nextCookies()],
});
```

Variables de entorno:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres |
| `BETTER_AUTH_SECRET` | Firma de tokens; mínimo 32 caracteres |
| `BETTER_AUTH_URL` | URL pública (`https://<dominio>`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth Discord |
| `RESEND_API_KEY` | Envío de email |
| `EMAIL_FROM` | `noreply@send.<dominio>` |

## Email

- **Resend** por API. Enviar desde un **subdominio** (`send.<dominio>`), no desde el dominio raíz: Resend lo recomienda por reputación.
- DKIM y SPF los genera Resend al verificar el dominio; DMARC se añade a mano después.
- `onboarding@resend.dev` solo puede enviar a la dirección de la propia cuenta y es únicamente para la prueba inicial. Producción exige dominio verificado.
- Dos plantillas con React Email, en español: verificación de email y reset de contraseña.
- Plan gratuito: 3.000 emails/mes con tope de 100/día. Con verificación obligatoria, cada registro consume uno.

## Pendientes de pre-lanzamiento

No bloquean la decisión; sí bloquean abrir registro al público.

- Elegir y registrar dominio. `suki.com` (1996) y `suki.net` (1997) están ocupados.
- Verificar `send.<dominio>` en Resend y añadir DMARC.
- Crear las apps OAuth de Google y Discord con redirect URIs HTTPS.
- HTTPS en el VPS y configurar la IP real detrás del proxy para el rate limit.
- Generar `BETTER_AUTH_SECRET` y cargar el resto de variables.

## Riesgos y límites conocidos

- **Breaking changes de Better Auth**: 1.5, 1.6 y 1.7 trajeron cambios incompatibles en doce meses. Fijar `1.7.23` exacta y leer release notes antes de subir.
- **Prisma 8**: el adaptador solo soporta Prisma 5–7. Fijar `prisma@7.10.x`; `npm latest` ya resuelve un RC de 8.
- **Rate limit solo por IP**: no hay contador por cuenta.
- **Sin cambio de email, 2FA ni exportación** en v1.
- **`name` NOT NULL**: el formulario lo rellena con la parte local del email si se deja vacío.
- **Discord sin email**: las cuentas solo-teléfono no pueden registrarse.
- **Vinculación implícita**: fusiona cuentas cuando el email coincide y ambos lados están verificados. Es el comportamiento decidido; si se añade un proveedor que no verifica emails, no marcarlo como confiable.
- **Revocación y transacciones**: sin `transaction: true`, el reset de contraseña puede cambiar la contraseña sin revocar las sesiones.
- **Email**: la entrega depende de la configuración DNS del dominio elegido.

## Checklist de aceptación

- [ ] Registro sin nombre → `User.name` = parte local del email.
- [ ] Login sin verificar → `403 EMAIL_NOT_VERIFIED` y reenvío acotado por rate limit.
- [ ] Abrir el enlace de verificación inicia sesión y vuelve a la página de origen.
- [ ] Reset de contraseña revoca todas las sesiones (con `transaction: true`).
- [ ] Google y Discord crean Usuario; email verificado coincidente vincula; email local sin verificar no vincula.
- [ ] Sesión de 30 días se renueva a los 1 día de uso; «cerrar todas las sesiones» invalida las demás de inmediato.
- [ ] Rate limit: 6.º login en un minuto, 4.º registro, 4.º reset y 4.º reenvío → 429.
- [ ] Borrado con contraseña elimina `user`, `session` y `account`, y cae `Follow`/`Progress`/`Collection`; sesión OAuth vieja → `SESSION_EXPIRED`.
- [ ] Cookies con `HttpOnly`, `Secure` y `SameSite=Lax` en producción.
- [ ] Leer funciona sin sesión; seguir o guardar progreso redirige a login.

## Fuera de alcance v1

- 2FA/TOTP, passkeys, magic links, SMS.
- Cambio de email y exportación de datos.
- Contador de intentos por email.
- Roles y administración.
