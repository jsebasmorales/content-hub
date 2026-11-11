# Decisiones (mini-ADR)

Registro de decisiones no cubiertas por el SDD (sección 0, punto 4 y sección 3, regla 8).
Estado: `aprobada` = confirmada por Sebas; `revisar` = a confirmar; `pendiente` = aprobada pero bloqueada por un dato externo; `informativo` = no es una decisión, solo deja constancia.

## Fase 0

### D-001 · Permisos por defecto de los roles — aprobada

- **Opción:** Líder tiene todos los permisos. Colaborador tiene todos los `section.*` y ningún `action.*` ni `admin.roles`.
- **Motivo:** El SDD define el catálogo pero no los valores iniciales. Esta opción es la más restrictiva que aún permite trabajar; el Líder amplía desde `/permisos`.

### D-002 · Permiso de la ruta `/` en Fase 0 — aprobada

- **Opción:** `/` es un placeholder protegido por `section.exec` (§5).
- **Motivo:** El dashboard real llega en la Fase 1; se mantiene el permiso final para no rehacer el registro de rutas.

### D-003 · Comportamiento sin sesión — aprobada

- **Opción:** Las páginas redirigen a `/login`; las rutas `/api/*` responden 404 sin cuerpo.
- **Motivo:** §10.3 pide 404 para lo no permitido. Redirigir a login es lo esperado por una persona sin sesión; en API no se revela nada.

### D-004 · Adaptador de acceso `local` — aprobada

- **Opción:** Solo opera con `NODE_ENV !== 'production'` y `AUTH_PROVIDER=local`. Si se configura en producción, la app no arranca.
- **Motivo:** Evitar que el acceso de desarrollo sea una puerta trasera en producción.

### D-005 · Variables de entorno opcionales en Fase 0 — aprobada

- **Opción:** Requeridas desde ya: `DATABASE_URL`, `SESSION_SECRET`, `ALLOWED_EMAIL_DOMAIN`, `BOOTSTRAP_LEADER_EMAIL`, `PUBLIC_APP_URL`, `AUTH_PROVIDER`. Atlassian, Jira, Crowdin, Blobs e Ingest son opcionales y pasan a obligatorias cuando su fase se active.
- **Motivo:** Aún no existen esas cuentas/credenciales (SDD §17, pendientes 2–4). Exigirlas bloquearía el arranque sin aportar seguridad.

### D-006 · Driver de base de datos — aprobada

- **Opción:** Drizzle sobre Postgres estándar. Local y pruebas: PGlite (Postgres embebido, sin Docker). Producción: Postgres administrado (Netlify DB / Neon). Se elige por configuración (`DATABASE_URL`); `docker-compose.yml` queda listo para un Postgres en contenedor.
- **Motivo:** Docker no está instalado en el equipo de desarrollo. Al ser Postgres estándar, migrar de hosting es cambiar la cadena de conexión.
- **Enmienda (revisión de arquitectura):** PGlite tiene una sola conexión, así que no puede detectar carreras (D-031) ni probar el driver `pg` con TLS. El SDD §13 pedía Postgres real; el CI es Linux y sí puede darlo. **Hecho:** el job `postgres` de CI repite `test:integration` contra un Postgres 17 real (ver D-031). Falta comprobar el driver con TLS de Neon, que solo se puede hacer con la base real (D-030).

### D-007 · Identificadores UUID v7 — aprobada

- **Opción:** Paquete `uuid` (v7).
- **Motivo:** Node no trae UUID v7 nativo; el SDD (§4) lo exige.

### D-008 · Alcance del pipeline de CI en Fase 0 — aprobada

- **Opción:** Instalar → lint → `astro check` → dependency-cruiser → unitarias → integración → build → e2e → seguridad (gitleaks, audit). Quedan fuera Lighthouse y "publicar imagen".
- **Motivo:** Aún no hay páginas que medir y Netlify despliega sin imagen de contenedor. Se añaden en las fases 1 y 5.

### D-009 · Gestor de paquetes — aprobada

- **Opción:** pnpm, instalado con `npm i -g pnpm` (sin `corepack enable`, que requiere administrador en Windows).
- **Motivo:** El SDD usa scripts `pnpm`; evita pedir permisos de administrador.

### D-010 · Ubicación de páginas y endpoints — aprobada

