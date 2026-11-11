# Content Hub (Holafly)

Panel interno del equipo de Contenido: un dashboard de gestión sobre Jira y el **Content Ecosystem**
(buscador de campos de texto, sus capturas, dependencias y checklist de impacto).

**Estado:** Fase 0 (Cimientos) terminada. Acceso por invitación, roles y permisos, seguridad base y CI.
Jira, Ecosystem y Crowdin llegan en las fases 1 a 4 (ver [docs/SDD_Content_Hub.md](docs/SDD_Content_Hub.md), sección 16).

## Empezar en 5 minutos

Requisitos: Node 22.23.4 o superior y pnpm 12.

```bash
pnpm install
cp .env.example .env     # en Windows: copy .env.example .env
# Edita .env: pon SESSION_SECRET (32+ caracteres aleatorios) y tu BOOTSTRAP_LEADER_EMAIL
pnpm db:migrate          # crea la base de datos local (Postgres embebido, sin Docker)
pnpm dev                 # http://localhost:4321
```

Entra con tu correo `@holafly.com`. En modo desarrollo no se pide contraseña y el correo de
`BOOTSTRAP_LEADER_EMAIL` queda como primer Líder. Guía completa para no programadores:
[docs/COMO_EJECUTAR.md](docs/COMO_EJECUTAR.md).

## Cómo está organizado

Capas con dependencias en una sola dirección: `presentation → application → domain`.
La infraestructura implementa los puertos que define `application`.

```
src/
  domain/          Reglas puras (acceso, permisos, sesiones). Sin Astro, sin BD.
  application/     Casos de uso y puertos (interfaces).
  infrastructure/  Adaptadores reales (Postgres, auth) y fakes en memoria para pruebas.
  presentation/    Páginas, endpoints, middleware y registro de rutas (routes.ts).
  shared/          Tipos y utilidades sin dependencias de capa.
tests/             unit (dominio), integration (BD y fakes), e2e (Playwright)
docs/              SDD, DECISIONES.md, guías
```

Reglas que el CI hace cumplir:

- `domain` no importa de `infrastructure` ni de `presentation` (dependency-cruiser y ESLint).
- Toda ruta se declara en [src/presentation/routes.ts](src/presentation/routes.ts) con su permiso.
  Lo que no está ahí responde 404. `src/pages/` debe quedar vacío.
- La configuración solo se lee en `src/infrastructure/config`. Nunca `process.env` en otro lugar.
- Sin `any`; `unknown` + Zod en las fronteras.

## Acceso y permisos

- Solo entran personas **invitadas** por un Líder, con correo `@holafly.com`.
- Roles: **Colaborador** y **Líder**. Solo el Líder administra en `/permisos`.
- "Ocultar, no bloquear": lo que un perfil no puede ver no aparece en el menú y responde 404,
  igual que una página que no existe.

## Comandos

| Comando                  | Qué hace                                         |
| ------------------------ | ------------------------------------------------ |
| `pnpm dev`               | Servidor de desarrollo                           |
| `pnpm lint`              | ESLint estricto                                  |
| `pnpm check`             | Tipos (`astro check`)                            |
| `pnpm arch`              | Reglas de arquitectura (dependency-cruiser)      |
| `pnpm test:unit`         | Pruebas unitarias                                |
| `pnpm test:integration`  | Pruebas con Postgres embebido y fakes            |
| `pnpm test:coverage`     | Unitarias con umbral de 90 % en `domain`         |
| `pnpm e2e`               | Pruebas de navegador (Playwright)                |
| `pnpm db:generate`       | Genera una migración tras cambiar el esquema     |
| `pnpm db:migrate`        | Aplica migraciones y datos iniciales             |
| `pnpm verify:deploy URL` | Comprueba cabeceras y CSP en un sitio desplegado |

`pnpm build` en Windows requiere el _Modo de desarrollador_ activado (ver
[docs/DECISIONES.md](docs/DECISIONES.md), D-028). En Linux y en Netlify funciona sin ajustes.

## Variables de entorno

Se validan al arrancar; si falta una requerida, la app responde 500 y dice cuál. Lista completa y
valores de ejemplo en [.env.example](.env.example). Nunca subas `.env` al repositorio.

## Documentación

- [docs/SDD_Content_Hub.md](docs/SDD_Content_Hub.md): contrato de diseño y fases.
- [docs/DECISIONES.md](docs/DECISIONES.md): decisiones no cubiertas por el SDD, con su motivo.
- [docs/COMO_EJECUTAR.md](docs/COMO_EJECUTAR.md): uso diario y cómo crear la app OAuth de Atlassian.
- `docs/reference/Content_Hub_Mockup.html`: referencia visual del producto.

## Contribuir

Commits convencionales (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Antes de abrir un PR deben pasar
`pnpm lint`, `pnpm check`, `pnpm arch`, `pnpm test`, `pnpm e2e`. Toda decisión no trivial se anota en
`docs/DECISIONES.md`.
