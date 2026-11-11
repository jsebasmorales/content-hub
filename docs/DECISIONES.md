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