- **Opción:** Astro fija `src/pages` como carpeta de rutas, pero el SDD (§3) pide `presentation/pages` y `presentation/api`. Las rutas viven en `src/presentation/` y se registran en un único registro (`src/presentation/routes.ts`) que una integración local de Astro inyecta con `injectRoute`. `src/pages/` se deja vacío y una prueba falla si aparece algún archivo dentro.
- **Motivo:** Respeta la estructura del SDD y hace imposible tener una ruta sin permiso declarado: el registro exige el permiso de cada ruta (§11.2, "denegar por defecto").

### D-011 · pnpm y scripts de instalación — aprobada

- **Opción:** `pnpm-workspace.yaml` autoriza solo `esbuild` para ejecutar scripts de instalación (`allowBuilds`).
- **Motivo:** pnpm 12 bloquea por defecto los scripts de dependencias (protección de cadena de suministro, §11.2). Se autoriza solo lo imprescindible.

### D-012 · TypeScript 6.x en lugar de 7.0 — aprobada

- **Opción:** TypeScript fijado en la serie 6.x (versión exacta en `package.json`).
- **Motivo:** typescript-eslint no soporta TypeScript 7.0 todavía (incompatibilidad confirmada al ejecutar ESLint). Se revisa cuando typescript-eslint publique soporte.

### D-013 · Raíz de composición — aprobada

- **Opción:** `src/infrastructure/container.ts` es el único módulo de infraestructura que `presentation` puede importar (conecta casos de uso con adaptadores reales). dependency-cruiser y ESLint lo imponen.
- **Motivo:** El SDD define presentation → application → domain pero las páginas necesitan casos de uso ya cableados; sin un punto único de cableado habría imports dispersos hacia infraestructura.

### D-014 · Dónde se valida el entorno — aprobada

- **Opción:** Doble capa. (1) `env.schema` en `astro.config.mjs` tipa cada variable con `astro:env`. (2) `infrastructure/config/env.ts` valida reglas cruzadas con Zod (`env-rules.ts`) al importarse, es decir, al primer arranque del servidor / cold start. La compilación (`astro build`) no exige las variables.
- **Motivo:** Astro solo valida secretos cuando se leen; las reglas cruzadas (dominio del líder, `local` prohibido en producción, Atlassian completo) no caben en el esquema de Astro. No exigir secretos en el build permite compilar previews sin datos reales (SDD §11.2). Los mensajes de error nunca incluyen valores.

### D-015 · Driver de Postgres en producción: `pg` con TLS obligatorio — aprobada

- **Opción:** `pg` (node-postgres) con la cadena de conexión _pooled_ de Netlify DB / Neon. Local y pruebas: PGlite. En producción la configuración **rechaza** la base embebida y exige `sslmode=require` (o `verify-*`) salvo en localhost. Pool pequeño (5 conexiones), cierre de inactivas a 10 s, espera de conexión de 5 s y `statement_timeout` de 15 s.
- **Motivo:** El SDD pide "driver serverless" (§2). `pg` funciona en Netlify Functions con el endpoint con pooler, soporta las transacciones que necesitan las reglas de "siempre un Líder" y es portable a otro hosting o a Docker. Se mantiene la revisión con pruebas de carga en la Fase 5; si hubiera problemas de conexiones, se cambia solo `client.ts` a `@neondatabase/serverless`.
- **Enmienda (revisión de arquitectura):** el pool registra `pool.on('error')`. Neon cierra conexiones inactivas y, sin ese manejador, el evento es una excepción no capturada que puede tumbar la función. **Hecho.** El rol de BD separado para migrar y operar está en D-030.

### D-016 · Unicidad de `webhook_event.delivery_id` — aprobada

- **Opción:** Índice único compuesto `(source, delivery_id)`.
- **Motivo:** El SDD dice "único"; con dos orígenes (Jira y Crowdin) un identificador podría coincidir entre ellos. La idempotencia por origen es equivalente y más segura.

### D-017 · Tabla `permission` y `audit_log` — aprobada

- **Opción:** `permission` es un catálogo (`key`) poblado desde el dominio. `audit_log` es de solo inserción mediante trigger en la propia base de datos (rechaza UPDATE, DELETE y TRUNCATE); la retención ≥ 1 año (§11.2) se hará con un rol de mantenimiento en una fase posterior.
- **Motivo:** §4.3 y §11.2 piden inmutabilidad; hacerla cumplir en la base de datos evita que un error de código la rompa.
- **Enmienda (revisión de arquitectura):** el trigger solo protege mientras el rol que opera la app no pueda quitarlo. Se exige un rol de ejecución sin permisos DDL ni propiedad de las tablas (D-030).

