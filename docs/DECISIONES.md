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
- **Resultado del primer despliegue (2026-11-11):** el verificador encontró un fallo real. En páginas renderizadas en servidor Astro 7 envía `script-src`/`style-src` en la **cabecera** `Content-Security-Policy` (la `<meta>` solo se usa en páginas prerenderizadas), y el middleware la **reemplazaba** con la suya. Corrección: `mergeCsp` conserva las directivas de Astro y añade las que faltan (`frame-ancestors`, etc.); `verify:deploy` ahora lee la cabecera. Netlify inyecta además un `<script>` propio (`/.netlify/scripts/hud`); la CSP lo bloqueará y no afecta a la app.

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
- **Estado:** parcial. Netlify y la BD existen y se desplegó la Fase 0 con un solo rol (el dueño). Para cerrar el punto (3) se añade `scripts/create-runtime-role.mjs` (rol `app_runtime` sin DDL, `audit_log` solo con SELECT/INSERT, prueba de la conexión _pooled_); procedimiento en `docs/runbooks/DESPLIEGUE.md`. Siguen pendientes `netlify.toml` y las migraciones como paso del despliegue (puntos 1 y 2).

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

## Fase 1

### D-034 · Jira sin webhook: sincronización incremental — aprobada

- **Opción:** No se usa webhook de Jira ni reglas de Automatización. El tenant no permite crear webhooks y una regla solo admite un disparador, lo que obligaba a mantener tres reglas fuera del repositorio y a exponer un endpoint público. Cada sync pregunta a Jira solo por lo cambiado desde el último sync exitoso (`updated >=` último sync menos 5 min de solape, con `expand=changelog`) y relee los SLAs solo de esos tickets. Se elimina `JIRA_WEBHOOK_SECRET` de la configuración.
- **Motivo:** Menos superficie de ataque (sin entrada pública, sin firma ni repetición que defender), todo versionado en el repositorio y una consulta por ejecución en lugar de una llamada por cambio. El coste es la inmediatez: el criterio de la Fase 1 pasa de "< 1 min" a "≤ 15 min, o segundos con el botón".
- **Reversible:** si más adelante se habilita un webhook o una regla de Automatización, entra como acelerador sin cambiar el resto (SDD §6.2).

### D-035 · Disparadores del sync de Jira — aprobada

- **Opción:** (1) **Perezoso:** al abrir el dashboard, si el último sync exitoso tiene más de 15 min (máx. 1 cada 5 min), lo puede disparar cualquier usuario con sesión; corre en una Background Function y la página no espera. (2) **Botón "Resincronizar":** permiso `action.sync`, solo Líder por defecto (D-001); oculto, no deshabilitado, para quien no lo tiene; 1 por minuto por usuario. (3) **Función programada de Netlify:** opcional y **desactivada al inicio**; si se activa, cada 30 min. Un solo sync a la vez mediante bloqueo asesor en la BD.
- **Motivo:** Sin cron el consumo de créditos de Netlify es cero cuando nadie usa el Hub (un cron por minuto serían unas 43.000 ejecuciones al mes frente a 300 créditos). El disparo perezoso abierto a todos tiene el tope de 1 cada 5 min, así que el coste está acotado y no da a los Colaboradores control sobre qué se sincroniza.

### D-036 · Cuenta de servicio de Jira y lectura de SLAs — verificada y decidida (2026-11-12)

- **Opción:** La cuenta con la que se generó el token **puede leer el proyecto y los SLAs** (probado con `pnpm probe:jira` el 2026-11-11). **Decisión del Líder: se usa siempre su cuenta personal**, también en producción. Consecuencias: el token hereda todos los permisos de esa persona (el sync solo lee, pero el token podría escribir si se filtrara), y si esa persona deja el equipo o cambia su contraseña el sync deja de funcionar hasta rotar el token. Mitigaciones ya vigentes: el token vive solo como secreto de Netlify, el cliente de Jira solo hace GET (el guardián de salida limita el host), y el runbook explica cómo rotarlo.
- **Motivo:** El SDD §6.3 temía que la lectura de SLAs exigiera ser agente del Service Desk; la prueba confirma que con esta cuenta funciona.

### D-037 · Capacidad por cantidad de tareas — aprobada (2026-11-12)

- **Opción:** La capacidad se mide hoy por **cantidad de tareas por persona**: el objetivo es que todas tengan aproximadamente la misma carga. Más adelante se mejorará con **puntos de esfuerzo (story points)** por tarea, porque no todas las tareas pesan lo mismo. El detalle (qué estados cuentan, cómo se muestra el "aproximadamente igual") se propone al llegar a `/capacidad`.
- **Motivo:** Es como el equipo la calcula hoy. Los puntos de esfuerzo dependen de que Jira tenga ese campo informado, y hoy no está.
- **Consecuencia para el diseño:** la medida de carga se calcula en una sola función del dominio, para cambiar de "tareas" a "puntos" sin tocar las páginas.

### D-038 · Marca de última actualización y SLAs calculados al leer — aprobada

- **Opción:** Todas las páginas del dashboard muestran "Última actualización: fecha y hora" (`America/Bogota`) del último `sync_run` exitoso; si el último intento falló se indica aparte. De los SLAs se guardan las fechas objetivo y el incumplimiento se calcula al leer. La ubicación visual del texto y del botón se define en la etapa de diseño.
- **Enmienda (SLAs en curso):** el incumplimiento de un ciclo abierto se toma del campo `breached` de Jira; solo si el ciclo corre (`paused: false`) y su `breachTime` ya pasó se marca como incumplido al leer. Un ciclo pausado nunca se marca, porque su `breachTime` es una proyección que se mueve mientras dura la pausa.
- **Motivo:** La persona debe saber con certeza qué tan viejos son los datos y si le conviene pedir una resincronización. El estado de un SLA abierto cambia con el tiempo aunque nadie edite el ticket, y calcularlo al leer evita volver a pedirlo a Jira.

### D-039 · SLAs leídos desde los campos de la búsqueda — aprobada

- **Opción:** Los SLAs se leen de los campos `customfield_10062` (Time to first response) y `customfield_10152` (Time to done) que la propia búsqueda JQL devuelve, no con `/rest/servicedeskapi/request/{key}/sla` por ticket. El endpoint de Service Desk queda como respaldo. El nombre real de la métrica de respuesta es **Time to first response** (el SDD decía "Time to response").
- **Motivo:** Verificado contra el tenant: la búsqueda trae `completedCycles` y `ongoingCycle` con `breachTime`, `goalDuration`, `elapsedTime` y `breached`. La carga inicial pasa de 1.046 llamadas a unas 11 páginas, y el sync incremental no necesita llamadas extra. Reduce el tiempo y el riesgo de límites de tasa.
- **Enmienda del SDD §6.3:** se actualiza el texto de la sección.

### D-040 · Qué estados cuentan como trabajo activo — aprobada

- **Opción:** "Tiempo en progreso" cuenta solo el estado `In progress`. Pending, Pending translation, PENDING APPROVAL y PENDING DEPLOY son esperas y no cuentan como esfuerzo. Así lo maneja el equipo (confirmado por Sebas el 2026-11-11).
- **Motivo:** Los estados reales del tenant (`docs/jira-mapping.md`) no son los del SDD §4.1; el % de esfuerzo por objetivo debe medir trabajo activo, no espera.

### D-041 · Origen del árbol de objetivos (`/objetivos`) — en espera

- **Opción:** La página `/objetivos` queda **en espera** hasta que el equipo defina los objetivos en Jira. Hoy no existen (los 1.046 tickets de JSMCO no tienen épica, `parent` ni Goals). Sebas prepara la propuesta; cuando exista, el Hub los mapeará. Las alternativas siguen siendo: mapeo manual en el Hub, enlaces "is idea for" hacia épicas de CONT, o un campo nuevo.
- **Motivo:** El SDD §5 espera "compañía → marketing → épica de equipo → tickets" y el modelo `objective` (§4.1), pero ese dato no existe todavía. No se inventa: el resto de la Fase 1 no depende de esto.
- **Efecto en el plan:** `/objetivos` sale del alcance del cierre de la Fase 1 y el % de esfuerzo por objetivo queda en espera. Se implementa cuando se apruebe la propuesta.

### D-042 · Regla del 90 % de cumplimiento de SLA — aprobada (opción B)

- **Contexto:** Jira calcula cada SLA (`docs/jira-mapping.md`). La meta es que superen el 90 %. Medido el 2026-11-11 sobre todo el histórico: Time to first response 84,7 %, Time to done 90,5 %, combinado 87,6 %.
- **Opción:** **Cada métrica debe estar por encima del 90 % por sí sola** (confirmado por Sebas). El combinado no cuenta como meta; si se muestra, es informativo. (1) Unidad: **ciclo completado** (cada cierre cuenta, también las reaperturas). (2) Un ciclo cuenta en el periodo de su `stopTime`. (3) Un ciclo en curso ya incumplido cuenta como incumplido en el periodo actual; uno que sigue en plazo o está pausado no entra. (4) La meta es "cumplida" solo si todas las métricas la alcanzan; es "sin datos" mientras alguna no tenga ciclos; basta una por debajo para "no cumplida". La comparación usa enteros (`cumplidos × 100 >= 90 × total`), sin redondeos.
- **Motivo:** Un combinado puede ocultar una métrica rota (por ejemplo 100 % en una y 80 % en otra da 90 % combinado). Implementado en `src/domain/jira/sla-compliance.ts`.

### D-043 · Zona horaria: una para agrupar, la de cada persona para mostrar — aprobada

- **Contexto:** El equipo está en Colombia, Argentina, España y Asia. Una misma hora se ve distinta para cada uno, pero los totales (trimestres, cumplimiento de SLA por periodo) deben dar lo mismo para todos.
- **Opción:** (1) **Agrupar** siempre con una sola zona fija, `America/Bogota` (`REPORTING_TIME_ZONE`): un ticket cerrado el 31 de diciembre pertenece al mismo trimestre para toda persona. (2) **Mostrar** cada fecha y hora (marca "Última actualización", cierres de ticket, fechas de SLA) en la zona de cada persona, guardada en su perfil (`app_user.time_zone`, por defecto `America/Bogota`) y elegida de una lista corta. La conversión se hace en el servidor, sin JavaScript en el navegador. Se muestra el nombre de la zona junto a la hora.
- **Motivo:** Si cada persona agrupara con su zona, las cifras cambiarían de una persona a otra. Guardar la zona en el perfil evita JavaScript de cliente (presupuesto de §12) y se puede cambiar. Detectarla automáticamente desde el navegador queda como mejora posterior.
- **Lista aprobada (2026-11-12):** Colombia · Bogotá (una sola zona para todo el país), Argentina · Mendoza, Argentina · Buenos Aires, España · Madrid, Portugal · Lisboa y Tailandia · Bangkok. Cada persona elige la suya. Mendoza y Buenos Aires comparten hora hoy; se mantienen separadas porque así se pidió. Implementado en `src/domain/access/time-zone.ts`.

### D-044 · Esquema de la caché de Jira — aprobada

