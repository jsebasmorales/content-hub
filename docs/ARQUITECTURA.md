# Arquitectura del Content Hub

Para quién es: quien va a programar en el proyecto. Si solo quieres ejecutarlo, ve a
[COMO_EJECUTAR.md](COMO_EJECUTAR.md). El diseño completo y las fases están en
[SDD_Content_Hub.md](SDD_Content_Hub.md); las decisiones con su motivo, en
[DECISIONES.md](DECISIONES.md) (se citan aquí como D-0NN).

Estado: Fase 1 (Jira y dashboard) sobre la base de la Fase 0 (acceso, roles, seguridad y CI). Ecosystem
y Crowdin no existen aún; sus carpetas están vacías a propósito.

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

## La capa de presentación (diseño)

El aspecto vive en `src/presentation` y se rige por [DESIGN.md](DESIGN.md) (decisiones D-067 a D-076).

| Pieza                                            | Qué es                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles/tokens.css`                              | **El único sitio con colores, radios y sombras.** Primitivas Volare y capa semántica con `light-dark()`                                                                   |
| `styles/base.css`, `shell.css`, `components.css` | Tipografía y formularios; marco (navegación, barra superior); componentes. Solo usan la capa semántica                                                                    |
| `components/*.astro`                             | Componentes sin JavaScript: `KpiCard`, `SlaCard`, `ChartCard`, `StatusChip`, `FilterBar`, `DataTable`, `Pager`, `EmptyState`, `Tooltip`, `Icon`, gráficos SVG de servidor |
| `icons.ts`                                       | Los iconos SVG propios (sin fuente ni librería de iconos)                                                                                                                 |
| `navigation.ts`, `routes.ts`                     | El menú se arma en el servidor a partir de `ROUTES` (`menuGroup`, `menuIcon`) y **un grupo sin entradas visibles no se dibuja**                                           |
| `layouts/BaseLayout.astro`                       | Marco de toda página; recibe `sync` (estado de Jira) de la página y muestra "Datos al ‹hora›" y los avisos                                                                |

Reglas: las páginas y componentes **no escriben colores, radios ni sombras** (lo comprueba
`pnpm check:design`, también en el CI); la navegación móvil y los menús usan el atributo `popover` del
navegador, así que no hay JavaScript de cliente (presupuesto de SDD §12); un enlace dentro de una página
solo se dibuja si la persona puede abrir su destino (SDD §10.3). Los gráficos son SVG de servidor y los
tamaños que dependen del ancho se dan como porcentajes en atributos, porque el CSP no permite `style=`.

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

| Puerto              | Adaptador real                                                                  | Fake                        |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| `UserRepository`    | `db/repositories/user-repository.ts`                                            | `InMemoryUserRepository`    |
| `RoleRepository`    | `db/repositories/role-repository.ts`                                            | en `in-memory-repositories` |
| `SessionRepository` | `db/repositories/session-repository.ts`                                         | en `in-memory-repositories` |
| `AuditLog`          | `db/repositories/audit-log.ts`                                                  | en `in-memory-services`     |
| `RateLimiter`       | `db/repositories/rate-limiter.ts`                                               | en `in-memory-services`     |
| `TokenService`      | `auth/token-service.ts`                                                         | en `in-memory-services`     |
| `Clock`             | `SystemClock`                                                                   | `FakeClock`                 |
| `AuthProvider`      | `auth/local-provider.ts`, `auth/atlassian-provider.ts`                          | proveedores fake            |
| `JiraGateway`       | `jira/jira-gateway.ts` (solo lee, reintentos y límite de salida)                | `FakeJiraGateway`           |
| `IssueRepository`   | `db/repositories/issue-repository.ts`                                           | `InMemoryIssueRepository`   |
| `SyncRunRepository` | `db/repositories/sync-run-repository.ts`                                        | `InMemorySyncRunRepository` |
| `SyncLock`          | `db/repositories/sync-lock.ts` (candado con caducidad)                          | `InMemorySyncLock`          |
| `SyncLauncher`      | `netlify/http-sync-launcher.ts`, `inline-sync-launcher.ts` (solo en desarrollo) | `FakeSyncLauncher`          |
| `LearnedRepository` | `db/repositories/learned-repository.ts`                                         | `InMemoryLearnedRepository` |

`AuthProvider` tiene dos formas: **directo** (`local`: se escribe el correo, solo desarrollo) y
**redirección** (`atlassian`: OAuth 2.0 con `state` y PKCE).

## Raíz de composición

Los casos de uso se arman en un solo sitio (D-013):

- [compose.ts](../src/infrastructure/compose.ts): `composeApp(db, env, clock)` con los adaptadores reales.
- [fakes/compose-fakes.ts](../src/infrastructure/fakes/compose-fakes.ts): `composeFakeApp` con los fakes.
- [container.ts](../src/infrastructure/container.ts): `getApp()` valida el entorno, abre la BD, aplica
  la semilla y guarda la instancia. Si el arranque falla, **no** guarda la promesa: la siguiente
  petición reintenta (D-032).

## Jira y el dashboard (Fase 1)

Jira es la fuente de verdad y el Hub guarda una **copia de solo lectura** (D-034: sin webhooks).

```
Jira ──► JiraGateway ──► RunJiraSync ──► tablas jira_* ──► casos de uso (Get…) ──► páginas
              ▲               │                                   ▲
   función en segundo plano   └─ sync_run, sync_lock              dominio puro: SLA, periodos,
   (Netlify) o CLI                                                capacidad, resúmenes
```

- **Cómo se pide un sync** (D-035): al abrir una página con datos de más de 15 minutos (como máximo
  uno cada 5), o con el botón de un Líder. Ninguno espera a Jira: lanzan la función
  `sync-jira-background` (D-048), protegida por `SYNC_TRIGGER_SECRET`, que responde 202 al instante.
  Si **lanzar** falla se anota como ejecución fallida (visible en `/estado`) y rige el mismo límite de 5
  minutos.
- **Dominio** (`src/domain/jira`): funciones puras sin base de datos ni red: `sla`, `sla-compliance`,
  `sla-report`, `sla-breaches`, `report-period`, `quarter`, `quarterly`, `capacity`,
  `summary-report`, `executive-summary`, `task-list`, `data-quality`. Cada regla tiene su prueba.
- **Casos de uso** (`src/application/use-cases/jira`): uno por página (`GetSlaReport`,
  `GetCapacity`…). Cada uno **vuelve a comprobar el permiso** de su sección además de la ruta.
- **"Lo aprendido"** es lo único que escribe una persona en esta fase: `src/domain/learned`,
  `src/application/use-cases/learned` y la tabla `learned_entry` (solo inserción).
- **Comprobar contra Jira:** `pnpm compare:jira [--all]` ([PRUEBAS.md](PRUEBAS.md), D-063).

## Modelo de datos

Esquema en [schema.ts](../src/infrastructure/db/schema.ts); migraciones en
`src/infrastructure/db/migrations`.

| Tabla                    | Para qué                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `role`                   | Roles como datos (Líder y Colaborador son de sistema)                                     |
| `permission`             | Catálogo fijo de claves de permiso, poblado desde el dominio                              |
| `role_permission`        | Qué permisos tiene cada rol (`granted`)                                                   |
| `app_user`               | Persona invitada: correo en minúsculas, rol, estado (`invitado`/`activo`/`desactivado`)   |
| `session`                | Sesión opaca; el `id` es el hash SHA-256 de la cookie                                     |
| `audit_log`              | Auditoría de solo inserción (un trigger rechaza UPDATE, DELETE y TRUNCATE)                |
| `webhook_event`          | Para Crowdin (Fase 4). Jira no usa webhooks (D-034). Índice único `(source, delivery_id)` |
| `rate_limit_bucket`      | Contadores de ventana fija compartidos entre instancias                                   |
| `jira_issue`             | Copia de cada ticket de Jira (solo nombres de personas, nunca correos, D-045)             |
| `jira_status_transition` | Historial de estados de cada ticket                                                       |
| `jira_sla_cycle`         | Cada ciclo de SLA de cada ticket, tal como lo calcula Jira                                |
| `sync_run`               | Una fila por ejecución del sync (cuándo, cómo empezó, resultado, tickets, error)          |
| `sync_lock`              | Candado con caducidad: solo un sync a la vez entre todas las instancias                   |
| `learned_entry`          | Versiones de "Lo aprendido"; solo inserción (trigger y privilegios, D-061)                |

Identificadores UUID v7 (D-007). Todas las fechas en UTC.

## Cómo hacer cambios habituales

**Agregar una página o endpoint**

1. Crea el archivo en `src/presentation/pages` o `src/presentation/api`.
2. Regístralo en `ROUTES` con su `access` (obligatorio, no hay valor por defecto) y, si es de
   escritura o pública, un `rateLimit`. Si debe salir en el menú, agrega `menuLabel`, `menuGroup` y
   `menuIcon` (los tres a la vez). Si es una página con datos de Jira, entrega `sync` a `BaseLayout`.
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
- Ningún color, radio ni sombra fuera de `tokens.css`, y contraste WCAG AA de los tokens (`pnpm check:design`).
- Formato, ESLint con cero advertencias, tipos (`astro check`) y reglas de capas.