### D-018 · Fakes de los puertos — aprobada (regla cumplida)

- **Opción:** Cada puerto tiene su adaptador real y un fake en `src/infrastructure/fakes/` (repositorios, auditoría, tokens, reloj, límite de tasa y proveedores de acceso). La función `wireApp` arma los mismos casos de uso con cualquiera de los dos. Las suites de comportamiento corren contra **ambos** (Postgres real y fakes) y una prueba de contrato comprueba que se comportan igual.
- **Motivo:** SDD §3, regla 7. Si un fake se desvía del adaptador real, las pruebas de contrato fallan.

### D-019 · Bootstrap del primer Líder al iniciar sesión — aprobada

- **Opción:** Al iniciar sesión, si el correo coincide con `BOOTSTRAP_LEADER_EMAIL` y no existe ningún Líder activo, se crea (o se promueve) a ese usuario como Líder y se registra en auditoría. Si ya hay un Líder activo, el correo de bootstrap deja de tener efecto.
- **Motivo:** El SDD (§10.2) lo define como "válida solo mientras no exista ningún Líder" sin precisar el momento. Hacerlo en el login evita procesos de arranque con efectos secundarios.

### D-020 · Semilla de roles y permisos — aprobada

- **Opción:** `seedAccessData` (idempotente) crea el catálogo de permisos y los roles Líder y Colaborador con los permisos por defecto (D-001). Se ejecuta en `pnpm db:migrate` y al arrancar la app. Los permisos por defecto solo se escriben al crear el rol, para no pisar cambios hechos luego por un Líder.
- **Motivo:** Garantiza que las tablas siempre tengan los datos mínimos sin intervención manual.

### D-021 · Proveedor Atlassian: PKCE por verificar — verificado en local (ver D-033)

- **Opción:** El adaptador envía `code_challenge` (S256) y `code_verifier` además de `state`, como pide el SDD §11.2. Está implementado y probado con red simulada.
- **Motivo:** La documentación pública de Atlassian 3LO no confirma que acepte PKCE para este tipo de app. Si Atlassian lo rechaza, se mantiene `state` + secreto de cliente y se retira PKCE.
- **Estado:** la verificación con la app real se registró en D-033.

### D-022 · Cookie de sesión — aprobada

- **Opción:** Cookie `__Host-hub_session` (HttpOnly, Secure, SameSite=Lax, Path=/) cuando `PUBLIC_APP_URL` es https; `hub_session` en http local. Solo guarda el token opaco; los permisos nunca van en la cookie.
- **Motivo:** El prefijo `__Host-` impide que otro subdominio la sobrescriba; en http local los navegadores rechazan `Secure`.

### D-023 · Límite de tasa, CSP y cabeceras — aprobada

- **Opción:** (1) Tabla `rate_limit_bucket` (ventana fija) en Postgres; no figura en §4.3 pero §11.2 exige un contador en BD. Cada ruta declara su límite en el registro (`routes.ts`): login 10/min por IP, inicio OAuth 20/min por IP, administración 30/min por usuario. (2) CSP con la función integrada de Astro (hashes, sin `unsafe-inline`) en una etiqueta `<meta>`, más una cabecera con `frame-ancestors 'none'`, `base-uri`, `form-action` y `object-src`, que `<meta>` no puede expresar. El SDD pide "nonces"; los hashes de Astro logran lo mismo sin `unsafe-inline`. (3) Cache-Control por defecto `private, no-store`.
- **Motivo:** §11.2 y §2 ("activar la CSP integrada de Astro si la versión la ofrece"). Limitar solo rutas sensibles evita una escritura en BD por cada visita.
- **Enmienda (revisión de arquitectura):** la ventana fija permite hasta el doble de la tasa en el cruce de dos ventanas; es aceptable para login y administración. Los registros `authz.denied` (D-024) tienen su propio tope: **5 filas de auditoría por usuario (o IP) y ruta cada minuto**. Pasado el tope la respuesta sigue siendo 404 y solo se omite la fila (queda la línea de log). **Hecho** en `security/denied-audit.ts`, con prueba (`tests/integration/denied-audit.test.ts`). Las peticiones anónimas sin IP conocida comparten un solo tope por ruta: el tope protege la tabla y Netlify siempre entrega la dirección del cliente.

### D-024 · 404 uniforme para todo lo no declarado — aprobada

