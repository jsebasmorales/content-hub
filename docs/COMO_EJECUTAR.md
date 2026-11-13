# Cómo ejecutar el Content Hub en tu computador

Esta guía es para uso diario. No necesitas saber programar.

## Una sola vez

1. Abre la carpeta del proyecto en VS Code y abre una terminal (menú Terminal → Nueva terminal).
2. Instala las piezas del proyecto: `pnpm install`
3. Crea tu archivo de configuración local copiando el ejemplo:
   `copy .env.example .env`
4. Abre `.env` y rellena solo estas dos líneas:
   - `SESSION_SECRET=` → pega aquí un texto largo y aleatorio. Para generarlo, ejecuta en la terminal:
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `BOOTSTRAP_LEADER_EMAIL=` → tu correo: `tu.nombre@holafly.com`
5. Prepara la base de datos local: `pnpm db:migrate`

El archivo `.env` es solo tuyo: nunca se sube a GitHub.

## Cada día

1. `pnpm dev`
2. Abre http://localhost:4321
3. Escribe tu correo de Holafly. En modo desarrollo no se pide contraseña. La primera vez, tu correo
   queda como **Líder** automáticamente (porque es el `BOOTSTRAP_LEADER_EMAIL`).
4. Entra a **Permisos** para invitar a otras personas y asignarles un rol.

Para detener el servidor, pulsa `Ctrl + C` en la terminal.

## Comandos útiles

