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

| Archivo                                  | Cubre                                                             |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `unit/access-policy.test.ts`             | Reglas de acceso del dominio                                      |
| `unit/authorization-matrix.test.ts`      | Matriz rol × ruta: quién ve qué                                   |
| `unit/route-access.test.ts`              | `decideAccess`: permitir, no autenticado, oculto                  |
| `unit/route-registry.test.ts`            | Todas las rutas declaran acceso; sin duplicados                   |
| `unit/session-policy.test.ts`            | Caducidad absoluta, inactividad y renovación                      |
| `unit/security-headers.test.ts`          | Cabeceras de seguridad                                            |
| `integration/sign-in.test.ts`            | Invitación, dominio, desactivados y bootstrap del Líder           |
| `integration/admin-users.test.ts`        | Invitar, cambiar rol y dar de baja; reglas de "siempre un Líder"  |
| `integration/atlassian-provider.test.ts` | OAuth con red simulada: `state`, PKCE y errores                   |
| `integration/rate-limit-csrf.test.ts`    | Límite de tasa y tokens CSRF                                      |
| `integration/denied-audit.test.ts`       | Auditoría de intentos denegados y su tope                         |
| `integration/db-schema.test.ts`          | Restricciones, trigger de solo inserción en `audit_log`           |
| `integration/env-rules.test.ts`          | Validación de entorno, incluidas las reglas de producción         |
| `integration/seed-and-forms.test.ts`     | Semilla idempotente y concurrente; formularios y límite de cuerpo |
| `integration/port-contracts.test.ts`     | Fakes y adaptadores reales se comportan igual                     |
| `e2e/hide-not-block.spec.ts`             | Un Colaborador no ve ni accede a `/permisos`; flujo de invitación |

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
- Lighthouse y publicación de imágenes, que se suman en fases posteriores (D-008).
