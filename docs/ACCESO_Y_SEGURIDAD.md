# Acceso y seguridad

Para quién es: quien programa, revisa seguridad o administra el Hub. Contrato de diseño:
SDD §10 (roles) y §11 (seguridad). Decisiones con su motivo: [DECISIONES.md](DECISIONES.md).

## Quién puede entrar

Solo personas **invitadas** por un Líder, con correo del dominio permitido (`ALLOWED_EMAIL_DOMAIN`,
hoy `holafly.com`). Atlassian solo prueba quién es la persona; **la autorización la decide el Hub**
(D-033).

Al iniciar sesión se comprueba, en este orden (`SignIn`):

1. El correo pertenece al dominio permitido. Si no: `domain-not-allowed`.
2. Existe en la lista de invitados. Si no: `not-invited`.
3. No está desactivada. Si lo está: `deactivated`.

La persona nunca ve el motivo (siempre el mismo mensaje genérico). El motivo queda en auditoría como
`auth.login_denied`.

### Primer Líder

Si el correo coincide con `BOOTSTRAP_LEADER_EMAIL` y **no existe ningún Líder activo**, se crea o
promueve a esa persona como Líder y se registra `auth.bootstrap_leader` (D-019). Si ya hay un Líder
activo, esa variable deja de tener efecto. También sirve para recuperar el acceso si todos los
Líderes quedaran fuera.

## Proveedores de acceso (`AUTH_PROVIDER`)

| Valor       | Cuándo               | Cómo funciona                                                                             |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `local`     | Solo desarrollo      | Se escribe el correo; no hay contraseña. **Prohibido en producción** (la app no arranca). |
| `atlassian` | Producción y pruebas | OAuth 2.0 (3LO) con `state` y PKCE S256. Scope `read:me`.                                 |

Flujo `atlassian`:

1. `/api/auth/start` genera `state` y `code_verifier`, los guarda en cookies de vida corta y
   redirige a Atlassian.
2. Atlassian devuelve a `/api/auth/callback?code=…&state=…`.
3. Se comprueba que el `state` coincide con la cookie, se canjea el `code` (con el secreto de
   cliente y el verificador PKCE) y se obtiene el perfil.
4. Si el perfil no trae correo, el acceso se rechaza (`email-unavailable`).
5. `SignIn` aplica las reglas de arriba y crea la sesión.

Configurar la app de Atlassian: [COMO_EJECUTAR.md](COMO_EJECUTAR.md), sección "Acceso con Atlassian".

## Roles y permisos

- Roles: **Líder** y **Colaborador** (de sistema). Son datos en BD, no código (SDD §10.1).
- Los permisos son un catálogo fijo; el Líder los asigna pero no crea nuevos.

| Tipo      | Claves                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Secciones | `section.exec`, `summary`, `eco`, `work`, `sla`, `breach`, `goals`, `capacity`, `qoq`, `learn`, `defs` |
| Acciones  | `action.sync`, `action.ecoedit`, `action.learnedit`                                                    |
| Admin     | `admin.roles` (solo Líder; no se puede conceder a otro rol)                                            |

Valores por defecto: el Líder tiene todo lo asignable; el Colaborador, las secciones **salvo `section.learn`**: "Lo aprendido" es la página del Líder y escribir en ella pide además `action.learnedit` (D-001, D-061). Los valores por defecto se escriben **una sola vez, al crear el rol**, así que una base de datos que ya existía se corrige con la migración `0006_learned_leader_only`.

### Reglas de administración

- Solo `admin.roles` accede a `/permisos`.
- Siempre debe quedar **al menos un Líder activo**, y un Líder **no puede degradarse ni darse de
  baja a sí mismo**.
- Convertir a alguien en Líder exige marcar una casilla de confirmación.
- Dar de baja revoca **todas** sus sesiones al instante. Reactivar la deja como `invitado` y debe
  iniciar sesión de nuevo (D-027).
- Pendiente (D-031): hoy la regla "siempre un Líder" se comprueba y luego se escribe sin bloqueo;
  dos Líderes que se degraden a la vez podrían dejar el sistema sin Líder. El correo de bootstrap
  permite recuperarse. Está planeado resolverlo en la base de datos.

## "Ocultar, no bloquear"

Lo que un perfil no puede ver **no aparece en el menú** y responde **404**, igual que una página que
no existe. Nunca 403: así no se revela qué rutas existen (SDD §10.3, D-024). Los intentos de una
persona con sesión se registran como `authz.denied`.

## Lo que escribe una persona