- **Opción:** El middleware responde con la misma página 404 (y cuerpo vacío en `/api/`) a rutas inexistentes, rutas no registradas y rutas ocultas por permisos. Los intentos denegados de usuarios con sesión se registran en `audit_log` (`authz.denied`).
- **Motivo:** §10.3: no se debe poder distinguir "no existe" de "no tienes permiso".

### D-025 · Tamaño máximo de cuerpo — aprobada

- **Opción:** 64 KB para cualquier petición que no sea GET/HEAD/OPTIONS (413 si lo supera según `Content-Length`). Los webhooks (1 MB, §11.2) tendrán su propio límite cuando existan en la Fase 1.
- **Motivo:** §11.2 exige límites de tamaño de cuerpo; en Fase 0 solo hay formularios pequeños.
- **Enmienda (revisión de arquitectura):** `Content-Length` lo declara el cliente y un cuerpo por trozos lo evita. `readForm` ahora corta la lectura al llegar a 64 KB, sin confiar en la cabecera. **Hecho**, con prueba.

### D-026 · CSP de producción — aprobada (con verificación posterior)

- **Opción:** Se activa `security.csp` de Astro (hashes, sin `unsafe-inline`). Astro no la emite en desarrollo y `astro preview` no existe con el adaptador de Netlify, así que no se puede comprobar en local. Para no depender de ella: (1) `build.inlineStylesheets: 'never'` hace que el CSS sea siempre un archivo, nunca `<style>` en línea; (2) el middleware envía por cabecera `frame-ancestors`, `base-uri`, `form-action` y `object-src`; (3) `pnpm verify:deploy <https://sitio>` comprueba en el sitio desplegado las cabeceras y que la etiqueta CSP exista, sin `unsafe-inline`. **Debe ejecutarse tras el primer despliegue** y forma parte de la revisión de seguridad (§11.3).
- **Motivo:** Limitación de herramientas, no de diseño. Las páginas actuales no cargan JavaScript, por lo que el riesgo es bajo, y el verificador convierte la comprobación en un paso repetible.

### D-027 · Administración de usuarios en Fase 0 — aprobada

- **Opción:** `/permisos` permite invitar un correo, cambiar el rol y dar de baja / reactivar a una persona (las bajas revocan las sesiones al instante). La matriz rol × permiso con vista previa (§10.2) queda para la Fase 2, como indica la §16. Cambiar a Líder exige marcar una casilla de confirmación. Una persona reactivada vuelve al estado "invitado" y debe iniciar sesión de nuevo.
- **Motivo:** El alcance de la Fase 0 pide "invitar un correo y asignar rol"; la baja es necesaria para cumplir §11.2 (sesiones revocadas al desactivar).

### D-028 · Script `build` en Windows — informativo

- **Opción:** `astro build` falla al final en Windows (EPERM al crear enlaces simbólicos) a menos que esté activado el _Modo de desarrollador_ de Windows. En Linux (CI y Netlify) funciona. El desarrollo diario usa `pnpm dev` y no se ve afectado.
- **Motivo:** Comportamiento conocido del empaquetado del adaptador de Netlify en Windows.

### D-029 · CI: versiones de acciones y seguridad — aprobada

- **Opción:** Todas las acciones de GitHub están fijadas por **hash de commit** (con la versión en un comentario) y Dependabot propone las actualizaciones semanalmente. Permisos del flujo: solo lectura. Seguridad en CI: gitleaks con historial completo, `pnpm audit --audit-level=high` y CodeQL aparte.
- **Motivo:** SDD §11.2 (cadena de suministro). `gitleaks-action` es gratuita para repositorios de cuentas personales; si el repositorio pasa a una organización de GitHub requiere licencia (o se cambia por el binario de gitleaks).

## Revisión de arquitectura (Fase 0)

### D-030 · Despliegue, migraciones y roles de base de datos — revisar

- **Opción:** (1) Añadir `netlify.toml` con la versión de Node fijada (la misma que el CI) y el comando de build. (2) Las migraciones corren como paso del despliegue, antes de publicar, con `pnpm db:migrate` leyendo `DATABASE_URL_MIGRATE` del entorno (sin depender de un archivo `.env`). (3) Dos roles de BD: **migración** (dueño de las tablas, solo en el paso de despliegue) y **ejecución** (`DATABASE_URL`, solo SELECT/INSERT/UPDATE/DELETE sobre las tablas necesarias, sin DDL ni capacidad de quitar el trigger de `audit_log`). (4) Los _previews_ usan una base distinta y vacía (SDD §11.2).
- **Motivo:** D-015 dice "se migra en el despliegue" pero nada lo implementa, y hoy un solo rol migra y opera, con lo que el trigger de inmutabilidad (D-017) se puede desactivar. SDD §11.2 pide mínimo privilegio y §14 migraciones automáticas con _rollback_ documentado.
- **Estado:** sin implementar. Depende de crear la cuenta de Netlify y la BD (pendiente 1 del SDD §17). Debe estar cerrada antes del primer despliegue.

