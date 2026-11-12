# Plan de la Fase 1 · Jira + dashboard

Fuente: SDD v1.5 (§4.1, §5, §6, §10, §12, §16) y decisiones D-001 a D-038. Estado de partida: Fase 0
desplegada y verificada en producción (login Atlassian, sesiones, `AccessPolicy`, CSP, rol de ejecución).

## Objetivo y criterios de aceptación (SDD §16)

1. Un cambio en Jira se refleja en el Hub en **≤ 15 min**, o en segundos con el botón (D-034, D-035).
2. El sync es **idempotente** y nunca corren dos a la vez.
3. Se cumple el **presupuesto de rendimiento** (§12): LCP ≤ 1,5 s, JS ≤ 30 KB gzip, TTFB ≤ 200 ms.
4. Las cifras **coinciden con Jira en una muestra de 30 tickets**.

## Modelo de actualización (decidido)

Sin webhook ni reglas de Automatización. Tres disparadores para el mismo caso de uso:

| Disparador            | Quién                        | Detalle                                                                             |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Perezoso              | Cualquier usuario con sesión | Al abrir el dashboard, si el último sync exitoso tiene > 15 min (máx. 1 cada 5 min) |
| Botón "Resincronizar" | Solo Líder (`action.sync`)   | 1 por minuto por usuario; oculto para el resto                                      |
| Función programada    | Nadie (opcional)             | Desactivada al inicio; 30 min si se activa                                          |

Las páginas solo leen de Postgres y muestran "Última actualización: fecha y hora" (D-038).

## Riesgos que condicionan el orden

| Riesgo                                                 | Por qué importa                                                                                                  | Cómo se cierra                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ~~Lectura de SLAs~~                                    | Resuelto: la cuenta los lee y vienen dentro de la búsqueda (D-036, D-039)                                        | Paso 1.0 hecho                                                |
| Los tickets de JSMCO **no tienen épicas ni objetivos** | `/objetivos` y el % de esfuerzo por objetivo quedan **en espera** (D-041) hasta que el equipo los defina en Jira | El resto de las páginas no depende de esto                    |
| Los estados reales no son los del SDD                  | Resuelto: solo `In progress` cuenta como trabajo activo (D-040)                                                  | Hecho                                                         |
| ~~`JIRA_PROJECT_KEY` sin confirmar~~                   | Resuelto: la clave es `JSMCO`                                                                                    | Paso 1.0 hecho                                                |
| Background Functions de Netlify                        | El sync largo no cabe en una petición; hay que invocarlas de forma autenticada                                   | Paso 1.7                                                      |
| Créditos de Netlify (300 al mes)                       | La carga inicial y los syncs gastan invocaciones                                                                 | Sync incremental, sin cron al inicio; medir la primera semana |
| La carga inicial son unas 11 páginas (1.046 tickets)   | Cabe en una Background Function                                                                                  | Por lotes, con progreso en `sync_run`                         |

## Pasos (en orden; cada uno cierra con pruebas y entrada en DECISIONES.md)

### 1.0 Descubrimiento contra el Jira real — **hecho (2026-11-11)**

Usa las llaves ya guardadas en `.env`. Entregables:

- `docs/jira-mapping.md` (§6.3): estados, tipos de solicitud, relación ticket → épica, ids de campos
  personalizados, muestra anonimizada de respuestas reales (sirve luego como fixtures de contrato).
- Resultado: clave `JSMCO`, la cuenta lee SLAs y estos vienen en la búsqueda (D-039). Ver `docs/jira-mapping.md`.
- Un script `scripts/probe-jira.mjs` de solo lectura que ejecuta esas comprobaciones y se puede repetir.

### 1.1 Configuración — **hecho (2026-11-11)**

- `env-rules.ts`: el grupo Jira pasa de opcional a **requerido** (D-005); `JIRA_BASE_URL` solo `https`
  y dominio `*.atlassian.net`; `JIRA_CUSTOM_FIELD_*` (ids leídos de configuración, nunca en código).
- Esquema `astro:env`, `.env.example` y `docs/VARIABLES_DE_ENTORNO.md` actualizados.
- Lista de dominios salientes permitidos (SSRF, §11.2): solo el de Jira.

### 1.2 Dominio (`src/domain/jira`, puro y con cobertura ≥ 90 %)

- Tipos `Ticket`, `Sla`, `Epic`, `Objective`.
- Reglas: cumplimiento de SLA con meta del 90 % (incumplimiento calculado al leer desde las fechas
  objetivo), % de esfuerzo por objetivo ponderado por tiempo en "En progreso", capacidad vs demanda
  (D-037), agrupación trimestral. La fecha de referencia entra por el puerto `Clock`.

### 1.3 Puertos (`src/application/ports`) y fakes — **hecho (2026-11-12)**

`JiraGateway` (búsqueda incremental paginada y lista de claves), `IssueRepository`, `SyncRunRepository`
y `SyncLock` (bloqueo de un solo sync a la vez). `AggregateRepository` se define con las páginas (1.9), cuando
se sepa qué agregados hacen falta. Las suites de comportamiento están en `tests/integration/jira-ports.test.ts`;
el paso 1.4 les añade los adaptadores de Postgres para que la prueba de contrato compare ambos. Cada uno con su fake y prueba de contrato (regla 7 del SDD, D-018).

### 1.4 Esquema y migraciones — **hecho (2026-11-12)**