| Qué                       | Dónde se guarda                                       | Permiso                                            | Protección                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Lo aprendido" (D-061)    | Tabla `learned_entry`                                 | Ver: `section.learn`; escribir: `action.learnedit` | Solo inserción: un trigger y la falta de privilegios del rol de ejecución rechazan UPDATE, DELETE y TRUNCATE. Se muestra siempre como texto, nunca como HTML. Token anti-CSRF |
| Zona horaria (D-062)      | `app_user.time_zone`, una de las 6 zonas de la lista  | Tener sesión (solo la propia cuenta)               | Se rechaza cualquier zona fuera de la lista; token anti-CSRF; si la guardada deja de existir, se usa Bogotá                                                                   |
| Tema claro/oscuro (D-053) | Cookie `hub_theme` del navegador (`httpOnly`, un año) | Tener sesión                                       | Valor de una lista cerrada; token anti-CSRF; la dirección de vuelta solo puede ser una página registrada                                                                      |

La zona horaria cambia cómo se **muestran** las horas, nunca las cifras: los meses y los trimestres
se agrupan siempre en hora de Bogotá.

## Sesiones

| Parámetro                 | Valor                                                   |
| ------------------------- | ------------------------------------------------------- |
| Duración absoluta         | 12 horas                                                |
| Inactividad               | 60 minutos                                              |
| Renovación de `last_seen` | como máximo una vez por minuto                          |
| Token                     | Aleatorio y opaco; en BD solo se guarda su hash SHA-256 |
| Nuevo token por login     | Sí (evita fijación de sesión)                           |

Cookie (D-022): `__Host-hub_session` con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` cuando
`PUBLIC_APP_URL` es https; `hub_session` en http local. Los permisos nunca viajan en la cookie.

## Protecciones de la aplicación

| Control                | Detalle                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Denegar por defecto    | Ruta no registrada = 404                                                                                |
| CSRF                   | `checkOrigin` de Astro y token por formulario (`_csrf`) ligado a la sesión                              |
| Límite de tasa         | En Postgres, ventana fija (tabla de rutas en [ARQUITECTURA.md](ARQUITECTURA.md)); 429 con `Retry-After` |
| Tamaño de cuerpo       | 64 KB; también se corta la lectura de cuerpos sin `Content-Length`                                      |
| Validación de entradas | Zod en cada frontera; `unknown`, nunca `any`                                                            |
| Auditoría              | Solo inserción, reforzada con trigger en la BD                                                          |
| Config en producción   | Rechaza `local`, la BD embebida y conexiones sin `sslmode=require`                                      |

### Cabeceras de seguridad (en toda respuesta)

`Content-Security-Policy` (`frame-ancestors 'none'`, `base-uri`, `form-action`, `object-src`),
`Strict-Transport-Security` (1 año), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva,
`Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin`,
`Cache-Control: private, no-store`, `Vary: Cookie`.

La CSP de scripts y estilos la genera Astro con hashes (sin `unsafe-inline`) en una etiqueta
`<meta>`. No se emite en desarrollo y no se puede probar en local, por eso existe
`pnpm verify:deploy` (D-026).

## Eventos de auditoría

| Acción                                  | Cuándo                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `auth.login`                            | Inicio de sesión correcto                                                                            |
| `auth.login_denied`                     | Acceso rechazado, con el motivo                                                                      |
| `auth.bootstrap_leader`                 | Se creó o promovió al primer Líder                                                                   |
| `auth.logout`                           | Cierre de sesión                                                                                     |
| `authz.denied`                          | Una persona con sesión pidió una ruta que no puede ver (máx. 5 filas por usuario y ruta cada minuto) |
| `user.invited`                          | Invitación                                                                                           |
| `user.role_changed`                     | Cambio de rol, con rol anterior y nuevo                                                              |
| `user.deactivated` / `user.reactivated` | Baja o reactivación                                                                                  |
| `sync.manual_requested`                 | Se pulsa "Resincronizar con Jira" (quién y si se pudo lanzar)                                        |
| `learned.saved`                         | El Líder guarda una versión de "Lo aprendido" (quién, trimestre y longitud; **no** el texto)         |

Cada fila guarda quién (`actor_id`), qué, sobre quién, estado antes y después, IP y fecha.

## Revisión de seguridad antes de producción

Pendientes que deben cerrarse antes del primer despliegue (ver
[runbooks/DESPLIEGUE.md](runbooks/DESPLIEGUE.md)):

- D-030: `netlify.toml`, migraciones en el despliegue y dos roles de BD (migración y ejecución).
- D-031: bloqueo en la base de datos para la regla de "siempre un Líder".
- Correo `@holafly.com` confirmado con 2 o 3 compañeros (SDD §17, pendiente 2).
- App OAuth y Callback URL **de producción** (distinta de la local).
- `pnpm verify:deploy` contra el sitio desplegado.
- Cuenta de Netlify y revisión de los términos del plan (SDD §17, pendiente 1).