- **Opción:** (1) **No se guarda `raw`** (la respuesta completa de Jira); el SDD §4.1 lo marcaba opcional y Sebas decidió no guardarlo: menos datos de personas y de tickets (§11.2). (2) Los SLAs viven en la tabla `jira_sla_cycle` (un ciclo por fila) y no en columnas `sla_*` de `jira_issue`, porque un ticket reabierto tiene varios ciclos por métrica (49 tickets hoy). (3) `jira_issue` no guarda `labels` ni `epic_key` (las personas se amplían en D-045): ninguna página los usa y el proyecto no tiene épicas (D-041). `time_in_progress_seconds` tampoco se guarda; se calcula desde `jira_status_transition` (D-040). Las tablas `jira_epic` y `objective` se crean cuando se resuelva D-041. (4) Las fechas de Jira se guardan como `jira_created_at` y `jira_updated_at`, para no confundirlas con `created_at` de la fila. (5) `app_user.time_zone` (D-043), con `America/Bogota` por defecto; la lista válida vive en el dominio, no en un `CHECK`, para poder ampliarla sin migrar. (6) **Un solo sync a la vez** con una tabla `sync_lock` que guarda un **arrendamiento con vencimiento** (15 min), no un bloqueo asesor de sesión: la conexión _pooled_ de Netlify DB no conserva el estado de sesión, y un sync que muere libera el bloqueo solo al vencer.
- **Motivo:** Cada punto reduce datos o evita un fallo concreto. El arrendamiento se probó con una ejecución que nunca termina: otra puede tomar el relevo al vencer, y la que murió no libera por error el bloqueo de la nueva.
- **Pruebas:** `tests/integration/jira-store-contracts.test.ts` ejecuta las mismas pruebas contra Postgres y contra los fakes (orden de claves, idempotencia, lotes de 1.200 tickets, historial y bloqueo).
- **Pendiente de verificar en producción:** que el rol `app_runtime` hereda permisos sobre las tablas nuevas (los privilegios por defecto de D-030 deberían cubrirlo). Se comprueba tras el despliegue.

### D-045 · Personas en la caché: asignado y solicitante, solo con nombre — aprobada

- **Opción:** Cada ticket guarda a quien lo tiene asignado (`assignee_id`, `assignee_name`) y a quien lo pidió (`requester_id`, `requester_name`, el `reporter` de Jira). Solo el identificador de Atlassian y el nombre visible: **nunca el correo**, la foto ni la zona horaria que Jira también devuelve. Decisión de Sebas (2026-11-12): "A y B, es importante".
- **Motivo:** `/tareas` y capacidad por persona necesitan mostrar nombres, y el solicitante permite filtrar y contar por quién pide el trabajo. Se verificó con datos reales que los solicitantes son cuentas de Atlassian de la empresa (`accountType: atlassian`), no clientes externos.
- **Límites:** Si en el futuro aparecen solicitantes de tipo `customer` (clientes del portal), esos nombres no se guardan hasta decidirlo (SDD §11.2: sin datos personales de clientes). El nombre se actualiza en cada sync; un ticket sin asignado guarda `null`. Los nombres visibles solo llegan a quien tenga el permiso de la página; no se envían a otras secciones.
- **Migración:** `0004_people_names`.

### D-046 · Cliente de Jira: reglas de comunicación y datos de prueba — aprobada

- **Opción:** (1) El cliente (`src/infrastructure/jira/`) solo lee: una búsqueda JQL y la lectura del historial. Toda dirección pasa por el guardián de salida (SDD §11.2, protección contra SSRF): solo el sitio configurado. (2) El filtro incremental envía la fecha en **milisegundos desde 1970**, no como texto: Jira interpreta los textos en la zona horaria de la cuenta, los milisegundos no dependen de ninguna. Verificado: da el mismo resultado que el filtro relativo (380 tickets en 30 días). (3) Hasta 4 intentos con espera exponencial (0,5 s, 1 s, 2 s…) y variación aleatoria entre el 50 y el 100 % de cada espera; respeta `Retry-After` hasta 20 s y, si Jira pide más, devuelve el error al instante (una función serverless no puede esperar minutos). 401, 403, 400 y 404 no se reintentan. (4) Los errores nunca incluyen cuerpos de respuesta, cabeceras, el token ni el correo. (5) Una respuesta con forma inesperada falla como `invalid_response` y nombra el campo, no su contenido. (6) Si Jira recorta el historial de un ticket, se completa con el endpoint de historial. (7) Una categoría de estado desconocida cuenta como "en curso", nunca como "hecho". (8) Para la lista de claves se pide el campo `key` (con `id` Jira no devuelve la clave).
- **Datos de prueba:** `tests/fixtures/jira/search-page.json` sale de respuestas reales pero anonimizado con `scripts/anonymize-jira-fixtures.mjs`: personas, textos de tickets, enlaces, correos, avatares y nombre del sitio se sustituyen o se eliminan, y el script se niega a escribir si una comprobación detecta que quedó algo. El archivo original (`.data/`) nunca se sube al repositorio. En la primera versión la comprobación estaba rota por un error mío y se encontró verificándola aparte; ahora hay una segunda comprobación independiente que rechaza cualquier enlace o `@`.
- **Verificado contra el Jira real (2026-11-12):** 1.046 tickets en 11 páginas, 1.001 con asignado y solicitante con nombre, 3.124 transiciones de estado, mediana de 43,1 h en `In progress` (857 tickets), lista de claves de 1.046 únicas y los cumplimientos de SLA coherentes con lo medido (Time to first response 84,5 %, Time to done 90,1 %; la meta de D-042 no se cumple todavía).

### D-047 · Cómo sincroniza el Hub y qué pasa cuando algo falla — aprobada

- **Opción:** (1) **Política A:** cada página de Jira se guarda en cuanto se lee y cada ticket se guarda completo. Si Jira falla a mitad (por ejemplo en la página 7 de 11), lo ya guardado queda válido, la ejecución se marca como fallida y la siguiente repite desde el último sync **exitoso**, completando lo que faltó. Decisión de Sebas (2026-11-12). (2) La ventana incremental parte de la hora en que **empezó** el último sync exitoso menos 5 min, no de cuando terminó: así no se pierde un cambio ocurrido mientras corría. (3) Mientras no haya ningún sync exitoso, toda ejecución lee el proyecto completo. (4) Los tickets borrados en Jira se detectan solo en una lectura **completa** (comparando claves) y **no se borran** si serían más del 20 % de la caché y más de 10 tickets (o si Jira devuelve la lista vacía): se marca fallo y se avisa, para que un fallo de Jira no vacíe el Hub. (5) Con el bloqueo tomado, cualquier ejecución que siga "en curso" es una que murió y se cierra como fallida; para la pantalla, una ejecución se considera viva solo 15 min. (6) Un error inesperado se registra con un mensaje genérico, nunca con el texto de la excepción. (7) Los disparos (perezoso y botón) no esperan a Jira: deciden y lanzan un proceso en segundo plano mediante un puerto (`SyncLauncher`) que se implementa en el paso 1.7. (8) `pnpm sync:jira [--full] [--dry-run]` ejecuta lo mismo desde la terminal; el modo de prueba no escribe nada, ni siquiera el registro de la ejecución.
- **Motivo:** El "todo o nada" habría perdido una carga inicial de 1.046 tickets ante un fallo cerca del final. Las protecciones de borrado y de ejecuciones muertas evitan los dos modos de fallo silencioso más caros: una caché vaciada por error y un bloqueo eterno.
- **Verificado con el Jira real y la base local:** carga completa de 1.046 tickets en 18,9 s; un sync incremental inmediato lee 0 tickets en 0,7 s; en la base quedan 1.046 tickets, 2.117 ciclos de SLA y 1.001 con asignado y solicitante, con los mismos cumplimientos que la lectura directa (84,5 % y 90,1 %). Pruebas: `tests/integration/jira-sync.test.ts` y `jira-request-sync.test.ts`, contra Postgres y contra los fakes.

### D-048 · Sync en segundo plano: función de Netlify, secreto interno y empaquetado — aprobada

- **Opción:** (1) El sync largo corre en una **función en segundo plano** de Netlify (`sync-jira-background`, hasta 15 min; Netlify responde 202 al instante). La app la lanza con `HttpSyncLauncher`, que llama al propio sitio (solo ese origen, por el guardián de salida) con una cabecera `X-Sync-Secret`. (2) **`SYNC_TRIGGER_SECRET`** (32+ caracteres, obligatorio al arrancar) es el secreto compartido. La función responde **404 sin cuerpo** a quien no lo presente, a cualquier método que no sea POST y a cualquier llamada si ella misma está mal configurada; lo compara en tiempo constante (hash de ambos lados, así no filtra ni la longitud) y autentica **antes** de abrir la base de datos o hablar con Jira. Con secreto válido acepta solo `{kind, mode}` (esquema estricto, máx. 1 KB); no se puede pedir un `dryRun` ni otra opción. (3) **Empaquetado propio:** `pnpm build:functions` (esbuild) genera `netlify/functions/sync-jira-background.mjs` con todas las importaciones resueltas, porque el empaquetador de Netlify no conoce los alias de rutas del proyecto (`@domain/...`); `pnpm build` lo ejecuta primero y el archivo generado está en `.gitignore`. La base de datos embebida se carga con `import()` dinámico y queda fuera del paquete: la producción nunca la carga. (4) **En desarrollo** (`astro dev`) no hay función de Netlify: el lanzador `InlineSyncLauncher` ejecuta el sync dentro del propio servidor, sin que quien lo pide espere. (5) El sync programado queda escrito (`sync-jira-scheduled.ts`) pero **no se empaqueta**, como decidió D-035. (6) No se añadió `netlify.toml`: el directorio por defecto de las funciones basta, y D-030 sigue pendiente.
- **Motivo:** El sync de 20 s no cabe en una petición de página ni debe bloquear a quien pulsa el botón. Un secreto compartido más una respuesta uniforme evita que un tercero dispare syncs o descubra la función. Empaquetar nosotros evita depender de cómo resuelva Netlify los alias, algo que no se puede probar en local.
- **Verificado en local con el archivo ya empaquetado** (el mismo que subirá Netlify): sin secreto, con secreto equivocado y con GET → 404 sin cuerpo; secreto válido con cuerpo inválido o con opciones extra → 400; secreto válido → sync real contra el Jira de producción y la base local, 202 en 0,8 s. 36 pruebas permanentes (`tests/integration/sync-function.test.ts`) cubren el manejador, el lanzador, que ambos acuerdan el contrato de punta a punta y que los secretos no aparecen en errores ni registros.
- **Pendiente de verificar en Netlify:** que la plataforma reconozca el archivo `.mjs` con la exportación `handler` como función en segundo plano y que las variables lleguen a la función (ver el runbook de despliegue). Es lo único que no se puede comprobar sin desplegar.

### D-049 · Botón "Resincronizar con Jira": permiso, límite y qué se ve — aprobada

- **Opción:** (1) La ruta `POST /api/sync` exige el permiso `action.sync`, que por defecto solo tiene el Líder (el Colaborador recibe únicamente las secciones). Quien no lo tiene recibe 404 con cuerpo vacío, igual que cualquier ruta oculta, y el botón ni siquiera se dibuja en la página: no hay botón desactivado, ni texto, ni la dirección `/api/sync` en el código de la página. (2) Protección anti-CSRF con el mismo token de los demás formularios. Se comprueba **antes** del límite, para que una petición falsificada no gaste el minuto de la persona real. (3) **Una petición por persona y minuto**, aplicada en el propio manejador y no en el registro de rutas, para mostrar un mensaje claro ("Espera un minuto") en lugar de un 429 en blanco. (4) El botón nunca espera a Jira: pide el sync en segundo plano y vuelve a la página con un mensaje (`?sync=started|running|wait|unavailable`). Si la función no responde, la persona sigue viendo los últimos datos y un aviso; la página nunca se rompe. (5) El destino de vuelta (`back`) solo puede ser una página del registro de rutas; cualquier otra cosa vuelve a `/`, así el formulario no sirve para enviar a nadie a otro sitio. (6) Cada pulsación queda en el registro de auditoría (`sync.manual_requested`). (7) El panel "Última actualización" (hora en la zona de cada persona, D-043) lo ven todos; el detalle del último error, solo quien puede resincronizar. La ubicación visual definitiva se decide en la fase de diseño.
- **Motivo:** Menos personas pueden pedir sincronizaciones (de 8 a 3), cada una consume créditos de Netlify y llamadas a Jira; el límite por persona evita pulsaciones repetidas. Ocultar en vez de bloquear sigue la regla de SDD §10.3.
- **Verificado:** pruebas e2e (el Líder pulsa y recibe confirmación; la segunda pulsación se rechaza; el Colaborador no ve rastro y obtiene 404 vacío, también con una dirección fabricada) y de integración (fallo al lanzar, en ambos tipos de adaptador). Se corrigió además que `?ok=toString` pudiera alcanzar miembros heredados del objeto de mensajes (ahora se usa `Object.hasOwn`).