| Comando                    | Qué hace                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm lint`                | Revisa la calidad del código                                                                       |
| `pnpm check`               | Revisa los tipos                                                                                   |
| `pnpm arch`                | Comprueba que las capas no se mezclen                                                              |
| `pnpm test:unit`           | Pruebas rápidas de las reglas                                                                      |
| `pnpm test:integration`    | Pruebas con base de datos                                                                          |
| `pnpm e2e`                 | Pruebas con un navegador real (abre y cierra uno solo)                                             |
| `pnpm perf`                | Lighthouse y tope de JavaScript en cada página (hay que tener la app corriendo en el puerto 4321)  |
| `pnpm check:design`        | Falla si hay un color, radio o sombra escritos fuera de `tokens.css` y revisa el contraste (D-067) |
| `pnpm probe:jira`          | Comprueba tu conexión con Jira (solo lee)                                                          |
| `pnpm sync:jira`           | Trae a la base de datos lo que cambió en Jira                                                      |
| `pnpm sync:jira --full`    | Lee todo el proyecto y quita lo borrado en Jira                                                    |
| `pnpm sync:jira --dry-run` | Muestra qué haría, sin escribir nada                                                               |
| `pnpm compare:jira`        | Compara 30 tickets variados con Jira y escribe una hoja para revisar                               |
| `pnpm compare:jira --all`  | Compara todos los tickets y recuenta el SLA de cada trimestre                                      |
| `pnpm build:functions`     | Empaqueta la función en segundo plano (lo hace `pnpm build` solo)                                  |

**Herramientas de diseño** (se usan al rediseñar páginas; no forman parte del producto):

- `node --env-file=.env scripts/capture-pages.mjs <nombre> [http://localhost:4321] [/ruta,/otra]`
  saca capturas de cada página a 1440, 1024 y 390 px, en claro y oscuro, en `.design-captures/<nombre>/`.
  Solo funciona contra un servidor **local** con `AUTH_PROVIDER=local`, y esa carpeta puede mostrar datos
  reales: está ignorada por git y no debe subirse. Para no tocar tu base ni llamar a Jira, arranca el
  servidor sobre una copia: copia `.data/dev` a `.design-captures/db` y arranca con
  `DATABASE_URL=pglite:.design-captures/db`.
- `node --env-file=.env scripts/recount-type.mjs "<tipo de solicitud>" [2026-T4]` recuenta un tipo de
  solicitud directamente en Jira (solo lee) con reglas escritas aparte de las del Hub, para comprobar
  una fila de `/resumen` (D-073). Imprime claves de ticket y fechas, nunca resúmenes ni personas.
- En Windows, `pnpm build` puede fallar al final con `EPERM ... symlink` (ver más abajo); aun así deja
  `dist/_astro/*.css`, útil para medir el peso del CSS.

`pnpm sync:jira` escribe en la base de datos de tu `.env`. En local es la base embebida (`pglite:`);
antes de usarlo la primera vez ejecuta `pnpm db:migrate`. Una carga completa de los 1.046 tickets
tarda unos 20 segundos.

`pnpm compare:jira` solo **lee** (Jira y tu base) y deja la hoja en `.data/comparacion-muestra.md`, que
no se sube al repositorio porque nombra tickets y personas. Para qué sirve y cómo leerlo: [PRUEBAS.md](PRUEBAS.md).
Si un ticket se desvía, el runbook de [re-sincronización completa](runbooks/RESINCRONIZACION.md) explica
qué hacer.

**Cierra `pnpm dev` antes de `pnpm sync:jira` o `pnpm compare:jira`**: usan la misma base embebida y no
conviene abrirla desde dos procesos a la vez.

## Si algo falla

- **"Invalid environment configuration" o error 500 al abrir la página:** falta o está mal una línea
  del `.env`. El mensaje dice cuál.
- **`pnpm build` falla en Windows con "EPERM ... symlink":** activa el _Modo de desarrollador_ de
  Windows (Configuración → Privacidad y seguridad → Para programadores). No afecta a `pnpm dev`.
- **`pnpm dev` se cae mencionando Deno o "edge functions":** ya no debería pasar. `astro.config.mjs`
  desactiva la emulación local de Netlify Edge Functions (la app no define ninguna) porque exigía
  tener Deno instalado. Si vuelve a aparecer, revisa que `edgeFunctions: false` siga en esa línea.
- **Atlassian muestra `redirect_uri is not registered for client`:** la Callback URL que envía la
  app no coincide letra por letra con la registrada en la consola (puerto, `http` o `https`,
  barra final), o `ATLASSIAN_REDIRECT_URI` contiene la URL larga de autorización en vez de solo
  la callback.
- **La pantalla de login sigue pidiendo solo el correo ("Modo de desarrollo"):** falta
  `AUTH_PROVIDER=atlassian` en `.env` o no reiniciaste `pnpm dev`.
- **Quieres empezar de cero con la base de datos local:** borra la carpeta `.data` y ejecuta
  `pnpm db:migrate`.

---

# Más adelante: crear la app de Atlassian (para entrar con cuentas reales)

Hoy el acceso usa el modo de desarrollo. Para que el equipo entre con su cuenta Atlassian:

1. Entra a https://developer.atlassian.com/console/myapps/ con tu cuenta de Holafly.
2. Pulsa **Create** → **OAuth 2.0 integration**. Ponle el nombre "Content Hub". En **Access type**
   elige **Account-level** (la app solo lee el perfil con `read:me`; no accede a sitios de Jira ni
   Confluence). Acepta los términos de desarrollador y pulsa **Create**.
3. En **Permissions** → **Add** junto a "User identity API" → **Configure** → marca `read:me`.
4. En **Authorization** → **Add** (OAuth 2.0 authorization code grants) → en **Callback URL**
   escribe `https://TU-DOMINIO/api/auth/callback`. (Para probar en tu computador, puedes crear
   otra app con `http://localhost:4321/api/auth/callback`.) Pulsa **Save changes**: si no
   guardas, la URL no queda registrada.
5. En **Settings** copia **Client ID** y **Secret**.
6. Guárdalos en las variables de entorno de Netlify (o en tu `.env` local):
   - `ATLASSIAN_CLIENT_ID`
   - `ATLASSIAN_CLIENT_SECRET`
   - `ATLASSIAN_REDIRECT_URI` (la misma Callback URL del paso 4, solo esa, por ejemplo
     `http://localhost:4321/api/auth/callback`. **No** pegues la URL larga de
     `auth.atlassian.com/authorize` que muestra la consola: es solo un ejemplo y la app genera sola
     el `state`)
   - `AUTH_PROVIDER=atlassian` (cambia el `local` que trae `.env.example`; sin esto la app sigue
     en modo desarrollo y no muestra el botón de Atlassian)

   Los valores van sin comillas ni espacios, cada uno en una sola línea. Reinicia `pnpm dev`
   después de editar `.env`.

7. **Comprobación importante** (pendiente 2 del SDD): inicia sesión con 2 o 3 compañeros y confirma
   que Atlassian devuelve su correo @holafly.com. Si alguien no lo devuelve, el Hub lo rechaza a
   propósito; se resuelve ajustando la visibilidad del correo en su perfil de Atlassian.

Nunca pegues el Secret en un chat, en un correo ni en el repositorio.
