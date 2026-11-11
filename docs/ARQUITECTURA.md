# Arquitectura del Content Hub

Para quién es: quien va a programar en el proyecto. Si solo quieres ejecutarlo, ve a
[COMO_EJECUTAR.md](COMO_EJECUTAR.md). El diseño completo y las fases están en
[SDD_Content_Hub.md](SDD_Content_Hub.md); las decisiones con su motivo, en
[DECISIONES.md](DECISIONES.md) (se citan aquí como D-0NN).

Estado: Fase 0 (acceso, roles, seguridad base y CI). Jira, Ecosystem y Crowdin no existen aún;
sus carpetas están vacías a propósito.

## Capas

Las dependencias van en una sola dirección. dependency-cruiser y ESLint lo hacen cumplir en el CI
(`pnpm arch`).

```
presentation ──► application ──► domain
      │               ▲
      └──► infrastructure (implementa los puertos de application)
```

| Capa            | Carpeta              | Qué contiene                                               | No puede importar              |
| --------------- | -------------------- | ---------------------------------------------------------- | ------------------------------ |
| Dominio         | `src/domain`         | Reglas puras: permisos, rutas, sesiones, reglas de usuario | Astro, BD, nada de otras capas |
| Aplicación      | `src/application`    | Casos de uso y puertos (interfaces)                        | Infraestructura, presentación  |
| Infraestructura | `src/infrastructure` | Adaptadores reales (Postgres, OAuth) y fakes en memoria    | Presentación                   |
| Presentación    | `src/presentation`   | Páginas, endpoints, middleware, registro de rutas          | —                              |
| Compartido      | `src/shared`         | `Result`, ids, log. Sin dependencias de capa               | Cualquier capa                 |

Alias de importación: `@domain`, `@application`, `@infrastructure`, `@presentation`, `@shared`.

## Recorrido de una petición

Todo pasa por [middleware.ts](../src/presentation/middleware.ts), en este orden:

1. Se asigna un `X-Request-Id` y se busca la ruta en el registro. **Si no está registrada, 404**
   (denegar por defecto, D-010, D-024).
2. Si el cuerpo declara más de 64 KB, 413 (D-025).
3. Límite de tasa por IP, si la ruta lo declara.
4. Se lee la cookie, se resuelve la sesión (`ResolveSession`) y se decide el acceso con
   `decideAccess`:
   - `unauthenticated`: las páginas redirigen a `/login`; las rutas `/api/` responden 404 vacío.
   - `hidden` (sin permiso): 404 idéntico al de una página inexistente, y se registra
     `authz.denied` en auditoría.
   - `allow`: se aplica el límite de tasa por usuario y se ejecuta la ruta.
5. A la respuesta se le añaden las cabeceras de seguridad ([ACCESO_Y_SEGURIDAD.md](ACCESO_Y_SEGURIDAD.md)).

## Registro de rutas

[routes.ts](../src/presentation/routes.ts) es la **única** lista de rutas. Una integración local de
Astro ([astro-integration.ts](../src/presentation/astro-integration.ts)) las inyecta; por eso
`src/pages/` debe quedar vacío.

| Ruta                 | Tipo | Acceso                 | Límite de tasa     |
| -------------------- | ---- | ---------------------- | ------------------ |
| `/`                  | page | permiso `section.exec` | —                  |
| `/permisos`          | page | permiso `admin.roles`  | —                  |
| `/login`             | page | pública                | —                  |
| `/api/auth/login`    | api  | pública                | 10/min por IP      |
| `/api/auth/start`    | api  | pública                | 20/min por IP      |
| `/api/auth/callback` | api  | pública                | 20/min por IP      |
| `/api/auth/logout`   | api  | autenticada            | —                  |
| `/api/admin/users`   | api  | permiso `admin.roles`  | 30/min por usuario |

## Casos de uso

Cada uno es una clase con una dependencia explícita de puertos (sin globales).

| Caso de uso         | Archivo                                  | Qué hace                                                        |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `SignIn`            | `use-cases/sign-in.ts`                   | Identidad verificada → sesión, solo si la persona está invitada |
| `ResolveSession`    | `use-cases/resolve-session.ts`           | Cookie → `Principal` (usuario + permisos), caduca por tiempo    |
| `SignOut`           | `use-cases/sign-out.ts`                  | Borra la sesión                                                 |
| `InviteUser`        | `use-cases/admin/invite-user.ts`         | Agrega un correo `@holafly.com` con un rol                      |
| `ChangeUserRole`    | `use-cases/admin/change-user-role.ts`    | Cambia el rol; protege la regla de "siempre un Líder"           |
| `SetUserStatus`     | `use-cases/admin/set-user-status.ts`     | Da de baja (revoca sesiones) o reactiva                         |
| `GetAccessOverview` | `use-cases/admin/get-access-overview.ts` | Datos de la página `/permisos`                                  |

Los casos de uso de administración vuelven a comprobar `admin.roles` aunque la ruta ya lo exigió
(defensa en profundidad).