### D-050 · Resumen ejecutivo (`/`): qué muestra y cómo se compara — aprobada

- **Opción:** La página muestra el **trimestre en curso** (calendario en hora de Bogotá, D-043) con: (1) cumplimiento de SLA de cada métrica contra la meta del 90 % (D-042), con veredicto en texto y no solo en color; (2) tickets **creados**, **resueltos**, **abiertos hoy** y **tiempo típico de resolución** (la **mediana** de días naturales entre crear y resolver, para que unos pocos tickets muy antiguos no distorsionen la cifra); (3) gráfico de creados y resueltos de los últimos 6 meses; (4) los tipos de solicitud más pedidos del trimestre. Cada cifra lleva un ⓘ con su definición, hecho con `<details>` nativo, sin JavaScript. Los gráficos son SVG generados en el servidor, con la cifra escrita sobre cada barra.
- **Comparación honesta:** las cifras de volumen se comparan con **el mismo tramo del trimestre anterior** (los primeros N días), nunca con el trimestre anterior completo. Comparar seis semanas de T4 con los tres meses de T3 mostraba una caída de −174 tickets que no existía; con el mismo tramo la diferencia real es +1. El tramo se acota al final del trimestre anterior (T3 dura 92 días y T2, 91), y la página dice cuántos días se comparan. El SLA, al ser un porcentaje, se mide sobre el trimestre en curso sin ajuste.
- **Fecha de resolución:** el flujo de Jira no rellena "Resolución" al pasar a Hecho (`resolutiondate` siempre vacío); se usa `statuscategorychangedate` mientras el ticket siga en Hecho (ver `docs/jira-mapping.md`). Sin este cambio, "resueltos" salía en 0.
- **Actualización:** abrir la página lanza en segundo plano la reconciliación perezosa si los datos tienen más de 15 minutos (D-035); la página nunca espera a Jira.
- **Permisos:** el caso de uso `GetExecutiveSummary` exige `section.exec` además de la ruta (doble comprobación). Los datos aún no se filtran por persona: en esta fase el permiso de sección decide todo.
- **Verificado:** pruebas de dominio (límites del trimestre en Bogotá y con horario de verano, mediana, comparación del mismo tramo y su tope, mes parcial), de integración en ambos adaptadores y de mapeo contra respuestas con forma real; revisión visual con los 1.046 tickets reales, en escritorio y móvil, en claro y oscuro. Resultado real el 2026-11-12: SLA T4 2026 de 97,9 % (primera respuesta) y 93,3 % (resolución).

### D-051 · Página `/tareas`: filtros, orden y datos de personas — aprobada

- **Opción:** Lista de las tareas guardadas, de la actividad más reciente a la más antigua (la clave desempata, así el orden no cambia entre cargas), de 25 en 25. **Cuatro filtros**, elegidos por el Líder: tipo de tarea, estado actual, solicitante y asignado (con la opción "Sin asignar"). Cada opción muestra cuántas tareas tiene. Los filtros se combinan (la tarea debe cumplirlos todos) y viajan en la dirección de la página (`?tipo=…&estado=…&solicitante=…&asignado=…&pagina=N`), así se pueden compartir y la paginación los conserva. Es un formulario normal que filtra en el servidor: no necesita JavaScript.
- **Valores que no existen:** un filtro con un valor que no corresponde a nada real (por ejemplo, escrito a mano en la dirección) se ignora en vez de mostrar una página vacía inexplicable, y una página fuera de rango se ajusta a la última. Las opciones salen de los datos guardados, no de una lista fija.
- **Datos de personas:** la lista muestra el nombre del solicitante y de la persona asignada, que guardamos a propósito (D-045). Los ve cualquiera con el permiso `section.work`, que el Colaborador tiene por defecto. Nunca se muestran ni se guardan correos de la cuenta de Jira.
- **Permisos:** la ruta exige `section.work` y el caso de uso `ListTasks` lo vuelve a comprobar. Quien no lo tiene recibe 404 y no ve la entrada en el menú.
- **Móvil:** la tabla se convierte en tarjetas y cada dato lleva su etiqueta, porque la cabecera se oculta en pantallas pequeñas.
- **Ampliación (2026-11-12, a petición del Líder):** (1) **Búsqueda por texto** sobre la clave y el resumen: ignora mayúsculas y tildes, todas las palabras escritas deben aparecer (en cualquier orden), máximo 100 caracteres, y lo escrito se trata como texto, nunca como patrón. (2) **Enlace al ticket en Jira** en cada clave, que se abre en otra pestaña con `rel="noopener noreferrer"`. La dirección se construye en el dominio (`ticketUrl`) y solo si la base es https y la clave tiene forma de clave de Jira; si no, se muestra la clave sin enlace. La dirección de Jira llega a la presentación por la composición, sin que esta lea la configuración.
- **Verificado:** pruebas de dominio, de integración en ambos adaptadores, de la dirección de la página, la matriz de autorización y el navegador; revisión visual con los 1.046 tickets reales (42 páginas), en escritorio y móvil.

### D-052 · Página `/sla`: periodo, desglose y ciclos en curso — aprobada

- **Opción:** Cuatro bloques, pedidos por el Líder: (1) **Selector de periodo**: botones rápidos de los últimos 6 trimestres (el actual por defecto, "T4 2026") y un rango personalizado Desde/Hasta con el último día incluido, en hora de Bogotá (D-043), de hasta 3 años. Un rango válido gana sobre un trimestre; cualquier valor inválido (fechas imposibles, rango invertido, trimestre futuro, texto raro) vuelve al trimestre en curso y la página lo avisa. (2) **Cumplimiento del periodo** de cada métrica contra el 90 % (D-042), con el mismo medidor que el Resumen. (3) **Desglose**: mes a mes (gráfico de barras con la línea de la meta, y una tabla con los números) y por tipo de solicitud, de más a menos ciclos medidos. (4) **Ciclos en curso ahora**: los relojes que siguen corriendo, del que vence antes al que vence después, con enlace al ticket, responsable y "vence en…" o "venció hace…"; los vencidos ya cuentan como incumplidos (D-042). Esta lista no depende del periodo elegido porque trata de "ahora". Los relojes en pausa no se listan, y se indica cuántos son.
- **Reglas del desglose mensual:** un ciclo completado cuenta en el mes en que terminó, y uno en curso en el mes actual. Un mes cortado por el borde del periodo solo cuenta los días de dentro. La tabla empieza en el primer mes con algo medido y termina en el mes actual: los meses vacíos del principio y los meses que aún no han llegado solo dibujarían huecos y esconderían los datos reales. Máximo 36 meses.
- **Presentación:** el gráfico mantiene un ancho fijo por mes y se desplaza de lado si hace falta, en vez de encoger el texto. Cada veredicto lleva palabra y símbolo (✔ / ✖), no solo color. La zona horaria se nombra una vez en la cabecera de la columna, no en cada fila. En el móvil las filas pasan a tarjetas de dos columnas.
- **Permisos:** la ruta exige `section.sla` y el caso de uso `GetSlaReport` lo vuelve a comprobar.
- **Hallazgos con datos reales (2026-11-12):** T4 2026 cumple (97,9 % y 93,3 %); T2 2026 no cumplía (86,7 % y 89,1 %). Hay 33 relojes corriendo, 6 de ellos ya vencidos, el más antiguo desde hace 206 días, y 65 en pausa. El tipo obsoleto "Translate Marketing Materials - Moi - DON'T USE" aparece en el desglose con 3 ciclos.
- **Resuelto (2026-11-12):** el tipo obsoleto ("… DON'T USE") se **oculta del desglose por tipo** (sigue contando en los totales, porque son ciclos reales). Se reconoce por el nombre y se decide en el dominio (`isObsoleteRequestType`).
- **Verificado:** pruebas de dominio (periodos, límites de día en Bogotá, desglose, tope del mes parcial), de integración en ambos adaptadores, matriz de autorización y navegador; revisión visual con los 1.046 tickets reales, en escritorio y móvil.

### D-053 · Estructura de la aplicación: barra lateral, barra superior y tema — aprobada

- **Opción:** (1) **Barra lateral** con todas las secciones que la persona puede ver (ocultar, no bloquear, SDD §10.3), y el nombre del Hub arriba. (2) **Barra superior** solo con el **perfil** (nombre, correo y rol), el **cambio de tema** y **Cerrar sesión**: nada de navegación. En pantallas estrechas la barra lateral pasa a ser una franja sobre el contenido. (3) **Tema claro / oscuro / del dispositivo**, a elección de cada persona. La elección se guarda en una cookie (`hub_theme`, `httpOnly`, un año) y la escribe el servidor al pintar la página (`data-theme` en `<html>`), así que no hay JavaScript ni parpadeo al cargar. Sin elección, la hoja de estilos sigue al dispositivo. (4) El cambio se hace con `POST /api/theme` (requiere sesión y token anti-CSRF, 30 por minuto), y vuelve a la misma página **conservando sus filtros**; la dirección de vuelta solo puede ser una página registrada de este sitio (se rechazan otras webs, rutas de API, direcciones con barra invertida y mensajes de un solo uso como `?sync=`).
- **Pendiente:** el diseño visual definitivo (iconos del menú, orden, agrupación) queda para la iteración de diseño; esta estructura es la base. El selector de zona horaria por persona (D-043) vivirá en el perfil.
- **Verificado:** pruebas de la dirección de vuelta (casos de ataque incluidos), de la matriz de autorización y del navegador (el menú está en la barra lateral y no en la superior; el tema se aplica, sobrevive a recargar y conserva los filtros); revisión visual en claro, oscuro y móvil.

### D-054 · Página `/incumplimientos` y ciclos abiertos en tickets cerrados — aprobada