Creadas `jira_issue`, `jira_status_transition`, `jira_sla_cycle`, `sync_run` y `sync_lock`, y la columna
`app_user.time_zone` (D-043, D-044). Los adaptadores de Postgres pasan las mismas pruebas que los fakes.
No se guarda la respuesta cruda de Jira. `objective`, `jira_epic` y la tabla de agregados esperan a D-041 y
al paso 1.9. Los privilegios de `app_runtime` los cubren los permisos por defecto de D-030; se verifica tras
desplegar.

### 1.5 Adaptador de Jira (`src/infrastructure/jira`) — **hecho (2026-11-12)**

Cliente REST con autenticación básica (correo + token), tiempos de espera explícitos, respeto a
`Retry-After` y 429, backoff con jitter, `POST /rest/api/3/search/jql` con `nextPageToken` y
`expand=changelog`. Esquemas Zod por respuesta (el contrato se prueba con las muestras anonimizadas
del 1.0). No se piden descripciones ni comentarios (§11.2, solo lo necesario).

### 1.6 Casos de uso de sincronización — **hecho (2026-11-12)**

- `FullSync` (`pnpm sync:jira --full`, también con `--dry-run`), por lotes y reanudable.
- `IncrementalSync`: `updated >= último sync exitoso − 5 min`; los SLAs vienen en la misma
  búsqueda (D-039); un fallo no avanza la marca del último sync exitoso.
- `TriggerSync`: aplica el tope "1 cada 5 min", el bloqueo asesor (un solo sync a la vez) y el
  disparo perezoso (> 15 min).
- Tras cada sync: recálculo de agregados e invalidación de caché.

### 1.7 Ejecución en segundo plano — **hecho (2026-11-12)**

- Netlify Background Function que ejecuta el sync; la invoca la aplicación con un secreto interno
  (se registra como decisión al implementarlo). La página y el botón responden de inmediato.
- Función programada: código listo pero **desactivado** (D-035).

### 1.8 Botón "Resincronizar con Jira" — **hecho (2026-11-12)**

Permiso `action.sync` (solo Líder por defecto), oculto para quien no lo tiene, 1 por minuto por
usuario, token CSRF, muestra estado y hora del último sync. La ubicación visual se define en diseño.

### 1.9 Páginas del dashboard (§5)

> **Avance (2026-11-12):** `/` Resumen ejecutivo (D-050), `/tareas` (D-051), `/sla` (D-052), `/incumplimientos` (D-054), `/capacidad` (D-055/D-056) y `/trimestres` (D-057), `/estado` (D-058), `/resumen` (D-059) y `/definiciones` (D-060) y `/aprendido` (D-061) hechas, con la barra lateral, el tema (D-053) y el selector de zona horaria por persona (D-062). **Todas las páginas de la fase están hechas.** Pendiente: el cierre (1.10).

Orden de entrega, de mayor a menor valor: `/` (exec) → `/tareas` → `/sla` → `/incumplimientos` →
`/resumen` → `/capacidad` → `/trimestres` → `/aprendido` → `/definiciones`. `/objetivos` queda en espera (D-041).
Cada una: permiso `section.*` declarado en el registro, datos filtrados con el conjunto de permisos,
gráficos SVG de servidor, fechas en la zona de cada persona (D-043), marca "Última actualización" (con aviso aparte si el último intento falló),
cero JS salvo necesidad. `/estado` mínimo para el Líder (último sync, ejecuciones fallidas).

### 1.10 Cierre de la fase

- Pruebas e2e: login → dashboard por rol, "ocultar no bloquear" con las páginas nuevas, botón oculto
  al Colaborador y 404 al llamar al endpoint sin permiso.
- Pruebas de sync: idempotencia, dos disparos simultáneos, fallo de Jira (se sirve la última caché).
- ~~Lighthouse CI en el pipeline y presupuesto de JS que rompe el build~~ **hecho (2026-11-12, D-065)**: `pnpm perf` y job `performance` del CI; 11 páginas con 100/100/100 y 0 KB de JS.
- ~~Muestra de 30 tickets contra Jira~~ **hecha (2026-11-12, D-063)**: 30/30, 1.046/1.046 y recuento de SLA por trimestre idéntico. Método y comando en `docs/PRUEBAS.md`.
- ~~`quality-gate` (code-review + documentación)~~ **hecho (2026-11-12, D-064)**: 3 hallazgos corregidos. ~~Runbook de "re-sincronización completa"~~ **hecho** (`docs/runbooks/RESINCRONIZACION.md`).

## Cortes en PR sugeridos

| PR  | Contenido                                                |
| --- | -------------------------------------------------------- |
| 1   | 1.0 + 1.1 (mapeo, sonda, configuración)                  |
| 2   | 1.2 + 1.3 + 1.4 (dominio, puertos, fakes, esquema)       |
| 3   | 1.5 + 1.6 (adaptador y sincronización, carga inicial)    |
| 4   | 1.7 + 1.8 (segundo plano, botón)                         |
| 5   | 1.9 parte A (`/`, `/tareas`, `/sla`, `/incumplimientos`) |
| 6   | 1.9 parte B + 1.10 (resto de páginas y cierre)           |

## Decisiones

Registradas: D-034 (sin webhook), D-035 (disparadores), D-038 (marca de actualización).
Verificada y decidida: D-036 (cuenta personal), D-039. Aprobada: D-037 (capacidad por cantidad de tareas), D-040. En espera: D-041 (objetivos).