## Puertos y adaptadores

Cada puerto vive en `src/application/ports` y tiene un adaptador real y un **fake en memoria**
(`src/infrastructure/fakes`). Una prueba de contrato exige que ambos se comporten igual (D-018).

| Puerto              | Adaptador real                                         | Fake                        |
| ------------------- | ------------------------------------------------------ | --------------------------- |
| `UserRepository`    | `db/repositories/user-repository.ts`                   | `InMemoryUserRepository`    |
| `RoleRepository`    | `db/repositories/role-repository.ts`                   | en `in-memory-repositories` |
| `SessionRepository` | `db/repositories/session-repository.ts`                | en `in-memory-repositories` |
| `AuditLog`          | `db/repositories/audit-log.ts`                         | en `in-memory-services`     |
| `RateLimiter`       | `db/repositories/rate-limiter.ts`                      | en `in-memory-services`     |
| `TokenService`      | `auth/token-service.ts`                                | en `in-memory-services`     |
| `Clock`             | `SystemClock`                                          | `FakeClock`                 |
| `AuthProvider`      | `auth/local-provider.ts`, `auth/atlassian-provider.ts` | proveedores fake            |

`AuthProvider` tiene dos formas: **directo** (`local`: se escribe el correo, solo desarrollo) y
**redirección** (`atlassian`: OAuth 2.0 con `state` y PKCE).

## Raíz de composición

Los casos de uso se arman en un solo sitio (D-013):

- [compose.ts](../src/infrastructure/compose.ts): `composeApp(db, env, clock)` con los adaptadores reales.
- [fakes/compose-fakes.ts](../src/infrastructure/fakes/compose-fakes.ts): `composeFakeApp` con los fakes.
- [container.ts](../src/infrastructure/container.ts): `getApp()` valida el entorno, abre la BD, aplica
  la semilla y guarda la instancia. Si el arranque falla, **no** guarda la promesa: la siguiente
  petición reintenta (D-032).

## Modelo de datos

Esquema en [schema.ts](../src/infrastructure/db/schema.ts); migraciones en
`src/infrastructure/db/migrations`.

| Tabla               | Para qué                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- |
| `role`              | Roles como datos (Líder y Colaborador son de sistema)                                   |
| `permission`        | Catálogo fijo de claves de permiso, poblado desde el dominio                            |
| `role_permission`   | Qué permisos tiene cada rol (`granted`)                                                 |
| `app_user`          | Persona invitada: correo en minúsculas, rol, estado (`invitado`/`activo`/`desactivado`) |
| `session`           | Sesión opaca; el `id` es el hash SHA-256 de la cookie                                   |
| `audit_log`         | Auditoría de solo inserción (un trigger rechaza UPDATE, DELETE y TRUNCATE)              |
| `webhook_event`     | Para Jira y Crowdin (Fases 1 y 4). Índice único `(source, delivery_id)`                 |
| `rate_limit_bucket` | Contadores de ventana fija compartidos entre instancias                                 |

Identificadores UUID v7 (D-007). Todas las fechas en UTC.

## Cómo hacer cambios habituales

**Agregar una página o endpoint**

1. Crea el archivo en `src/presentation/pages` o `src/presentation/api`.
2. Regístralo en `ROUTES` con su `access` (obligatorio, no hay valor por defecto) y, si es de
   escritura o pública, un `rateLimit`. Agrega `menuLabel` si debe salir en el menú.
3. Añade a `tests/unit/route-registry.test.ts` y a la matriz de autorización lo que corresponda.

**Agregar un permiso**

1. Añádelo a `PERMISSION_CATALOG` en `src/domain/access/permissions.ts`.
2. Decide si es solo del Líder (`LEADER_ONLY_PERMISSIONS`).
3. La semilla lo inserta en el catálogo al arrancar. Los permisos por defecto de un rol solo se
   escriben cuando el rol se crea (D-020), así que para roles existentes se asigna desde `/permisos`.

**Agregar un puerto**

1. Define la interfaz en `src/application/ports`.
2. Escribe el adaptador real y el fake en `src/infrastructure`.
3. Conéctalos en `compose.ts` y `compose-fakes.ts`.
4. Añade el caso a `tests/integration/port-contracts.test.ts` para que ambos se verifiquen igual.

**Cambiar el esquema**

1. Edita `schema.ts`.
2. `pnpm db:generate` crea la migración. Revísala antes de confirmarla.
3. `pnpm db:migrate` la aplica en tu base local.
4. Anota la decisión en `DECISIONES.md` si no es trivial.

## Reglas que el CI hace cumplir

- Sin `any`; en las fronteras se usa `unknown` y Zod.
- La configuración solo se lee en `src/infrastructure/config`; nunca `process.env` en otro sitio.
- Cobertura mínima de 90 % en `src/domain`.
- Formato, ESLint con cero advertencias, tipos (`astro check`) y reglas de capas.