- **Opción:** (1) **`/incumplimientos` (SLAs incumplidos):** mismo selector de periodo que `/sla`; resumen con el total y el desglose por métrica; "quién acumula más" y "qué tipo de solicitud" (los 5 primeros); y la **lista** de cada ciclo incumplido, del **mayor retraso al menor**, de 25 en 25, con filtros por métrica, tipo y asignado (que conservan el periodo). Cada fila muestra ticket (con enlace a Jira), resumen, métrica, tipo, responsable, límite, cuándo terminó y el retraso. Usa **la misma regla que el cumplimiento** (D-042), así que sus totales coinciden con `/sla` (comprobado con datos reales: T2 2026 tuvo 39 incumplimientos de primera respuesta y 33 de resolución, igual que 255/294 y 271/304). El retraso es el tiempo real entre el límite que calculó Jira y el fin del ciclo (o ahora, si sigue corriendo). El tipo obsoleto no se ofrece como filtro. (2) **Ciclos abiertos en tickets ya cerrados:** Jira no detiene el reloj de primera respuesta si nunca hubo un comentario dirigido al cliente (caso real: JSMCO-344, en Hecho desde mayo con ese reloj corriendo 206 días; 44 de los 98 ciclos abiertos son así). No se pueden accionar, así que **no se listan en "Ciclos en curso ahora"** de `/sla` y se informan aparte con su número; en `/incumplimientos` sí aparecen, marcados "Ticket cerrado, reloj sin detener". Siguen contando en el cumplimiento, como Jira. (3) **"Ver más" en el móvil, regla permanente:** toda lista larga muestra en el móvil las 10 primeras filas y el resto detrás de "Ver más" (`<details>`, sin JavaScript); en pantalla ancha se ve completa. Aplicada a `/sla` (ciclos en curso), `/incumplimientos`, `/tareas` y `/capacidad`; la regla vive en un solo sitio (`phone-split.ts`). Las tablas pasan a tarjetas de dos columnas y los gráficos mantienen el texto legible y se desplazan de lado. Efecto medido: `/incumplimientos` baja de 9.200 a 5.400 px en el móvil.
- **Decidido por el Líder (2026-11-12): transparencia total.** Los tickets que incumplen **nunca se excluyen ni se esconden**. Los ciclos abiertos de tickets cerrados siguen contando como incumplidos (hoy son 2 en el trimestre en curso, igual que en Jira) y aparecen, marcados, en `/incumplimientos`; la nota de `/sla` que habla de ellos enlaza a esa lista. Esta es una regla permanente para todas las páginas.
- **Verificado:** pruebas de dominio (qué es un incumplimiento, orden, retraso, que cuadra con el cumplimiento, filtros), de integración en ambos adaptadores, matriz de autorización y navegador; revisión visual con los 1.046 tickets reales.

### D-055 · Página `/capacidad`: reparto de la carga y entrada contra salida — aprobada

- **Opción:** Mide **número de tareas abiertas por persona** (D-037); la medida está en una sola función del dominio (`loadOf`) para cambiarla a puntos de esfuerzo sin tocar las páginas. (1) **Entrada y salida:** cola actual, tareas que entran y que salen por mes (promedio de los **3 meses completos** anteriores, sin el mes en curso), la diferencia ("la cola crece" / "la cola baja"), los **meses para vaciar la cola** al ritmo actual (referencia, no predicción) y las tareas **sin responsable**, con enlace a esa lista. (2) **Gráfico de entrada y salida** de los últimos 6 meses. (3) **Reparto entre personas:** una barra por persona con una línea que marca el promedio y una etiqueta con palabra y símbolo (▲ por encima, ● en equilibrio, ▼ por debajo). **Equilibrado = a menos de ±25 % del promedio y nunca menos de 1 tarea** (con números pequeños, una tarea de diferencia no es desequilibrio). (4) **Detalle por persona:** abiertas, en curso, sin empezar, lo que terminó en los últimos 90 días y la diferencia con el promedio, con enlace a sus tareas abiertas. (5) Para ese enlace, el filtro de estado de `/tareas` gana la opción **"Todas las abiertas (sin Hecho)"**.
- **Quién cuenta como parte del equipo:** ver D-056 (lista de seis personas fijada por el Líder, que sustituyó a la regla inicial de "tareas abiertas o terminadas en 90 días").
- **Verificado:** pruebas de dominio (reparto, margen, quién cuenta, ritmo de entrada y salida), de integración en ambos adaptadores, matriz de autorización y navegador; revisión visual con los 1.046 tickets reales, en escritorio y móvil. Se corrigió además que los nombres de la primera columna de las tablas salieran en mayúsculas pequeñas.

### D-056 · `/capacidad` se estudia solo con las seis personas del equipo — aprobada

- **Opción:** El Líder fijó que la capacidad se analiza **solo con estas personas**: Paula Yeyati, Sebastian Hernandez, Andres Montagut, Maria Fernanda Barrera, Bon Thatthana y Juan José Gabelo. El resto de quienes aparecen como responsables son de otros equipos y no le afectan. (1) La lista vive en un solo sitio del dominio (`TEAM_MEMBERS` en `capacity.ts`). Un nombre coincide con el de Jira cuando **todas sus palabras** son palabras del nombre de Jira, sin importar mayúsculas ni tildes ("Paula Yeyati" encuentra a "Paula Yeyati Preiss"; "Sebastian Hernandez" **no** se confunde con "Sebastian Morales"). (2) **Las seis aparecen siempre**, aunque no tengan tareas: su capacidad libre cuenta para el promedio. (3) Entrada y salida, cola y gráfico mensual miden **las tareas del equipo y las que nadie tiene asignadas**; las de otros equipos no entran en ninguna cifra. (4) **Transparencia:** la página termina con "Fuera del análisis", que nombra a las personas de otros equipos con tareas abiertas y cuántas tienen (hoy 5 personas, 33 tareas), para que nada quede oculto. (5) Cambiar la lista es hoy un cambio de código; si el equipo cambia a menudo, el siguiente paso natural es una pantalla para el Líder (en `/permisos` o aparte).
- **Efecto con datos reales (2026-11-12):** promedio de 2,7 tareas abiertas por persona; Andrés Montagut (5) y Maria Fernanda Barrera (4) por encima; Bon Thatthana y Sebastian Hernandez (1) por debajo; la cola del equipo es de 16 tareas, entran unas 61 por mes y salen unas 64.
- **Verificado:** pruebas de dominio (reconocimiento de nombres incluidos casos que no deben confundirse, miembros sin tareas, exclusión de otros equipos en cifras y flujo, personas fuera del análisis), de integración en ambos adaptadores y revisión visual con los datos reales.

### D-057 · Página `/trimestres` (trimestre a trimestre) — aprobada

- **Opción:** Las mismas cifras para cada uno de los **últimos 8 trimestres** (dos años), empezando en el primer trimestre con algo que mostrar y terminando en el actual, que se marca **"en curso"** con los días transcurridos y no se compara con uno terminado. (1) **Gráfico de cumplimiento de SLA** por trimestre, con las dos métricas y la línea de la meta del 90 %. (2) **Gráfico de creados y resueltos** por trimestre. (3) **Tabla** (el trimestre más reciente primero): creados, resueltos, tiempo típico de resolución (mediana en días), cumplimiento de cada métrica con su "n de m" y el veredicto de la meta (✔ / ✖ con palabra). Cada trimestre se mide entero con la regla de siempre (D-042): un ciclo cuenta en el trimestre en que terminó.
- **Gráficos (mejoras comunes a todas las páginas):** los dos componentes de gráfico son genéricos (etiqueta, título y número de identificación como parámetros), con lo que el resumen, `/sla`, `/capacidad` y `/trimestres` comparten código. La meta del 90 % se explica en la leyenda y no encima de las barras. **En el móvil el gráfico se abre mostrando lo más reciente** y se desplaza hacia atrás (se logra sin JavaScript invirtiendo el sentido del desplazamiento del contenedor, no del gráfico). Los porcentajes de las tarjetas ya no se parten en dos líneas.
- **Lo que muestran los datos reales (2026-11-12):** el cumplimiento de primera respuesta pasó de 23,5 % (T2 2025) y 39,9 % (T1 2026) a 86,7 % (T2 2026), 100 % (T3 2026) y 97,9 % (T4 2026, en curso); la resolución, de 69,4 % (T4 2025) a 97,6 % (T3 2026). Cumplen la meta T3 2026 y T4 2026; el volumen creció de ~20-50 tickets por trimestre en 2025 a más de 300 en 2026.
- **Verificado:** pruebas de dominio (trimestres enteros, recorte de los vacíos del principio, el actual en curso, límite de 8) y de integración en ambos adaptadores, matriz de autorización y navegador; revisión visual con los datos reales, en escritorio y móvil.

### D-058 · Página `/estado`: salud del sync y calidad del dato — aprobada

- **Opción:** Página mínima para quien puede pedir una sincronización (el Líder por defecto; la ruta exige `action.sync`, el mismo permiso del botón: quien actúa sobre el sync es quien ve cómo va). Tres bloques: (1) **Sincronización**: estado ("Al día", "Actualizando…", "La última falló", "Datos de hace más de 15 min") y la última actualización correcta. (2) **Calidad del dato**, para saber cuánto fiarse de cada cifra: tickets guardados y abiertos, abiertos sin responsable (con enlace a la lista), ciclos abiertos en tickets cerrados (con enlace a los incumplimientos, D-054), ciclos en pausa, tickets de tipos retirados, y desde cuándo hay datos y cuál es el último cambio visto en Jira. (3) **Historial** de las últimas 20 ejecuciones: inicio en la zona de la persona, cómo empezó (botón, al abrir una página o programada), duración, resultado con palabra y símbolo, tickets leídos y el detalle del error si falló (siempre un texto corto y seguro, nunca credenciales ni respuestas de Jira). En el móvil, las 10 primeras y "Ver más".
- **Motivo:** Sin esta página, saber por qué los datos están viejos exigía mirar los registros del servidor. La calidad del dato es además la base de la futura página de definiciones.
- **Prueba de seguridad:** el Colaborador no ve la entrada en el menú, el código de su página no menciona la ruta, y `/estado` le responde exactamente igual que una página que no existe.
- **Mejora de las pruebas:** el tiempo máximo de arranque de cada archivo de pruebas de integración (cada uno levanta su propia base Postgres embebida) pasó de 10 a 60 s. Con decenas de archivos en paralelo, el límite anterior hacía fallar de forma intermitente pruebas que eran correctas.
- **Verificado:** pruebas de dominio (cada recuento de calidad, incluidos ciclos de tickets desconocidos), de integración en ambos adaptadores (permiso, historial en orden y limitado a 20, calidad del dato, antes del primer sync), matriz de autorización y navegador; revisión visual con los datos reales.

### D-059 · Página `/resumen`: la vista base de los tickets — aprobada

- **Opción:** Según lo descrito por el Líder: la vista base de los tickets, **visible para todos los roles** (`section.summary`, que el Colaborador tiene por defecto), alimentada **solo de Jira**, que sustituye al informe que hoy se arma a mano. Tiene el selector de periodo de siempre (trimestres rápidos y rango de fechas, en hora de Bogotá) y un **filtro por tipo de solicitud** que afecta a todas las cifras de la página y se conserva al cambiar de periodo (y el periodo al cambiar de tipo). Cifras, con su definición en un ⓘ:
  - **Creados:** tickets cuya fecha de creación cae en el periodo.
  - **Completados:** tickets que pasaron a Hecho en el periodo, sin importar cuándo se crearon.
  - **% completadas:** de los **creados en el periodo**, el porcentaje que ya está completado **hoy**. Los de un periodo reciente han tenido menos tiempo para completarse.
  - **Tiempo típico:** mediana de días entre crear y completar, de los completados en el periodo.
  - **En curso hoy / Sin empezar hoy:** tickets abiertos ahora, separados según la categoría de Jira (en curso incluye los que esperan algo, como aprobación o traducción). Son el estado de **hoy**, no del periodo.
  - Además: el gráfico mes a mes (los meses de los extremos cuentan solo sus días dentro del periodo), la tabla por tipo de solicitud (con creados, completados, % completadas y abiertos hoy; no se muestra si ya se filtró por un tipo) y los abiertos de hoy por estado.
