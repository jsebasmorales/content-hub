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

## Opcionales: se vuelven requeridas en su fase

| Fase | Variables                                                                                  |
| ---- | ------------------------------------------------------------------------------------------ |
| 1    | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_WEBHOOK_SECRET` |
| 2–3  | `BLOB_READ_WRITE_TOKEN`, `INGEST_API_TOKEN`                                                |
| 4    | `CROWDIN_TOKEN`, `CROWDIN_PROJECT_IDS` (por ejemplo `19,55`), `CROWDIN_WEBHOOK_SECRET`     |

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
