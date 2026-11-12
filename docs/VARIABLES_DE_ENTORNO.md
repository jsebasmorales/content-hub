# Variables de entorno

Referencia completa. Plantilla con valores de ejemplo: [.env.example](../.env.example). Nunca subas
`.env` al repositorio.

## Cómo se validan

Se validan **al arrancar** con Zod ([env-rules.ts](../src/infrastructure/config/env-rules.ts)) y con el
esquema de `astro:env` en [astro.config.mjs](../astro.config.mjs). Si algo falta o es inválido, la
app no arranca y el error dice qué variable falla, sin mostrar su valor. Un valor vacío (`KEY=`)
cuenta como "no definido".

Solo se leen en `src/infrastructure/config`. Nunca uses `process.env` en otra parte.

## Requeridas desde la Fase 0

| Variable                 | Qué es                              | Reglas                                                                            |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Conexión a la base de datos         | Empieza por `postgres://`, `postgresql://` o `pglite:`. Local: `pglite:.data/dev` |
| `SESSION_SECRET`         | Secreto para firmar los tokens CSRF | 32 caracteres o más, aleatorios                                                   |
| `ALLOWED_EMAIL_DOMAIN`   | Dominio que puede entrar            | Dominio sin `@`, por ejemplo `holafly.com`                                        |
| `BOOTSTRAP_LEADER_EMAIL` | Primer Líder                        | Correo válido y del mismo dominio. Solo actúa mientras no haya Líder              |
| `PUBLIC_APP_URL`         | URL pública de la app               | URL válida. Si es `https`, la cookie usa el prefijo `__Host-`                     |
| `AUTH_PROVIDER`          | Cómo se inicia sesión               | `local` o `atlassian`                                                             |

Generar un `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Reglas cruzadas

- `BOOTSTRAP_LEADER_EMAIL` debe pertenecer a `ALLOWED_EMAIL_DOMAIN`.
- Con `AUTH_PROVIDER=atlassian` son obligatorias `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` y
  `ATLASSIAN_REDIRECT_URI`.
- **En producción** además:
  - `AUTH_PROVIDER=local` está prohibido.
  - `DATABASE_URL` no puede ser `pglite:` y debe incluir `sslmode=require` (o `verify-ca` /
    `verify-full`), salvo en `localhost`.

## Atlassian (login)

| Variable                  | Qué es                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ATLASSIAN_CLIENT_ID`     | Client ID de la app OAuth 2.0                                                                                                                                                  |
| `ATLASSIAN_CLIENT_SECRET` | Secreto de la app. Si se muestra en algún sitio, regénéralo                                                                                                                    |
| `ATLASSIAN_REDIRECT_URI`  | Solo la Callback URL, p. ej. `http://localhost:4321/api/auth/callback`. Debe coincidir letra por letra con la registrada. No es la URL larga de `auth.atlassian.com/authorize` |

Local y producción usan **apps distintas** (cada una con su Callback URL).

## Jira (requeridas desde la Fase 1)

| Variable           | Qué es                          | Reglas                                                                   |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------ |
| `JIRA_BASE_URL`    | Dirección de tu Jira            | `https://<sitio>.atlassian.net`, sin ruta ni barra final                 |
| `JIRA_EMAIL`       | Correo de la cuenta de servicio | Correo válido                                                            |
| `JIRA_API_TOKEN`   | Token de API de esa cuenta      | Se crea en id.atlassian.com → Seguridad → Tokens de API. Uno por entorno |
| `JIRA_PROJECT_KEY` | Clave del proyecto              | Mayúsculas, por ejemplo `JSMCO` (no el nombre `JSM--CONTENT`)            |

Opcionales, con el valor de este tenant por defecto (`docs/jira-mapping.md`): `JIRA_FIELD_SLA_RESPONSE`
(`customfield_10062`, Time to first response) y `JIRA_FIELD_SLA_DONE` (`customfield_10152`, Time to done).
Solo hay que definirlas si cambia el id de esos campos en Jira.

La app **no arranca** si falta alguna de las cuatro obligatorias. Antes de desplegar esta versión,
defínelas también en Netlify (producción y, con una cuenta de prueba, en los previews).

## Sync en segundo plano (requerida desde la Fase 1)

| Variable              | Qué es                                                        | Reglas                                                                                            |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `SYNC_TRIGGER_SECRET` | Secreto que comparten la app y la función que sincroniza Jira | 32 caracteres o más, aleatorios, distinto de `SESSION_SECRET`. Quien no lo presente recibe un 404 |

La función corre fuera de Astro y lee su configuración del entorno de Netlify. Para generarlo, el mismo
comando de `SESSION_SECRET`. Rotarlo no invalida sesiones ni datos (ver el runbook de despliegue).

## Opcionales: se vuelven requeridas en su fase

| Fase | Variables                                                                              |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | _(Jira ya es requerida, ver arriba)_                                                   |
| 2–3  | `BLOB_READ_WRITE_TOKEN`, `INGEST_API_TOKEN`                                            |
| 4    | `CROWDIN_TOKEN`, `CROWDIN_PROJECT_IDS` (por ejemplo `19,55`), `CROWDIN_WEBHOOK_SECRET` |

Hoy se aceptan vacías (D-005). Asigna un secreto distinto a cada una.

## Por entorno

| Entorno      | `DATABASE_URL`                        | `AUTH_PROVIDER`       | Notas                                            |
| ------------ | ------------------------------------- | --------------------- | ------------------------------------------------ |
| Desarrollo   | `pglite:.data/dev`                    | `local` o `atlassian` | Postgres embebido en `.data/` (ignorado por git) |
| Pruebas / CI | `pglite:memory`                       | `local`               | Valores de relleno; ningún secreto real          |
| Producción   | Postgres pooled con `sslmode=require` | `atlassian`           | Se configuran en Netlify, no en un archivo       |
| _Previews_   | Una BD distinta y vacía               | `atlassian`           | Nunca la de producción (SDD §11.2)               |

Planeada (D-030, sin implementar): `DATABASE_URL_MIGRATE`, con el rol dueño de las tablas, usada
solo en el paso de migración del despliegue.

## Si algo falla

- **"Invalid environment configuration":** el mensaje lista las variables. Corrige `.env` y
  reinicia `pnpm dev`; el servidor no recarga `.env` solo.
- **Los valores van sin comillas ni espacios**, cada uno en una sola línea.