- **Reglas que comparte con el resto:** los tipos retirados se ocultan de la tabla y del filtro pero siguen en los totales (D-052); el periodo usa las reglas de D-052 (un rango válido gana, uno inválido vuelve al trimestre en curso y se avisa); el filtro ignora un tipo que no existe.
- **Coherencia comprobada con datos reales:** T4 2026 da 149 creados y 152 completados, igual que el Resumen ejecutivo.
- **Pendiente de decisión:** si "en curso" debe significar otra cosa en vuestros informes (por ejemplo, solo "In progress" y no los estados de espera), basta con cambiar qué categoría cuenta; la definición vive en un solo sitio del dominio.
- **Verificado:** pruebas de dominio (cada cifra, meses cortados por el periodo, tipos retirados, filtro) y de integración en ambos adaptadores, matriz de autorización y navegador; revisión visual con los datos reales en escritorio y móvil.

### D-060 · Página `/definiciones`: qué significa cada cifra — aprobada

- **Opción:** Visible para **todos los roles** (`section.defs`). Explica en lenguaje llano cómo se calcula cada cifra del Hub, desde cuándo son los datos y cuánta confianza dar a cada una, para que nadie discuta qué significa "% completadas" o "SLA cumplido". Tiene: (1) **Fecha de corte y calidad del dato** arriba: la fecha de la última actualización correcta y los recuentos de lo guardado (tickets, abiertos, abiertos sin responsable, ciclos abiertos en tickets cerrados, ciclos en pausa, tickets de tipos retirados). Son solo recuentos, nunca tickets ni personas, por eso los ve cualquier rol. (2) Un **índice** y cinco grupos: de dónde salen los datos, tickets, SLAs, capacidad y cómo leer las páginas. Cada definición dice qué es, cómo se calcula cuando no es evidente y **dónde se ve**, con enlace.
- **Los números del texto salen del código:** el 90 % de la meta, los 15 y 5 minutos de refresco, el ±25 % y el mínimo de 1 tarea del equilibrio, los 90 días, los 3 meses, los 8 trimestres, el 20 % de protección contra borrados y las seis personas del equipo se leen de las mismas constantes que usa el cálculo. Una prueba comprueba que cada cifra del texto coincide, así que si alguien cambia una regla en el código y no el texto, falla antes de publicarse. Esa prueba cazó, en su primer día, una frase en la que faltaba el símbolo "%".
- **No enseña lo que no puedes abrir:** los enlaces "Dónde se ve" solo muestran las páginas que esa persona tiene permiso de ver (un Colaborador no ve el enlace a `/estado`), para no dejar rastro de lo oculto (SDD §10.3). Otra prueba comprueba que cada enlace apunta a una página que existe y que cada cifra que muestra el dashboard tiene su definición.
- **Móvil:** las definiciones se ven como entradas separadas por líneas, sin cajas, y cada grupo termina con "Volver al índice". Al ser una página de consulta con 30 entradas es larga (unos 8.500 px en el móvil); el índice es la forma de moverse.
- **Mantenimiento:** el texto vive en `src/presentation/definitions.ts`. Si cambia una regla de cálculo, se cambia allí junto con su decisión; si la regla usa una constante del dominio, el texto la sigue sola.
- **Pendiente de revisión del Líder:** el texto está redactado por el equipo técnico; conviene que el Líder lo lea una vez para confirmar que cada frase dice lo que el equipo entiende por esa cifra.

### D-061 · Página `/aprendido` ("Lo aprendido"): texto del Líder por trimestre, con versiones — aprobada

- **Opción:** Según lo pedido por el Líder: la página donde se cierra el análisis con interpretación humana, no solo con números. **Solo la ve y la escribe el Líder.** Por cada trimestre hay tres cuadros de texto: **Conclusiones del trimestre**, **Foco del siguiente trimestre** (el "foco del Q") y **Notas**. Se elige el trimestre con los botones de siempre (los 8 últimos, y se marca con ✎ los que ya tienen texto); se puede escribir en el actual y en los pasados, nunca en uno que no ha empezado.
- **Versiones, nunca se pisa nada:** cada "Guardar nueva versión" **añade** una versión con la fecha y el autor; las anteriores se conservan y se ven en "Versiones anteriores" (las 10 más recientes y el resto tras "Ver más"). Guardar dos veces el mismo texto no crea otra versión. La base de datos lo garantiza por sí misma: la tabla `learned_entry` rechaza cualquier `UPDATE`, `DELETE` o `TRUNCATE` (migración `0005_learned_entry`), y el rol de la aplicación tampoco tiene esos privilegios (`scripts/create-runtime-role.mjs`), igual que el registro de auditoría (D-017).
- **Permisos (dos, separados):** ver la página es `section.learn` y escribir es el permiso nuevo `action.learnedit`. **El rol Colaborador ya no recibe `section.learn` por defecto** (antes recibía todas las secciones, D-001), así que no ve la entrada del menú, y `/aprendido` y `POST /api/learned` le responden 404 vacío, igual que una página que no existe. Un Líder puede dárselos a otro rol más adelante. El caso de uso vuelve a comprobar ambos permisos además de la ruta.
- **Seguridad del texto:** lo escrito se muestra siempre como texto (nunca como HTML: `<b>` se ve tal cual), conserva sus saltos de línea y no empuja la página en horizontal. Cada cuadro admite hasta 8.000 caracteres; si se pasa, no se guarda nada y se avisa. El formulario lleva el token anti-CSRF, que se comprueba antes de leer nada más.
- **Auditoría:** cada guardado queda en el registro de auditoría (`learned.saved`, quién, cuándo y cuántos caracteres), **sin copiar el texto**, que vive en su propia tabla con su autoría.
- **Datos de prueba locales:** al verificar la página se escribió un texto de ejemplo en el trimestre T4 2026 de la base de datos **local** (no en producción). Por diseño no se puede borrar desde la aplicación.
- **Pendiente:** si el equipo quiere que más gente lea (no escriba) estas conclusiones, basta con asignar `section.learn` al rol; no hace falta cambiar código.
- **Verificado:** pruebas de dominio (normalización, límites), de integración en **los dos tipos de adaptador** (versiones, orden, trimestres, permisos, auditoría) y, en la base de datos real, que rechaza modificar, borrar y vaciar; matriz de autorización; navegador (el Líder escribe y guarda, un segundo guardado idéntico no añade nada; el Colaborador no ve rastro) y revisión con la base local.

### D-062 · Selector de zona horaria por persona (implementa D-043) — aprobada

- **Opción:** Cada persona elige en su **perfil** (arriba a la izquierda, se despliega al pulsarlo, sin JavaScript) la zona en la que ve las horas, entre las seis aprobadas en D-043: Colombia · Bogotá, Argentina · Mendoza, Argentina · Buenos Aires, España · Madrid, Portugal · Lisboa y Tailandia · Bangkok. Por defecto es Bogotá. La elección se guarda en la cuenta (`app_user.time_zone`) y por tanto **la acompaña en cualquier dispositivo**, a diferencia del tema claro/oscuro, que es del navegador.
- **Qué cambia y qué no:** cambia cómo se **muestran** las horas: la última actualización, los límites de los SLA, el historial de sincronizaciones, las versiones de "Lo aprendido", las fechas de las tareas. **No cambia ninguna cifra**: los meses y los trimestres se agrupan siempre en hora de Bogotá (D-043), así todo el equipo ve los mismos totales. El propio panel lo explica. Con datos reales, el mismo instante (12:01 en Bogotá) se ve 18:01 en Madrid, 00:01 del día siguiente en Bangkok y 14:01 en Mendoza.
- **Seguridad y reglas:** es una preferencia sobre la propia cuenta, así que basta con tener sesión; nadie puede cambiar la de otra persona. Solo se aceptan las seis zonas de la lista (se rechazan "UTC", "+05:00", "america/bogota" o cualquier otra), el formulario lleva el token anti-CSRF y una petición falsificada no cambia nada. Si una zona guardada deja de estar en la lista, se vuelve a Bogotá en lugar de romper la página. Al volver de guardar se conservan los filtros de la página.
- **Dónde está:** la zona viaja con el usuario de la sesión, así que todas las páginas la reciben sin consultas extra (`principal.user.timeZone`); el único sitio que decide qué zonas existen sigue siendo `src/domain/access/time-zone.ts`.
- **Verificado:** pruebas de integración en los dos tipos de adaptador (por defecto Bogotá, las seis zonas, no afecta a otras personas, rechazo de zonas no válidas, disponible para un Colaborador, zona guardada inválida en la base), matriz de autorización y navegador (cambiar a Madrid, ver la cabecera de `/estado` en Madrid y que una petición con token falso no cambie nada); revisión visual con los datos reales en escritorio y móvil.

### D-063 · Comparación con Jira: muestra de 30 tickets, los 1.046 y el recuento independiente — aprobada

- **Opción:** Antes de enseñar las cifras al equipo se comprobó que el Hub coincide con Jira. (1) **Muestra de 30 tickets** elegida para cubrir cada situación (cerrados cumplidos, cada tipo de incumplimiento, relojes en curso, vencidos y en pausa, reabiertos, sin responsable, tipos retirados, cada tipo de solicitud y cada trimestre), repetible, con una hoja para contrastar a ojo. (2) **Todos los tickets** (1.046) comparados campo a campo con una lectura en vivo de Jira. (3) **Recuento independiente** del cumplimiento de SLA de cada trimestre hecho directamente sobre las respuestas crudas de Jira, con código aparte del del Hub, y comparado con lo que muestra la página. Se ejecuta con `pnpm compare:jira` (30) y `pnpm compare:jira --all` (todos); solo lee, no modifica nada. Detalle del método en `docs/PRUEBAS.md`.
- **Resultado (2026-11-12):** coinciden 30/30, 1.046/1.046 y los 12 recuentos de SLA (6 trimestres × 2 métricas). Con T4 2026 como ejemplo: primera respuesta 138 cumplidos y 3 incumplidos; resolución 139 y 10.
- **Hallazgo durante la comparación:** la primera ejecución dio 8 diferencias, todas en el "límite" de relojes **en pausa**. No era un error del Hub: para un reloj en pausa Jira devuelve una proyección ("16 h restantes desde la próxima hora laboral") que recalcula en cada lectura, de modo que dos lecturas con segundos de diferencia dan valores distintos. El Hub ya excluye esos relojes de las cifras y de las listas (D-042), así que no afecta a nada. La comparación ahora ignora ese campo solo en relojes en pausa y lo prueba en los dos sentidos: sigue exigiendo que el límite de un reloj **en marcha** coincida, porque ese sí se usa.
- **Privacidad:** la hoja nombra tickets y personas, así que se escribe en `.data/` (ignorada por git). En el repositorio solo queda el método y los resultados agregados.
- **Alcance:** demuestra que el Hub guarda y cuenta lo que Jira dice. No valida que las reglas de D-042 sean las que el equipo quiere, ni que Jira calcule bien sus relojes.
- **Verificado:** pruebas unitarias de la elección de la muestra (variada, repetible, sin pasar del tamaño, cubre cada tipo) y de la comparación (detecta campos mal guardados, fechas, personas, ciclos y su forma de contar; distingue "el Hub está mal" de "Jira cambió después"; ignora el límite de un reloj en pausa y no el de uno en marcha; el recuento propio coincide con la agregación del Hub sobre los mismos datos).

### D-064 · Revisión de calidad de la Fase 1 (revisión de código y documentación) — aprobada

