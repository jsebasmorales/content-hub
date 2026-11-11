# Runbook: despliegue a Netlify

**Estado: borrador previo al primer despliegue.** Todavía no existe `netlify.toml`, la cuenta de
Netlify ni la base de datos de producción. Los pasos marcados **[pendiente]** dependen de
decisiones sin implementar (D-030, D-031). Actualiza este documento tras el primer despliegue.

Para quién es: quien despliega. Variables: [VARIABLES_DE_ENTORNO.md](../VARIABLES_DE_ENTORNO.md).

## Antes de empezar

- [ ] El CI de `main` está en verde (calidad, e2e, seguridad).
- [ ] Cuenta de Netlify del equipo creada y términos del plan gratuito revisados (SDD §17, 1).
- [ ] Base de datos Postgres (Netlify DB / Neon) con la cadena _pooled_ y `sslmode=require`.
- [ ] **[pendiente]** Dos roles de BD: **migración** (dueño de las tablas) y **ejecución** (solo
      SELECT, INSERT, UPDATE, DELETE; sin DDL). Si un solo rol migra y opera, el trigger que protege
      `audit_log` se puede desactivar (D-017, D-030).
- [ ] App OAuth de Atlassian **de producción**, con Callback URL `https://TU-DOMINIO/api/auth/callback`
      ([COMO_EJECUTAR.md](../COMO_EJECUTAR.md)).
- [ ] Correo `@holafly.com` confirmado con 2 o 3 compañeros (SDD §17, 2).

## Variables en Netlify

Configúralas en **Site configuration → Environment variables**, no en un archivo:

| Variable                                            | Valor en producción                                               |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                                      | Rol de **ejecución**, pooled, con `sslmode=require`               |
| `SESSION_SECRET`                                    | Nuevo, aleatorio, 32+ caracteres (distinto al de desarrollo)      |
| `ALLOWED_EMAIL_DOMAIN`                              | `holafly.com`                                                     |
| `BOOTSTRAP_LEADER_EMAIL`                            | Correo del primer Líder                                           |
| `PUBLIC_APP_URL`                                    | `https://TU-DOMINIO` (https activa la cookie `__Host-`)           |
| `AUTH_PROVIDER`                                     | `atlassian` (`local` hace que la app no arranque)                 |
| `ATLASSIAN_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | De la app de **producción**                                       |
| `DATABASE_URL_MIGRATE`                              | **[pendiente]** Rol de migración, solo para el paso de despliegue |

Los _previews_ de Netlify deben usar **otra base de datos vacía**, nunca la de producción.

## Pasos

1. **Migrar.** **[pendiente]** Debe ser un paso previo a publicar, con el rol de migración. Hasta
   que exista, hazlo manualmente desde tu máquina apuntando a la BD de producción:
   `pnpm db:migrate` (lee `.env`; usa un archivo temporal y bórralo después, sin subirlo a git).
   Las migraciones son idempotentes y la semilla también (D-020).
2. **Construir y publicar.** Netlify compila con `pnpm build` al hacer push a `main`. Necesita Node
   22.23.4 o superior; **[pendiente]** fíjalo en `netlify.toml` con la misma versión que el CI.
3. **Verificar cabeceras y CSP** (obligatorio tras el primer despliegue, D-026):
   ```bash
   pnpm verify:deploy https://TU-DOMINIO
   ```
   Debe terminar con `Deployment check passed`. Comprueba `/login`, HSTS, `frame-ancestors`,
   `nosniff`, `Cache-Control: private` y que la etiqueta CSP exista sin `unsafe-inline`.
4. **Primer acceso.** Entra con el correo de `BOOTSTRAP_LEADER_EMAIL`. Debes quedar como Líder.
5. **Invitar al equipo** desde **Permisos** ([USUARIOS_Y_ACCESO.md](USUARIOS_Y_ACCESO.md)).
6. **Comprobar** que un Colaborador no ve **Permisos** y que `/permisos` le responde 404.

## Si algo sale mal

| Síntoma                                         | Causa probable                                  | Acción                                                             |
| ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Error 500 al abrir cualquier página             | Variable faltante o inválida                    | Los registros de la función dicen cuál; corrígela y redespliega    |
| La app no arranca y menciona `local` o `pglite` | Variable de desarrollo en producción            | `AUTH_PROVIDER=atlassian` y una `DATABASE_URL` Postgres con TLS    |
| `redirect_uri is not registered`                | Callback URL distinta a la registrada           | Igualar `ATLASSIAN_REDIRECT_URI` con la consola, letra por letra   |
| `verify:deploy` falla en la etiqueta CSP        | La CSP de Astro no se emitió                    | Revisar `security.csp` en `astro.config.mjs` y el build            |
| Respuestas lentas tras un rato sin tráfico      | Arranque en frío de la función y de la conexión | Esperado; si persiste, revisar el pooler y los límites de conexión |
| Errores de conexión intermitentes               | Conexiones inactivas cerradas por Neon          | El pool ya lo maneja (D-015); revisa que uses la URL _pooled_      |

## Revertir

- **Código:** en Netlify, **Deploys** → elige el despliegue anterior → **Publish deploy**. Es
  inmediato y no toca la base de datos.
- **Base de datos:** las migraciones actuales solo agregan estructura. No hay "deshacer" automático;
  antes de una migración que borre o cambie datos, haz una copia de la BD y documenta el paso
  inverso en esta página. **[pendiente]** definir la política de copias de seguridad (SDD §14).
- **Variable mal puesta:** corrígela y vuelve a desplegar. Si el secreto de Atlassian o
  `SESSION_SECRET` se expuso, regénéralo; cambiar `SESSION_SECRET` invalida los tokens CSRF abiertos
  pero no las sesiones.

## Después del despliegue

- Vigila el consumo de créditos de Netlify el primer mes (300 al mes en el plan gratuito).
- Actualiza D-030 y D-031 en [DECISIONES.md](../DECISIONES.md) cuando se implementen.
- Corre `pnpm verify:deploy` de nuevo si cambias cabeceras, CSP o el adaptador.