### D-031 · Invariantes de acceso garantizados por la base de datos — aprobada

- **Opción:** Las reglas "siempre hay un Líder activo" y "un Líder no se degrada a sí mismo" (§10.2) se aplican dentro de una transacción que toma un **bloqueo asesor** (`pg_advisory_xact_lock`) antes de contar y escribir. Se eligió en lugar de `SELECT … FOR UPDATE` sobre las filas de Líderes porque también serializa el _bootstrap_, donde todavía no hay filas que bloquear. Nuevo puerto `AccessUnitOfWork.withLeaderLock` (`application/ports/unit-of-work.ts`) con adaptador `DbAccessUnitOfWork` y fake `InMemoryAccessUnitOfWork` (cola de una sola ejecución). `ChangeUserRole`, `SetUserStatus` y el _bootstrap_ de `SignIn` pasan por él; el cambio y su fila de auditoría confirman juntos o ninguno. `InviteUser` no lo necesita: invitar no reduce el número de Líderes.
- **Motivo:** Se comprobaba (`countActiveLeaders`) y luego se escribía, sin bloqueo: dos Líderes que se degradaran a la vez dejaban el sistema sin Líder. D-019 permite recuperar el acceso con el correo de _bootstrap_, lo que acotaba el daño, pero el invariante debe garantizarlo la BD.
- **Pruebas:** `tests/integration/leader-lock.test.ts` (dos degradaciones, dos desactivaciones y tres primeros inicios de sesión simultáneos) contra el fake y contra Postgres. Quitando el bloqueo del fake, las tres fallan. Un job de CI (`postgres`) repite `test:integration` contra un Postgres real con `TEST_DATABASE_URL`; cada app de prueba usa una base de datos propia y desechable.
- **Límite conocido:** PGlite tiene una sola conexión, así que en local la prueba valida el uso del bloqueo y la decisión sobre datos frescos, no el paralelismo real. Ese se ejerce en el job de CI. Ese job no se ha podido ejecutar en el equipo de desarrollo (sin Docker): su primera ejecución será en GitHub Actions.
- **Estado:** **hecho**.

### D-032 · Arranque tolerante a fallos y carreras — aprobada

- **Opción:** (1) `getApp()` no guarda la promesa si el arranque falla: la siguiente petición reintenta. (2) `seedAccessData` crea cada rol y sus permisos por defecto dentro de una transacción con `ON CONFLICT DO NOTHING` sobre `role.name`; si dos arranques en frío coinciden, solo uno escribe los permisos por defecto.
- **Motivo:** Con `??=` un fallo puntual de la BD en un arranque en frío dejaba la instancia devolviendo errores hasta reciclarse, y dos instancias simultáneas podían chocar con la restricción única de `role.name`. Sigue cumpliendo D-020: los permisos por defecto se escriben solo al crear el rol.
- **Estado:** **hecho**, con prueba de arranques concurrentes (`tests/integration/seed-and-forms.test.ts`).

### D-033 · Atlassian OAuth verificado en local, con PKCE activo — aprobada

- **Opción:** App OAuth 2.0 (3LO) de **Account-level**, con el scope mínimo `read:me` y Callback URL `http://localhost:4321/api/auth/callback`. El adaptador sigue enviando `state` y PKCE (S256), y mantiene el secreto de cliente.
- **Motivo:** La app solo identifica a la persona; no accede a sitios de Jira ni Confluence, así que Resource-level no aporta. La autorización real (dominio `@holafly.com` más usuario invitado y activo) la hace el Hub, no Atlassian. **Verificado el 2026-11-11:** el inicio de sesión completo funciona con PKCE activo, por lo que Atlassian no lo rechaza (cierra la duda de D-021). El Client Secret se regeneró tras mostrarse parcialmente en una captura.
- **Alcance:** probado solo en local y con una cuenta (la del Líder). Falta confirmar el correo `@holafly.com` de 2 o 3 compañeros y crear la app y la Callback URL de producción, que debe ser una app distinta (SDD §17, pendiente 2).