- **Qué disparó la revisión:** el trabajo toca zonas de riesgo (permisos y matriz de acceso, endpoints que escriben, migraciones, la función con secreto) y es de gran tamaño. Se revisó todo lo pendiente de commit de la fase, con prioridad en esas zonas. Después se actualizó la documentación.
- **Hallazgos corregidos (3):**
  1. **Un fallo al lanzar el sync no dejaba rastro.** El límite de "un intento cada 5 minutos" se calcula con la última ejecución registrada, y un lanzamiento fallido no registraba ninguna. Con la función caída o mal configurada, **cada visita a cualquier página** habría esperado hasta 5 segundos (el tiempo de espera del lanzador) para volver a fallar. Ahora un lanzamiento fallido queda como ejecución fallida ("No se pudo lanzar la sincronización en segundo plano"), el límite de 5 minutos rige y el Líder lo ve en `/estado`. Vale también para el botón. Probado en los dos tipos de adaptador.
  2. **En producción, el Colaborador seguiría viendo "Lo aprendido".** D-061 quitó `section.learn` de los permisos por defecto del Colaborador, pero esos valores se escriben **una sola vez, al crear el rol**, y el de producción existe desde el primer despliegue con todas las secciones. Es un fallo de privacidad de una página pensada solo para el Líder. Corregido con la migración `0006_learned_leader_only` (que además es segura de repetir y no toca otros permisos) y una prueba que reproduce el estado antiguo y aplica el mismo SQL que correrá en producción. El runbook de despliegue pide comprobarlo con un Colaborador.
  3. **`learned_entry` quedaba con privilegios de más para el rol de ejecución.** Los privilegios por defecto dan UPDATE y DELETE sobre toda tabla nueva; el trigger de la `0005` ya los rechaza, pero la `0006` los retira también (dos cerrojos, como `audit_log`) y el script de creación del rol ya no falla si se ejecuta antes que las migraciones.
- **Sugerencias que no se corrigen, con su motivo:**
  - Cada página lee todos los tickets y ciclos (hoy 1.046 y unos 2.000: sin problema). Vigilar al llegar a unos 10.000; la salida natural son agregados precalculados (SDD §12).
  - Dos guardados simultáneos con el mismo texto en "Lo aprendido" podrían crear dos versiones idénticas (la comprobación es leer y luego escribir). Efecto solo cosmético.
  - El límite de cuerpo es de 64 KB y hay tres cuadros de hasta 8.000 caracteres. Con texto en español caben (unos 27 KB); con muchos emojis podría rechazarse con "solicitud no válida".
  - Las seis personas del equipo de Capacidad están en el código (`TEAM_MEMBERS`): cambiarlas pide un cambio de código. Si el equipo cambia a menudo, el paso natural es una pantalla para el Líder.
  - "Fuera del análisis" enseña a todo el que ve Capacidad el nombre y la carga de personas de otros equipos. Es por transparencia (D-056); revisarlo si se amplía quién puede ver esa página.
  - `PUBLIC_APP_URL` en las vistas previas de Netlify: si apunta al dominio de producción, una vista previa lanzaría la función de **producción**. Conviene definir la variable por contexto de despliegue.
  - Cuatro avisos de dependencias (3 moderados, 1 bajo) en herramientas de desarrollo (`drizzle-kit`, la cadena de construcción de Netlify). No llegan a producción ni al umbral del CI (alto); se revisan con Dependabot.
- **Lo que se comprobó y está bien:** todos los endpoints que escriben comprueban el token anti-CSRF (el login es público por diseño y se protege con límite de intentos y comprobación de origen); no hay HTML sin escapar ni secretos en el código; la dirección de vuelta de los formularios solo admite páginas registradas; cada caso de uso vuelve a comprobar su permiso; las consultas van parametrizadas; la función en segundo plano autentica antes de abrir la base; y la copia de Jira coincide con Jira en los 1.046 tickets (D-063).
- **Veredicto:** aprobado tras los tres arreglos. 851 pruebas, lint, tipos, arquitectura y navegador en verde.
- **Documentación actualizada:** SDD v1.6 (páginas, permisos, tablas, `/estado`), `ACCESO_Y_SEGURIDAD.md` (permiso nuevo, valores por defecto, eventos de auditoría, lo que escribe una persona), `ARQUITECTURA.md` (puertos, modelo de datos y un resumen de la Fase 1), `COMO_EJECUTAR.md` (comandos nuevos), `PRUEBAS.md`, `runbooks/DESPLIEGUE.md` (migración 0006) y el runbook nuevo `runbooks/RESINCRONIZACION.md`.

### D-065 · Lighthouse y presupuesto de JavaScript en el pipeline — aprobada

- **Opción:** `pnpm perf` (`scripts/perf-check.mjs`) abre cada página del Hub como un Líder con un Chrome real y mide dos cosas. (1) **JavaScript descargado** (gzip) por página, con tope de 30 KB (SDD §12). (2) **Lighthouse en móvil con 4G lenta simulada**: rendimiento ≥ 90, accesibilidad ≥ 95, buenas prácticas ≥ 90, LCP ≤ 1,5 s y CLS ≤ 0,05. Si algo se pasa, el comando termina con error y el CI falla (job `performance`, después de `quality`). El log nombra lo que no es perfecto (por ejemplo `target-size` y el elemento), para que se sepa qué arreglar.
- **Resultado (2026-11-12):** las 11 páginas dan 100/100/100, 0,0 KB de JavaScript, LCP entre 0,8 y 1,2 s y CLS 0. El Hub no envía JavaScript: todo se pinta en el servidor.
- **Hallazgo:** `/definiciones` sacaba 96 en accesibilidad porque los enlaces del índice eran demasiado pequeños para tocarlos con el dedo (`target-size`). Cada enlace ocupa ahora su fila con 44 px de alto. Es justo la regla del usuario de que todo se lea bien en el móvil.
- **Por qué se mide contra `astro dev` y no contra la compilación:** el adaptador de Netlify no permite `astro preview`. Los scripts que solo existen en desarrollo (cliente de Vite, barra de herramientas, CSS servido como módulo) se excluyen del recuento. Por eso las notas de rendimiento son algo pesimistas respecto a producción (CSS sin minificar), no al revés.
- **Límite conocido:** en el CI la base está vacía, así que se miden las páginas sin datos. Con 1.046 tickets las tablas son más largas (en el móvil, 10 filas y "Ver más"), pero el JS sigue en cero. Se puede apuntar a otra instancia con `pnpm perf <url>` (por ejemplo la de Netlify tras el primer despliegue) para medir con datos reales.
- **Verificado:** ejecución local con las 11 páginas, antes y después del arreglo de `target-size`.

### D-066 · Primer despliegue: variables, escáner de secretos y empaquetado de la función — aprobada

- **Qué pasó:** la vista previa del PR falló tres veces seguidas por causas distintas, todas de configuración y ninguna del código. (1) `JIRA_API_TOKEN` y `SYNC_TRIGGER_SECRET` tenían valor solo en Producción; Astro valida los secretos al construir (SDD §15) y la vista previa los veía vacíos. (2) El escáner de secretos de Netlify bloqueó el build porque el correo de la cuenta de Jira aparecía como ejemplo en una página de documentación y en una prueba. (3) Lo mismo con `JIRA_PROJECT_KEY`, que es una etiqueta pública y aparece en ~180 sitios.
- **Decisiones:** las vistas previas llevan valores de relleno para los secretos y una `DATABASE_URL` que no conecta a nada (el repositorio es público y un PR ejecuta código con las variables de su contexto). El correo de la cuenta de Jira no se escribe en el código ni en ejemplos. La clave del proyecto se excluye del escáner con `SECRETS_SCAN_OMIT_KEYS` en `netlify.toml`, porque no es un secreto.
- **Hallazgo importante:** el log avisó de que Netlify volvía a empaquetar la función en segundo plano como CommonJS, lo que vacía `import.meta.url` y rompe el `require` de arranque. Antes de que llegara a producción se añadió `netlify.toml` con `node_bundler = "none"` para esa función.
- **Verificado:** el build compila en Netlify (`Generated SSR Function`); el resto se confirma en la vista previa y tras el primer despliegue (runbook de despliegue).

### D-067 · Rediseño visual con Stitch: tokens Volare, `light-dark()` y puerta de diseño — aprobada

- **Qué cambia:** solo la capa de presentación. Consultas, cálculos, endpoints, esquema, roles y permisos no se tocan.
- **Fuente de verdad:** `docs/DESIGN.md` es la versión larga del proyecto de Stitch (con §8 gráficos, §9 patrones de página, §10 accesibilidad, §12 tokens). La exportación corta (YAML) queda en `docs/DESIGN.stitch-corto.md`. Las pantallas de Stitch son **referencia visual, no especificación**: la del Resumen ejecutivo traía un candado en "Permisos", etiquetas en mayúsculas, Tailwind, fuentes e iconos por CDN, y se corrigieron al implementarla.
- **Tokens en dos capas** (`styles/tokens.css`): primitivas Volare y capa semántica (`--bg`, `--surface`, `--text`, `--accent`, `--chart-1..6`...). Cada token semántico se escribe una vez con `light-dark(claro, oscuro)` y el tema sale de `color-scheme` (elección de la persona en `data-theme`, o el dispositivo). Los nombres antiguos (`--ink`, `--page`...) siguen como alias temporales hasta migrar la última página.
- **Puerta de diseño** (`pnpm check:design`, `scripts/check-design.mjs`): falla si hay un color, radio o sombra escritos fuera de `tokens.css`, y comprueba el contraste WCAG AA de cada par de tokens en claro y oscuro. Hallazgos que se resolvieron: el texto del elemento seleccionado del menú (Magenta 500 sobre Magenta 100 da 4,47:1) pasa a Magenta 600 en claro y Magenta 200 en oscuro; el primer píxel del degradado del botón con texto blanco da 4,48:1 y el texto real empieza al 15 % (4,68:1).
- **Límites del propio DESIGN.md, sin corregir:** el borde de los campos (`#CCD0D7`) sobre blanco da 1,55:1; las series 3 y 6 de los gráficos (Amber 400, Baby blue 500) dan menos de 3:1 sobre blanco, por lo que hoy no se usan (los gráficos del Hub tienen dos series) y, si hace falta una tercera, irá siempre con etiqueta directa.
- **Modo oscuro:** [Proposed] en el DESIGN.md. Para los estados (éxito, aviso, error, información) se usan los tonos 300 de cada familia como texto y un 16–20 % del acento sobre la superficie como fondo.

### D-068 · Mulish alojada, variable y latina — aprobada

- **Decisión:** `public/fonts/mulish-latin-wght.woff2` (30 KB, pesos 200–1000, licencia OFL junto al archivo), `font-display: swap`, `preload` en el layout y una fuente de respaldo (Arial con `size-adjust` 100,14 %, `ascent-override` 100,36 %, `descent-override` 24,97 %) para no mover la página al llegar la fuente. Se usan los pesos 300, 400 y 600.
- **Cifras tabulares:** Mulish **no trae la característica `tnum`**, pero sus diez dígitos miden lo mismo (600 de 1000) en todos los pesos, así que ya son tabulares. `font-variant-numeric: tabular-nums` se mantiene en las cifras para cuando se cambie de fuente. No hace falta respaldo.
- **Revisar si se cambia a Modern Era:** basta con cambiar `--font-sans` y recalcular las métricas del respaldo.

### D-069 · Iconos SVG propios en línea — aprobada

- **Decisión:** `presentation/icons.ts` + `Icon.astro`: trazo de 1,5 px, 20 px (16 px en chips y tablas), sin fuente ni librería de iconos (SDD §12). Se sustituyen por el paquete Volare o por un subconjunto SVG aprobado cuando llegue (DESIGN.md §13.6).

