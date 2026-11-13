# Estrategia de pruebas

Para quién es: quien programa. Los comandos están en el [README](../README.md).

## Tres niveles

| Nivel       | Carpeta             | Qué prueba                                           | Base de datos     | Comando                 |
| ----------- | ------------------- | ---------------------------------------------------- | ----------------- | ----------------------- |
| Unitarias   | `tests/unit`        | Reglas puras del dominio y el registro de rutas      | Ninguna           | `pnpm test:unit`        |
| Integración | `tests/integration` | Casos de uso, adaptadores, esquema y endpoints       | PGlite y fakes    | `pnpm test:integration` |
| E2E         | `tests/e2e`         | El flujo real en un navegador (Playwright, Chromium) | PGlite en memoria | `pnpm e2e`              |

`pnpm test` corre unitarias e integración. `pnpm test:coverage` corre las unitarias y exige
**90 %** de líneas, funciones, ramas y sentencias en `src/domain`.

## Cada prueba de comportamiento corre dos veces

[tests/support/test-app.ts](../tests/support/test-app.ts) expone `createTestApp(kind)` con dos
variantes (`APP_KINDS`):

- `postgres (PGlite)`: adaptadores reales sobre Postgres embebido, con migraciones y semilla.
- `in-memory fakes`: los mismos casos de uso con los fakes.

`FakeClock` permite avanzar el tiempo para probar caducidad e inactividad de sesiones sin esperar.

**Por qué:** si un fake se desvía del adaptador real, las pruebas de contrato
([port-contracts.test.ts](../tests/integration/port-contracts.test.ts)) fallan. Así los fakes son
fiables para pruebas rápidas (D-018).

## Qué cubre cada archivo

