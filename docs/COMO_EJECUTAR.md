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
   - `BOOTSTRAP_LEADER_EMAIL=` → tu correo: `sebastian.morales@holafly.com`
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

| Comando                 | Qué hace                                               |
| ----------------------- | ------------------------------------------------------ |
| `pnpm lint`             | Revisa la calidad del código                           |
| `pnpm check`            | Revisa los tipos                                       |
| `pnpm arch`             | Comprueba que las capas no se mezclen                  |
| `pnpm test:unit`        | Pruebas rápidas de las reglas                          |
| `pnpm test:integration` | Pruebas con base de datos                              |
| `pnpm e2e`              | Pruebas con un navegador real (abre y cierra uno solo) |

## Si algo falla

- **"Invalid environment configuration" o error 500 al abrir la página:** falta o está mal una línea
  del `.env`. El mensaje dice cuál.
- **`pnpm build` falla en Windows con "EPERM ... symlink":** activa el _Modo de desarrollador_ de
  Windows (Configuración → Privacidad y seguridad → Para programadores). No afecta a `pnpm dev`.
- **`pnpm dev` se cae mencionando Deno o "edge functions":** ya no debería pasar. `astro.config.mjs`
  desactiva la emulación local de Netlify Edge Functions (la app no define ninguna) porque exigía
  tener Deno instalado. Si vuelve a aparecer, revisa que `edgeFunctions: false` siga en esa línea.
- **Quieres empezar de cero con la base de datos local:** borra la carpeta `.data` y ejecuta
  `pnpm db:migrate`.

---

# Más adelante: crear la app de Atlassian (para entrar con cuentas reales)

Hoy el acceso usa el modo de desarrollo. Para que el equipo entre con su cuenta Atlassian:

1. Entra a https://developer.atlassian.com/console/myapps/ con tu cuenta de Holafly.
2. Pulsa **Create** → **OAuth 2.0 integration**. Ponle el nombre "Content Hub".
3. En **Permissions** → **Add** junto a "User identity API" → **Configure** → marca `read:me`.
4. En **Authorization** → **Add** (OAuth 2.0 authorization code grants) → en **Callback URL**
   escribe `https://TU-DOMINIO/api/auth/callback`. (Para probar en tu computador, puedes crear
   otra app con `http://localhost:4321/api/auth/callback`.)
5. En **Settings** copia **Client ID** y **Secret**.
6. Guárdalos en las variables de entorno de Netlify (o en tu `.env` local):
   - `ATLASSIAN_CLIENT_ID`
   - `ATLASSIAN_CLIENT_SECRET`
   - `ATLASSIAN_REDIRECT_URI` (la misma Callback URL del paso 4)
   - `AUTH_PROVIDER=atlassian`
7. **Comprobación importante** (pendiente 2 del SDD): inicia sesión con 2 o 3 compañeros y confirma
   que Atlassian devuelve su correo @holafly.com. Si alguien no lo devuelve, el Hub lo rechaza a
   propósito; se resuelve ajustando la visibilidad del correo en su perfil de Atlassian.

Nunca pegues el Secret en un chat, en un correo ni en el repositorio.