### D-070 · Navegación: grupos, icono de 72 px y panel sin JavaScript — aprobada

- **Decisión:** el registro de rutas lleva `menuGroup` y `menuIcon`. La navegación es 248 px desde 1440 px, una tira de iconos de 72 px entre 768 y 1439 px, y un panel superpuesto por debajo de 768 px. El panel y el menú de la persona usan el atributo `popover` del navegador: cierran con Esc y al pulsar fuera, y la página sigue con **0 KB de JavaScript**.
- **Ocultar sin candados:** un grupo sin ninguna entrada visible no se dibuja, ni su título (`groupMenu`, con prueba). Los enlaces dentro de una página ("Ver el detalle de SLAs", "Cómo se calcula", "Siguiente") solo aparecen si la persona puede abrir ese destino.
- **Estado de la sincronización:** cada página migrada entrega `sync` al layout (sin consultas nuevas) y la barra superior muestra "Datos al ‹hora›" y, solo con `action.sync`, "Resincronizar con Jira". Las páginas sin migrar conservan su panel de sincronización.
- **Etiquetas de la tira de iconos:** salen de `data-label` con `content: attr(...) / ''`, para que no se sumen al nombre accesible del enlace.
- **Tooltip ⓘ:** sigue siendo un `<details>` (clic, toque o Enter). El DESIGN.md pide también al pasar el ratón; no se hace porque en el teléfono no existe el ratón y no hay JavaScript.

### D-071 · Gráficos SVG de servidor con la paleta del DESIGN.md §8 — aprobada

- **Decisión:** series en orden Magenta 400 y **Blue 400 `#327DF0`** (no el Blue 500 de la pantalla de Stitch). Contraste sobre la tarjeta: 3,86:1 y 3,94:1 en claro, 4,69:1 y 5,40:1 en oscuro. Se distinguen entre sí (ΔE ≥ 60 incluso con protanopía, deuteranopía y tritanopía) y además cada barra lleva su valor escrito y la leyenda. Rejilla horizontal con valores redondos (`niceTicks`, con prueba), sin librerías. Cada gráfico conserva su alternativa textual (`<title>` y `<desc>`).

### D-072 · Elementos de la pantalla de Stitch sin fuente de datos — pendiente

- **Fuera por ahora, a decidir:** "Puntos de atención" (el caso de uso no calcula alertas; derivarlas sería lógica nueva en dominio), "Mensaje del líder" (existe el texto de "Lo aprendido", pero con otro permiso: `section.learn`) y los filtros de tipo y fechas del Resumen ejecutivo (esa página es siempre trimestre actual frente al anterior; los filtros viven en `/resumen`). Tampoco se dibujan "Configuración" ni "Ayuda" del pie del menú (no tienen ruta).
- **Se implementan porque sí hay dato:** el chip "Cumple la meta · meta 90 %", los deltas frente al mismo tramo del trimestre anterior, el pie "Siguiente" y la insignia de rol.

### D-073 · Nombres claros para dos cifras de `/resumen` y recuento de "Launch New Content" — aprobada

- **Qué pasó:** en `/resumen`, la fila "Launch New Content" mostraba 2 creados, 5 completados y 0 % completadas, y parecía contradictoria.
- **Causa:** no era un error de cálculo. "Completados" cuenta los tickets que pasaron a Hecho **en el periodo, sin importar cuándo se crearon**, y "% completadas" mira solo **lo creado en el periodo** y si ya está completado hoy. Los 5 completados salieron de trabajo de trimestres anteriores y los 2 creados siguen abiertos. Dos poblaciones distintas en la misma fila.
- **Decisión:** solo cambian los nombres, los tooltips y las notas; las fórmulas, las columnas y las consultas siguen igual.
  - "Completados" pasa a **"Completados en el periodo"** (en el gráfico mensual, "Completados en el mes").
  - "% completadas" pasa a **"% de lo creado ya completado"**.
  - Las dos cabeceras de la tabla y las dos tarjetas llevan un tooltip que explica la diferencia, con el caso de 0 % como ejemplo.
  - Al pie de la tabla: "Los tipos obsoletos no aparecen en la tabla, pero sí en los totales."
  - La página Definiciones explica las dos cifras con ese ejemplo y añade la entrada "Tipos de solicitud obsoletos".
- **Recuento independiente (2026-11-12, `node --env-file=.env scripts/recount-type.mjs "Launch New Content" 2026-T4`):** repite las reglas de las definiciones con código aparte, leyendo los 39 tickets del tipo directamente de Jira (solo lectura). T4 2026: **2 creados, 5 completados en el periodo, 0 creados ya completados, 0 %**. Coincide con lo que muestra el Hub. Los 5 completados se crearon entre julio y septiembre. Otros trimestres: T1 9/3/100 %, T2 18/17/100 %, T3 10/12/100 %.
- **Alcance:** demuestra que el Hub cuenta lo que Jira dice para este tipo. No valida las reglas de "completado" (D-059, D-060), solo que se aplican igual en dos implementaciones.

### D-074 · Rediseño de `/tareas`, `/sla` y `/incumplimientos` — aprobada

- **Patrones aplicados (DESIGN.md §9):** barra de filtros en una tarjeta (`FilterBar`, formulario GET sin JavaScript, con "Limpiar"), tarjetas de SLA con la meta al 90 %, gráfico mensual con rejilla (0, 25, 50, 75, 100), línea discontinua y etiqueta "Meta 90 %", tablas en tarjeta con cabecera de 40 px y filas de 48 px, y paginador con botones de 44 px. Los estados de los tickets, los cumplimientos y los retrasos se dibujan como **chips con icono y palabra** (no con "✔/✖" ni solo con color): el estado sigue la categoría de Jira y conserva el nombre que le da Jira, y el chip de retraso o de cumplimiento lleva un texto extra para lectores de pantalla ("cumple la meta", "SLA incumplido").
- **Móvil:** se conservan "tabla en pantalla ancha y lista con Ver más en el teléfono" y el desplazamiento lateral del gráfico. Se corrigió que las celdas apiladas heredaran la altura fija de 48 px (se superponían los textos largos).
- **Sin cambios de datos:** mismos casos de uso, consultas, filtros, orden y paginación.
- **Fuera por falta de dato (pendiente de decisión, como D-072):** DESIGN.md §9 propone para Tareas una fila de KPI ("% completadas", tareas por tipo y por estado) y dos gráficos. El caso de uso de Tareas solo devuelve la lista filtrada y sus opciones; calcular esos agregados sería lógica nueva en dominio, así que no se dibujan ni se simulan.
- **Enlaces con permiso:** en `/sla`, el enlace a "SLAs incumplidos" y la frase que lo acompaña solo aparecen para quien puede abrir esa página (antes salía siempre).
- **Mediciones:** accesibilidad 100 en todas las páginas. El LCP del servidor de desarrollo de estas tres páginas subió (1814 → 1963, 1659 → 1811 y 1534 → 1659 ms), todas ya por encima de 1500 ms o muy cerca; el servidor de desarrollo sirve cuatro hojas de estilo sin comprimir ni minificar. La compilación de producción genera **una sola hoja de 31,9 KB (6,8 KB comprimida con gzip)**. Falta medir el LCP en la vista previa de Netlify; si allí sigue por encima de 1500 ms, la causa se investiga (hoy los candidatos son las tablas largas de 25 filas y la fuente de 30 KB).

### D-075 · Rediseño de `/capacidad`, `/trimestres` y `/definiciones`; pantallas de Stitch para Estado y Permisos — aprobada

- **Capacidad:** las seis cifras de entrada y salida van en tarjetas de KPI; la "Diferencia por mes" lleva flecha, color y palabras (si entra más de lo que sale es mala noticia; si sale más, buena). El reparto entre personas se dibuja con barras que llevan un chip con icono y palabra: **por encima del promedio = aviso** (antes, rojo), **en equilibrio = éxito** y **por debajo del promedio = información** (antes, ámbar); más carga que el promedio es una alerta, no un error, y menos es capacidad libre. La línea del promedio sigue en cada barra. Los enlaces a `/tareas` ("Ver las N tareas abiertas sin responsable", "Ver abiertas") solo aparecen a quien puede abrir esa página.
- **Trimestre a trimestre:** dos gráficos (SLA con la meta del 90 % y creados frente a resueltos) y la tabla con chips de cumplimiento. El trimestre en curso se avisa con un aviso informativo.
- **Definiciones:** índice a la izquierda (fijo al hacer scroll desde 1024 px) y definiciones a la derecha; búsqueda por GET sin JavaScript (`filterDefinitionGroups`, sin acentos ni mayúsculas, con prueba) sobre el propio texto de la página: no busca tickets ni personas. Se actualizó el texto de la zona horaria ("tu nombre, al pie del menú") porque el perfil se mudó.
- **Sin cambios de datos:** mismos casos de uso y cálculos. Del DESIGN.md §9 no se dibujan, por falta de dato, los chips de variación entre trimestres ("delta") ni el gráfico combinado de Capacidad con línea: calcularlos sería lógica nueva.
- **Encabezados:** `ChartCard` usa `h2` (antes `h3`), porque la tarjeta es un bloque de página y a veces aparece sin un `h2` antes (Lighthouse avisó del orden de encabezados). Los estados vacíos usan párrafo, no encabezado.
- **Pantallas de Stitch para las páginas sin patrón (§9):** generadas **Estado** y **Permisos**; **Lo aprendido** se agotó el tiempo dos veces y no aparece en el proyecto. Lo que traen y cómo se resuelve al implementarlas: (1) vuelven a usar **mayúsculas** en etiquetas, cabeceras de tabla y grupos del menú, lo que contradice DESIGN §3: se escribirán en minúscula de frase; (2) en Permisos la columna "Acciones" queda **cortada** a 1440 px (hay que ajustar anchos o apilar controles) y el correo de la persona desactivada aparece **tachado** (no está en el diseño del sistema: se muestra con el chip "Desactivado"); (3) en Estado el "Estado" y la "Última actualización" son dos tarjetas de 56 px y el resto de cifras son tarjetas de KPI como en las demás páginas; (4) a Permisos **no se le añade la matriz de permisos por sección** del §9, porque esa función no existe todavía (SDD §10.2).

### D-076 · Rediseño de `/estado` y `/permisos`, miles con punto y qué pasa con el LCP — aprobada