| Archivo                                  | Cubre                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/access-policy.test.ts`             | Reglas de acceso del dominio                                                                                                                                  |
| `unit/authorization-matrix.test.ts`      | Matriz rol × ruta: quién ve qué                                                                                                                               |
| `unit/route-access.test.ts`              | `decideAccess`: permitir, no autenticado, oculto                                                                                                              |
| `unit/route-registry.test.ts`            | Todas las rutas declaran acceso; sin duplicados                                                                                                               |
| `unit/session-policy.test.ts`            | Caducidad absoluta, inactividad y renovación                                                                                                                  |
| `unit/security-headers.test.ts`          | Cabeceras de seguridad                                                                                                                                        |
| `integration/sign-in.test.ts`            | Invitación, dominio, desactivados y bootstrap del Líder                                                                                                       |
| `integration/admin-users.test.ts`        | Invitar, cambiar rol y dar de baja; reglas de "siempre un Líder"                                                                                              |
| `integration/atlassian-provider.test.ts` | OAuth con red simulada: `state`, PKCE y errores                                                                                                               |
| `integration/rate-limit-csrf.test.ts`    | Límite de tasa y tokens CSRF                                                                                                                                  |
| `integration/denied-audit.test.ts`       | Auditoría de intentos denegados y su tope                                                                                                                     |
| `integration/db-schema.test.ts`          | Restricciones, trigger de solo inserción en `audit_log`                                                                                                       |
| `integration/env-rules.test.ts`          | Validación de entorno, incluidas las reglas de producción                                                                                                     |
| `integration/seed-and-forms.test.ts`     | Semilla idempotente y concurrente; formularios y límite de cuerpo                                                                                             |
| `integration/port-contracts.test.ts`     | Fakes y adaptadores reales se comportan igual                                                                                                                 |
| `e2e/hide-not-block.spec.ts`             | Un Colaborador no ve ni accede a `/permisos`; flujo de invitación; el perfil, la zona horaria y el tema viven en el menú de la persona (pie de la navegación) |

## La Fase 1 (Jira y dashboard)

| Archivo (en `unit/` e `integration/`)                                                     | Cubre                                                                                                                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `jira-gateway`, `jira-sync`, `jira-request-sync`, `sync-function`, `jira-store-contracts` | El cliente de Jira, el sync incremental, la función en segundo plano y la caché                                                   |
| `sla-compliance`, `sla-report`, `sla-breaches`, `report-period`, `quarterly`, `quarter`   | Reglas de SLA (D-042), periodos, trimestres en hora de Bogotá, incumplimientos                                                    |
| `executive-summary`, `summary-report`, `task-list`, `capacity`, `data-quality`            | Cifras de cada página y sus filtros                                                                                               |
| `definitions`                                                                             | Cada número del texto de Definiciones coincide con la constante del código                                                        |
| `learned`, `time-zone`, `theme-and-return`                                                | Lo aprendido (versiones, solo-añadir), zona horaria por persona, tema y destinos de vuelta                                        |
| `sample-comparison`                                                                       | La comparación con Jira: elección de la muestra y detección de diferencias                                                        |
| `navigation`, `chart-geometry`, `format-number`, `definitions`                            | Rediseño: menú agrupado sin grupos vacíos, ticks de los gráficos, miles y variaciones (`describeDelta`), búsqueda de Definiciones |

## Comparación con Jira

Las pruebas automáticas demuestran que el código hace lo que dijimos; no demuestran que lo que dijimos
coincide con lo que Jira tiene. Para eso está `pnpm compare:jira` (solo lectura, no modifica nada):

- **`pnpm compare:jira`** elige una muestra variada de **30 tickets** (cerrados con todo cumplido,
  con cada tipo de incumplimiento, con relojes en curso, vencidos o en pausa, reabiertos, sin
  responsable, de tipos retirados, de cada tipo de solicitud y de cada trimestre). Es repetible: la
  misma base da la misma muestra. Los lee de Jira **en vivo** y los compara con lo guardado en el Hub.
  Escribe `.data/comparacion-muestra.md`: una hoja con lo que dice el Hub de cada ticket (con enlace
  a Jira) para contrastarla a ojo. **Ese archivo no se sube** al repositorio porque nombra tickets y
  personas.
- **`pnpm compare:jira --all`** hace lo mismo con **todos** los tickets y además **recuenta el
  cumplimiento de SLA de cada trimestre directamente de las respuestas de Jira**, con código propio y
  sin usar el del Hub, y lo pone al lado de lo que muestra la página de SLAs.
- Lo comparado, campo a campo: resumen, estado y su categoría, tipo de solicitud, responsable,
  solicitante, fecha de creación, fecha de finalización y, de cada ciclo de SLA, inicio, fin, límite,
  si Jira lo marca incumplido, si está en pausa, si sigue en curso y **cómo cuenta**.
- Un ticket que cambió en Jira después de la última sincronización se marca "cambió después", no
  como error: lo que dice es "sincroniza".
- **El límite de un reloj en pausa no se compara**: Jira lo recalcula cada vez que se lee (es una
  proyección), el Hub no lo usa (D-042) y dos lecturas con segundos de diferencia dan valores
  distintos. La primera ejecución lo descubrió: 8 falsos positivos, todos de relojes en pausa.
- **Cuándo correrlo:** tras cada cambio en las reglas de cálculo y después del primer despliegue (ver
  el runbook). Sale con error si algo no coincide.

**Resultado (2026-11-12):** 30 de 30 tickets de la muestra coinciden; los **1.046 de 1.046** coinciden;
y el cumplimiento de SLA de los 6 últimos trimestres (T3 2025 a T4 2026), en las dos métricas, es
idéntico entre el Hub y el recuento hecho directamente sobre Jira (por ejemplo T4 2026: primera
respuesta 138 cumplidos y 3 incumplidos, resolución 139 y 10).

**Lo que esto no prueba:** que las reglas de D-042 sean las que el equipo quiere (eso es una decisión,
no un dato) ni que Jira calcule bien sus relojes. Prueba que el Hub guarda y cuenta lo que Jira dice.

## Diseño

- **`pnpm check:design`** (también en el CI): ningún color, radio ni sombra fuera de `tokens.css`, y
  contraste WCAG AA de cada par de tokens en claro y oscuro (4,5:1 texto, 3:1 gráficos); además mide
  cuánto se distinguen las dos primeras series de los gráficos, también con daltonismo.
- **`pnpm perf`** sigue siendo la puerta de rendimiento y de accesibilidad (Lighthouse). Sus cifras de
  LCP en el servidor de desarrollo son **pesimistas** (documento sin comprimir, ver D-076): la medida
  que cuenta es la de la vista previa de Netlify.
- **Recuento independiente** (`scripts/recount-type.mjs`, D-073): repite en código aparte las cifras de
  un tipo de solicitud directamente desde Jira.
- No hay comparación automática de capturas: las de `scripts/capture-pages.mjs` se revisan a ojo.

## Reglas al escribir pruebas

- Un caso de uso nuevo se prueba contra **ambas** variantes de `createTestApp`.
- Un puerto nuevo suma un caso al archivo de contratos.
- Una ruta nueva suma su fila a la matriz de autorización y pasa el test del registro.
- Una regla de dominio con ramas nuevas debe mantener la cobertura en 90 %.
- No uses `sleep`: avanza `FakeClock`.
- Los datos de prueba usan correos `@holafly.com` ficticios; nunca correos reales.

## E2E

- Playwright arranca su propio `astro dev` en el puerto 4321 con `DATABASE_URL=pglite:memory`
  (`reuseExistingServer: false`). **Cierra tu `pnpm dev` antes de correrlas**, o el puerto estará
  ocupado.
- Corre en serie (un solo worker) porque las pruebas asumen una base vacía.
- Si fallan en CI, el reporte se guarda 7 días como artefacto (`playwright-report`).
- Primera vez en tu máquina: `pnpm exec playwright install chromium`.

## Qué corre en el CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml), en orden:

1. **quality**: instalación congelada, formato, ESLint, `astro check`, reglas de arquitectura,
   unitarias con cobertura, integración y build.
2. **e2e** (después de quality): Playwright.
3. **security** (en paralelo): gitleaks con historial completo y `pnpm audit --audit-level=high`.
4. **CodeQL** en su propio flujo, y Dependabot para actualizaciones semanales.

Todas las acciones están fijadas por hash de commit (D-029).

## Lo que falta

- Una prueba de integración contra Postgres real (no PGlite) con dos degradaciones simultáneas
  de Líderes. Va con D-031.
- Lighthouse y presupuesto de JavaScript: **hechos** (D-065). `pnpm perf` mide cada página (JS ≤ 30 KB gzip; rendimiento ≥ 90, accesibilidad ≥ 95, buenas prácticas ≥ 90, LCP ≤ 1,5 s, CLS ≤ 0,05) y el job `performance` del CI lo ejecuta. Con `pnpm perf <url>` se puede medir otra instancia.
- Publicación de imágenes, que se suma en fases posteriores.
