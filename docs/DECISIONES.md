# Decisiones (mini-ADR)

Registro de decisiones no cubiertas por el SDD (sección 0, punto 4 y sección 3, regla 8).
Estado: `aprobada` = confirmada por Sebas; `revisar` = a confirmar.

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

### D-015 · Driver de Postgres en producción: `pg` — revisar

- **Opción:** `pg` (node-postgres) con la cadena de conexión _pooled_ de Netlify DB / Neon. Local y pruebas: PGlite. La elección se hace por el prefijo de `DATABASE_URL` (`pglite:` o `postgres://`).
- **Motivo:** El SDD pide "driver serverless" (§2). `pg` funciona en Netlify Functions con el endpoint con pooler, soporta transacciones (necesarias para las reglas "siempre al menos un Líder") y es portable a cualquier otro hosting o a Docker. **Pendiente de revisar** en la Fase 5 con pruebas de carga; si hay problemas de conexiones, se cambia a `@neondatabase/serverless` solo en `client.ts`.

### D-016 · Unicidad de `webhook_event.delivery_id` — aprobada

- **Opción:** Índice único compuesto `(source, delivery_id)`.
- **Motivo:** El SDD dice "único"; con dos orígenes (Jira y Crowdin) un identificador podría coincidir entre ellos. La idempotencia por origen es equivalente y más segura.

### D-017 · Tabla `permission` y `audit_log` — aprobada

- **Opción:** `permission` es un catálogo (`key`) poblado desde el dominio. `audit_log` es de solo inserción mediante trigger en la propia base de datos (rechaza UPDATE, DELETE y TRUNCATE); la retención ≥ 1 año (§11.2) se hará con un rol de mantenimiento en una fase posterior.
- **Motivo:** §4.3 y §11.2 piden inmutabilidad; hacerla cumplir en la base de datos evita que un error de código la rompa.