- **Estado:** el "Estado" de la conexión es un chip con icono y palabra (Al día, Actualizando…, La última falló, Sin datos todavía, Datos de hace más de 15 min) y una línea que lo explica; la fecha de la última actualización correcta y las seis cifras de calidad del dato van en tarjetas; las ejecuciones se listan en una tabla con chips (Correcta, Falló, En curso). Los enlaces ("Ver los tickets abiertos sin responsable", "Ver los incumplimientos") solo aparecen a quien puede abrir ese destino. La pantalla de Stitch usaba mayúsculas en etiquetas y cabeceras; se escribió en minúscula de frase (DESIGN.md §3).
- **Permisos:** invitación en una fila (correo, rol y botón; la casilla de confirmación debajo, con área táctil de 44 px) y tabla de personas con chip de estado (Invitado, Activo, Desactivado; icono y palabra), selector de rol, "Confirmar Líder", "Cambiar rol" y "Dar de baja" (contorno rojo) o "Reactivar". Las acciones, los campos y las rutas son exactamente los de antes: solo cambia la presentación. No se dibuja la matriz de permisos por sección del §9, porque esa función no existe (SDD §10.2), ni se tacha el correo de la persona desactivada (no está en el sistema de diseño). **Esta página no muestra "Datos al ‹hora›" en la barra superior**: no lee el estado de Jira y añadir esa lectura sería una consulta nueva.
- **Miles con punto:** `formatNumber` agrupa siempre ("1.046", "12.345,6"); el español de `Intl` deja sin agrupar los números de cuatro cifras. Lo pide DESIGN.md §10 y la pantalla de Stitch lo muestra así. Afecta a todas las páginas.
- **LCP (hallazgo):** en las páginas medidas el LCP coincide con el FCP, o sea que lo fija el primer pintado, no una imagen, un gráfico ni la fuente. El tiempo de respuesta del servidor es de 30 a 70 ms en todas; lo que cambia es el **tamaño del documento sin comprimir** que sirve el servidor de desarrollo: `/trimestres` 157 KB y `/definiciones` 155 KB (LCP 1361 y 1378 ms), `/estado` 195 KB (1664 ms) y `/tareas` 266 KB (1980 ms). Con una descarga simulada de 4G, el LCP sube con el tamaño. En producción, Netlify comprime (gzip o Brotli) y no hay barra de desarrollo, así que el tamaño real es una fracción; **sigue sin medirse en producción** (falta la vista previa de Netlify). Qué se puede recortar si allí sigue por encima de 1500 ms: la tabla de Tareas y la de Incumplimientos se dibujan dos veces (versión ancha y versión del teléfono) y cada chip lleva un icono SVG en línea.

### D-077 · La prueba de rendimiento de CI no mide las anotaciones de la barra de desarrollo — aprobada

- **Qué se encontró:** la prueba de rendimiento de CI mide las páginas que sirve `astro dev` con la base vacía. En ese modo la barra de desarrollo de Astro añade a cada elemento los atributos `data-astro-source-file` y `data-astro-source-loc`. En `/capacidad` eran **75,5 KB de 160 KB** del documento (el 47 %), y el LCP coincide con el FCP y sube con el tamaño (D-076). Resultado: `/capacidad` marcó 1542 ms con un límite de 1500, por culpa de un ruido que producción no envía. Es la misma causa que D-076 describe para las cinco páginas lentas en local, ahora con la cifra.
- **Decisión:** `astro.config.mjs` apaga la barra de desarrollo (`devToolbar.enabled`) cuando existe la variable `CI`. En la máquina de cada persona la barra sigue como siempre. El presupuesto (LCP ≤ 1500 ms, JS ≤ 30 KB, CLS ≤ 0,05, puntuaciones ≥ 0,95) **no cambia**.
- **Efecto medido (base vacía, servidor de desarrollo):** `/capacidad` 160 → 84 KB y LCP 1366 → 1065 ms; `/trimestres` 85 → 62 KB y 1063 → 916 ms; `/` 123 → 75 KB y 1220 → 1064 ms. Con las once páginas, el LCP queda entre 910 y 1081 ms.
- **Lo que esto no resuelve:** la prueba sigue midiendo el servidor de desarrollo, que incluye unos 50 KB de CSS en línea que producción sirve como un archivo comprimido de unos 7 KB, y sigue midiendo páginas vacías. Una medición sobre `astro build` y la vista previa de Netlify con datos reales continúa pendiente. Hasta entonces, la prueba protege contra regresiones relativas, no mide lo que ve una persona.

### D-078 · Filtro global de período y tipos en cuatro páginas (fase 1.5a) — aprobada

- **Qué:** Resumen ejecutivo, Resumen, SLAs y SLAs incumplidos comparten un filtro (período y tipos de solicitud). Reemplaza los filtros propios de `/resumen`, `/sla` y `/incumplimientos` y la lógica "trimestre en curso frente al anterior" de `/`. **Sustituye la parte de D-072** que dejó fuera los filtros del Resumen ejecutivo.
- **Por defecto:** los últimos 30 días, hoy incluido, en hora de Bogotá, con todos los tipos. Un período que llega más allá de hoy se corta en hoy y lo dice ("hasta hoy"). Un trimestre futuro, un rango al revés o de más de 3 años, un año fuera de 2000–2100 o texto ilegible vuelven al valor por defecto y la página lo avisa.
- **Tipos:** selección múltiple. Sin tipos, o con todos los vigentes, equivale a "todos" y entonces **sí se cuentan los tipos retirados** en los totales (como hasta ahora); con tipos concretos solo se cuentan esos. Una selección vacía o con tipos que no existen vuelve a "todos" con un aviso. Con "todos", un ciclo cuyo ticket no está en la caché se sigue contando (las cifras no cambian); con una selección, no se puede asignar a un tipo y queda fuera.
- **Dónde vive:** la dirección es la fuente de verdad (`periodo`, `anio`, `desde`, `hasta`, `tipos`, `comparar`); los enlaces antiguos `trimestre=2026-T3` y `tipo=X` se siguen leyendo. Una cookie de sesión (`hub_filter`, `HttpOnly`, `SameSite=Lax`, sin caducidad, `__Host-` con https) guarda la última elección válida como los mismos parámetros cortos, con el año del trimestre siempre explícito; el valor por defecto no se guarda. "Restablecer" la borra. Los enlaces del menú a las cuatro páginas llevan el filtro; los demás no.
- **Sin JavaScript** (la parte de "sin script" de este punto, y D-0f, quedan reemplazadas por D-081: el filtro lleva ahora un script pequeño de mejora progresiva; todo lo de aquí sigue funcionando sin él): el formulario devuelve además las fechas con las que se dibujó (`desde0`, `hasta0`) y la marca `tipos_form`. Si las fechas no cambiaron, mandan el chip y el año; si cambiaron, es un rango propio; sin chip, las fechas son el período. Al aplicar, la página responde con un 303 a la dirección más corta. Límites asumidos (D-0f): el desplegable de tipos no se cierra al pulsar fuera ni con Esc, y no se puede impedir dejarlo vacío (el servidor lo trata como "todos" y avisa). Los trimestres futuros no se desactivan en los chips, porque cambiar el año no puede actualizarlos sin script: el servidor los rechaza con el aviso.
- **Gráficos:** una barra por día hasta 14 días, por semana hasta 100 y por mes después. Las semanas se cuentan desde el primer día del período (no desde el lunes), para que la "semana 1" caiga en los mismos días un año antes. En SLAs la barra más fina es la semana. Un período sin actividad no dibuja barras y lo dice.
- **Carga:** las cuatro páginas siguen haciendo dos lecturas (tickets y ciclos); los dos rangos de una futura comparación se calculan en memoria. No hay caché (D-0h: se decide con números).
- **Implementación:** `COMPARE_ENABLED = false` en `report-context.ts`: hasta que las cuatro páginas dibujen la comparación (D-0k), el interruptor no existe y `comparar` se ignora.

### D-079 · Con qué se compara el Resumen ejecutivo y cómo se escriben las diferencias — aprobada

- **Comparación apagada (fase 1.5a):** con un chip de trimestre, los primeros N días del trimestre anterior (como hasta ahora, y nunca más allá de su fin); con "30 días" o un rango propio, los N días justo antes. Siempre el mismo número de días.
- **Diferencias:** porcentaje para conteos, puntos para tasas y días para tiempos, con el valor anterior entre paréntesis ("+16 % vs período anterior (102)"). Con menos de 30 casos en el lado anterior (`MIN_RELIABLE_SAMPLE`) un conteo muestra la diferencia absoluta y no el porcentaje, porque doce tickets contra cien no son "+800 %". Un anterior de 0 se escribe "—". La constante depende de los datos, no del calendario.
- **Efecto:** el delta de `/` cambia de diferencia absoluta a porcentaje, y el SLA anterior se mide sobre el mismo tramo y no sobre el trimestre anterior entero.

### D-080 · Los tokens de comparación y la reserva del morado — aprobada

- `--compare`, `--compare-fill`, `--compare-bg` y `--compare-border` sobre los primitivos de Volare Purple (`docs/DESIGN.md` §14). La trama de rayas (`--compare-fill` sobre `--compare-bg`) mide 2,89:1 en el tema claro, por debajo de 3:1, así que cada barra del año previo lleva además un borde de 1,5 px en `--compare`; `check-design` lo informa.
- El morado sale de las series de gráficos (son cinco ahora; la quinta es Baby blue) porque queda reservado al año previo.

### D-081 · Un script pequeño de mejora progresiva para el filtro global — aprobada

- **Qué cambia:** reemplaza la parte de "sin script" de D-078 y D-0f. Las páginas del Hub dejan de ser de **0 KB de JavaScript**: las cuatro que muestran el filtro cargan un único script propio, `public/js/global-filter.js` (módulo, mismo origen, así que cubre `script-src 'self'`; sin librerías). Todas las demás páginas siguen en 0 KB. El formulario sigue funcionando exactamente igual sin el script: este solo añade comodidad y nunca sustituye lo que decide el servidor.
- **Presupuesto:** **2 KB gzip como máximo** para el script, en esas cuatro páginas (`FILTER_PAGE_JS_KB` en `scripts/perf-check.mjs`; el resto de las páginas se miden contra 0). Medido: **1,81 KB** con la compresión de `pnpm perf` (antes, 0), 1,55 KB con brotli. El límite general de 30 KB del SDD §12 no cambia.
- **Qué hace:**
  - _Tipos de solicitud:_ el desplegable se cierra con Esc (y el foco vuelve a su botón), al pulsar fuera y al salir con Tab; solo uno abierto a la vez; `aria-expanded` sincronizado; no deja desmarcar el último tipo (lo vuelve a marcar y lo dice en una región `role="status"` junto al desplegable); la etiqueta ("Todos los tipos (5)", "2 de 5 tipos") cambia al instante. El servidor sigue siendo la fuente de verdad al aplicar.
  - _Fechas:_ un clic en cualquier parte del campo abre el calendario con `showPicker()` dentro de `try/catch`; se puede seguir escribiendo con Tab o cerrando el calendario con Esc. Con el script activo se oculta el icono nativo del navegador (donde el navegador lo permite) para no duplicar el del diseño; sin el script se queda, porque es la única forma de abrir el calendario.
  - _Chips de trimestre:_ al cambiar el año se desactivan los trimestres que aún no han empezado. "Hoy" lo manda el servidor en `data-today` (hora de Bogotá): el navegador no calcula fechas. Si el chip marcado queda desactivado, pasa a marcarse el último trimestre disponible (o "30 días"). El servidor sigue validando igual y rechaza lo que no sea válido.
- **Lo que no cambia:** las pruebas e2e del filtro corren ahora con JavaScript **desactivado** (`global-filter.spec.ts`) y siguen pasando sin cambios; las del script tienen su propio archivo (`global-filter-js.spec.ts`). Se fijó el ancho de los campos de fecha: sin eso, ocultar el icono nativo movía el diseño tras el primer pintado (CLS 0,04).
- **Navegadores (probado con Chromium 158, Firefox 159 y el WebKit de Playwright 27.2):** `showPicker()` se acepta tras un clic en los tres; escribir con Tab y clic + Esc + escribir funciona en Chromium y Firefox. **Límites conocidos:** (1) el formato visible de la fecha (dd/mm/aaaa o mm/dd/aaaa) y el orden de los segmentos dependen del idioma del navegador y no se pueden forzar; (2) Firefox muestra su propio icono de calendario junto a cada fecha y no permite ocultarlo, así que allí se ven dos; (3) el WebKit de Playwright dibuja la fecha como un campo de texto, así que **Safari real no está verificado**; (4) el calendario nativo no se puede probar en automático: se prueba que se pide, no que se dibuje; (5) dentro de las fechas, el clic abre el calendario también cuando se quería escribir: hay que cerrarlo con Esc.
