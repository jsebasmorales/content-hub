# SDD – Content Hub (Holafly)

**Versión:** 1.4 (borrador para desarrollo) · **Autor:** Sebas (Content Lead) · **Destinatario principal:** Claude Code
**Referencias de comportamiento y UX:** `Content_Hub_Mockup.html` (mockup navegable) y `Propuesta_Content_Hub.docx`.

---

## 0. Cómo usar este documento (leer primero)

Este documento es el contrato de diseño del Content Hub. Claude Code debe:

1. Leerlo completo antes de escribir código y trabajar **por fases** (sección 16). No empezar la fase N+1 sin cumplir los criterios de aceptación de la fase N.
2. Tratar las secciones marcadas **[OBLIGATORIO]** como reglas no negociables.
3. Usar el mockup como referencia visual y de comportamiento (textos, jerarquía, interacciones del buscador), **no como código a copiar**: el mockup es un HTML de un solo archivo con datos de ejemplo; el producto real debe seguir la arquitectura de este SDD.
4. Si algo no está definido, **no inventar**: registrarlo en `docs/DECISIONES.md` con la opción elegida y el motivo, y marcarlo para revisión. Las preguntas ya identificadas están en la sección 17.
5. Escribir el código y los comentarios en inglés, y los textos de interfaz en español.

---

## 1. Contexto y objetivos

El equipo de Contenido de Holafly gestiona su trabajo en Jira (proyecto **JSM-CONTENT**, tablero Kanban) y los textos del producto viven repartidos entre Strapi, Crowdin y la base de datos "Content Ecosystem" de Confluence. Hoy no hay una vista única del trabajo, ni una forma segura de saber **dónde está un texto y qué se rompe si se cambia**.

El **Content Hub** resuelve dos cosas:

| #   | Objetivo                                   | Resultado esperado                                                                                                                                        |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dashboard de gestión** sobre Jira        | Resumen ejecutivo, tareas, SLAs, incumplimientos, objetivos (árbol de épicas), capacidad vs demanda, lo aprendido, definiciones.                          |
| 2   | **Content Ecosystem** (buscador de campos) | Encontrar cualquier texto por frase, llave de traducción o ubicación; ver captura con recuadro rojo, dónde se edita, dependencias y checklist de impacto. |

Requisitos transversales (todos **[OBLIGATORIO]**):

- Datos de **Jira y Crowdin siempre actualizados** (webhooks + reconciliación).
- **Astro**, ligero, carga lo más rápida posible.
- **Sin código espagueti**: arquitectura por capas, módulos con fronteras claras, tipos estrictos.
- **Validación de seguridad completa** (sección 11).
- **Administrador granular de roles**: solo los líderes ajustan permisos; lo que un perfil no puede ver **se oculta** (no se muestra bloqueado).
- Acceso restringido a cuentas **@holafly.com**.

### Fuera de alcance (v1)

- Editar tickets de Jira desde el Hub (solo lectura; el botón "Resincronizar" refresca, no escribe).
- Editar texto en Strapi o Crowdin desde el Hub (el Hub **indica dónde editar**, no edita).
- Métricas de resultados de negocio y cobertura de localización (excluidas por decisión previa).
- App móvil. Multi-idioma de la interfaz (solo español).
- **Editor de contenido del Ecosystem dentro del Hub (v1):** el contenido lo carga Sebas con importación y archivos de datos. El modelo de datos y el permiso `action.ecoedit` quedan listos para añadir el editor más adelante.

---

## 2. Decisiones de arquitectura

| Decisión            | Elección                                                                                                                                                                                                                                 | Motivo                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | **Astro** (última versión estable al crear el proyecto; hoy 7.x) con `output: 'server'` y páginas prerenderizadas donde no dependan del usuario                                                                                          | HTML por defecto, JS solo donde hace falta (islas).                                                                                                                                                                                                              |
| Lenguaje            | TypeScript `strict`, `noUncheckedIndexedAccess`                                                                                                                                                                                          | Menos errores en runtime.                                                                                                                                                                                                                                        |
| Interactividad      | **Islas mínimas** con Preact (o vanilla + Web Components) únicamente en: buscador, editor de recuadro, gráficos interactivos, administrador de roles                                                                                     | Mantener el JS del cliente pequeño.                                                                                                                                                                                                                              |
| Adaptador y hosting | **`@astrojs/netlify`**; todo el producto en **Netlify**, por ahora en el plan gratuito                                                                                                                                                   | Un solo lugar para web, base de datos y archivos. El plan gratuito de Netlify permite uso comercial; se revisan sus términos al crear la cuenta. Con `session: false` en la configuración de Astro, porque las sesiones van en nuestra BD y no en Netlify Blobs. |
| Base de datos       | **Netlify DB** (PostgreSQL administrado, Neon) + **Drizzle ORM** + migraciones versionadas; conexión con driver serverless                                                                                                               | SQLite no es opción en un entorno serverless (sin disco persistente). Permisos, auditoría, caché de Jira y búsqueda (FTS + `pg_trgm`) en un solo motor.                                                                                                          |
| Validación          | **Zod** en todas las fronteras (entradas HTTP, payloads de webhooks, respuestas de Jira/Crowdin, variables de entorno)                                                                                                                   | Nada entra sin validarse.                                                                                                                                                                                                                                        |
| Autenticación       | **Inicio de sesión con Atlassian (OAuth 2.0, 3LO)** detrás del puerto `AuthProvider`                                                                                                                                                     | Decisión cerrada: el equipo ya tiene cuenta Atlassian y no hace falta Google Workspace. Se puede añadir Google después sin tocar el resto.                                                                                                                       |
| Sesiones            | Cookie de sesión opaca, `HttpOnly`, `Secure`, `SameSite=Lax`, almacenada en BD con rotación y expiración                                                                                                                                 | Revocable en servidor.                                                                                                                                                                                                                                           |
| Cola/Jobs           | Tabla `webhook_event` en Postgres + **Background Functions de Netlify** para el procesamiento; reconciliación **manual** (botón) y **perezosa**. Las **funciones programadas de Netlify** quedan como opción para un respaldo automático | El webhook solo valida, guarda el evento y responde; el trabajo pesado corre aparte.                                                                                                                                                                             |
| Almacenamiento      | **Netlify Blobs** (capturas)                                                                                                                                                                                                             | Mismo proveedor. Acceso solo mediante endpoint autenticado.                                                                                                                                                                                                      |
| Gráficos            | SVG renderizado **en servidor** (componentes `.astro`) con paleta Holafly                                                                                                                                                                | Cero JS para gráficos estáticos.                                                                                                                                                                                                                                 |

**Reglas Astro [OBLIGATORIO]:**

- Mantener `security.checkOrigin` activo (por defecto lo está desde Astro 5) para proteger POST/PUT/PATCH/DELETE contra CSRF. No usar el pipeline composable `astro/hono` salvo necesidad real; si se usa, `middleware()` debe montarse **antes** de `actions()` y `pages()` (existió un fallo de bypass en 7.0.0–7.0.5, corregido en 7.0.6).
- Activar la **Content Security Policy** integrada de Astro si la versión la ofrece; si no, aplicarla desde el middleware con nonces.
- Secretos con `astro:env` (esquema tipado, `access: 'secret'`, `context: 'server'`).
- Fijar versiones exactas en `package-lock` y actualizar por Dependabot/Renovate.

---

## 3. Estructura del repositorio (anti-espagueti) [OBLIGATORIO]

Arquitectura en capas con **dependencias en una sola dirección**: `presentation → application → domain`, e `infrastructure` implementa los puertos que define `application`.

```
/src
  /domain              # Reglas puras. Sin Astro, sin BD, sin fetch.
    /jira              # Ticket, Sla, Epic, Objective, reglas de cálculo (% esfuerzo, SLA 90 %)
    /ecosystem         # Category, Section, Field, Dependency, ImpactChecklist, BoundingBox
    /access            # Role, Permission, Resource, políticas de visibilidad
    /search            # tokenización, sinónimos, puntuación (funciones puras)
  /application         # Casos de uso. Orquestan dominio + puertos.
    /use-cases         # p. ej. GetExecutiveSummary, SearchEcosystem, UpdateRolePermissions
    /ports             # interfaces: JiraGateway, CrowdinGateway, Repositories, Clock, AuditLog
  /infrastructure      # Adaptadores concretos.
    /db                # esquema Drizzle, repositorios, migraciones
    /jira              # cliente REST, mapeo de campos, verificación de webhook
    /crowdin           # cliente REST, verificación de webhook, mapeo de llaves
    /strapi            # lectura (solo GET) — fase posterior
    /auth              # proveedores de acceso (puerto AuthProvider), sesiones
    /storage           # capturas de pantalla (objeto/archivo)
    /config            # lectura y validación de entorno
  /presentation
    /pages             # rutas Astro (finas: llaman a casos de uso y renderizan)
    /components        # UI (.astro) e islas (.tsx)
    /layouts
    /api               # endpoints (finos: validar → caso de uso → responder)
  /shared              # tipos y utilidades sin dependencias de capa
/tests                 # unit (domain), integration (infrastructure), e2e (Playwright)
/docs                  # DECISIONES.md, runbooks, esquema de eventos
```

**Reglas de código [OBLIGATORIO]:**

1. Las páginas y endpoints **no contienen lógica de negocio ni SQL**: validan, llaman a un caso de uso y devuelven.
2. `domain` no importa nada de `infrastructure` ni de `presentation`. Se verifica con **dependency-cruiser** en CI (el build falla si se rompe).
3. Un archivo = una responsabilidad; funciones ≤ 40 líneas como guía; sin archivos "utils" genéricos.
4. Sin `any`; `unknown` + Zod en las fronteras. ESLint estricto + Prettier + `astro check` en CI.
5. Nada de acceso a `process.env` fuera de `/infrastructure/config`.
6. Errores tipados (`Result` o excepciones de dominio) y un único manejador de errores en el borde.
7. Cada puerto tiene un adaptador real y un **fake** para pruebas.
8. Toda decisión no trivial se registra en `docs/DECISIONES.md` (mini-ADR).

---

## 4. Modelo de datos

Convenciones: ids UUID v7, `created_at/updated_at` en UTC, borrado lógico donde haya auditoría.

### 4.1 Jira (caché de solo lectura)

| Tabla                    | Campos clave                                                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira_issue`             | `key` (único), `summary`, `status`, `status_category`, `request_type`, `priority`, `assignee_id`, `reporter_id`, `created_at`, `resolved_at`, `epic_key`, `labels[]`, `sla_*` (inicio, objetivo, pausa, incumplido), `time_in_progress_seconds`, `raw` (JSONB, opcional), `jira_updated_at`, `synced_at` |
| `jira_epic`              | `key`, `name`, `status`, `objective_id`                                                                                                                                                                                                                                                                  |
| `jira_status_transition` | `issue_key`, `from`, `to`, `at` (para tiempos reales de "En progreso")                                                                                                                                                                                                                                   |
| `objective`              | `id`, `name`, `level` (company / marketing / team), `parent_id`, `epic_key`                                                                                                                                                                                                                              |
| `sync_run`               | `id`, `source` (jira / crowdin), `kind` (webhook / manual / reconcile), `started_at`, `finished_at`, `status`, `items`, `error`                                                                                                                                                                          |

Reglas de dominio: % de esfuerzo por objetivo = tickets (ponderados por tiempo en "En progreso" cuando exista); SLAs con meta del **90 %**; fecha de referencia = fecha actual del servidor (no fija como en el mockup).

### 4.2 Content Ecosystem

| Tabla            | Campos clave                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eco_category`   | `id`, `name`, `position` — las 14 iniciales: Home, PDP, App, Emails, Landing Page, Markdown Page, Blog, WhatsApp, B2B, Short FAQ Section, Product Feature, Push notifications, Checkout, Holafly Hub                                                                                                           |
| `eco_section`    | `id`, `category_id`, `page`, `name`, `platform`, `crowdin_project`, `crowdin_file`, `strapi_collection`, `strapi_url` (solo referencia y enlace para editar), `entry`, `owner_id`, `translation_status`, `screenshot_id`, `confluence_ref`                                                                     |
| `eco_field`      | `id`, `section_id`, `label`, `current_text`, `crowdin_key`, `platform_override`, `status` (ok / revisar / desactualizado), `last_verified_at`, `last_verified_by`, `box_x, box_y, box_w, box_h` (px sobre la captura), `box_source` (ocr / manual), `box_confidence`, `note`, `managed_by_translations` (bool) |
| `eco_dependency` | `field_id`, `depends_on_field_id` o `depends_on_ref`, `kind`, `note`                                                                                                                                                                                                                                           |
| `eco_screenshot` | `id`, `storage_key`, `width`, `height`, `sha256`, `uploaded_by`, `uploaded_at`                                                                                                                                                                                                                                 |
| `eco_synonym`    | `term`, `synonym`, `lang_pair` (ES↔EN), `active`                                                                                                                                                                                                                                                               |
| `eco_change_log` | historial de cambios por campo (quién, qué, cuándo, antes/después)                                                                                                                                                                                                                                             |

### 4.3 Acceso y auditoría

| Tabla             | Campos clave                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_user`        | `id`, `email` (único, `@holafly.com`), `name`, `role_id`, `status` (invitado / activo / desactivado), `invited_by`, `invited_at`, `last_login_at` |
| `role`            | `id`, `name` (Colaborador, Líder; extensible), `is_system`                                                                                        |
| `permission`      | catálogo fijo de recursos (sección 10)                                                                                                            |
| `role_permission` | `role_id`, `permission_key`, `granted`                                                                                                            |
| `session`         | `id` (hash), `user_id`, `expires_at`, `ip`, `user_agent`                                                                                          |
| `audit_log`       | `id`, `actor_id`, `action`, `target_type`, `target_id`, `before`, `after`, `ip`, `at` (**solo inserción**)                                        |
| `webhook_event`   | `id`, `source`, `delivery_id` (único, idempotencia), `type`, `payload`, `received_at`, `processed_at`, `attempts`, `error`                        |

---

## 5. Páginas y navegación

Las páginas replican el mockup. Cada una es una **ruta propia** (no un one-page):

| Ruta                                | Recurso de permiso | Notas                                                   |
| ----------------------------------- | ------------------ | ------------------------------------------------------- |
| `/` Resumen ejecutivo               | `section.exec`     | KPIs grandes con tooltip ⓘ.                             |
| `/resumen` Resumen                  | `section.summary`  |                                                         |
| `/ecosystem` Content Ecosystem      | `section.eco`      | Buscador por categoría + barra + botón.                 |
| `/tareas` Tareas                    | `section.work`     | Une las tres pestañas anteriores con un solo filtro.    |
| `/sla` SLAs                         | `section.sla`      |                                                         |
| `/incumplimientos` SLAs incumplidos | `section.breach`   |                                                         |
| `/objetivos` Objetivos              | `section.goals`    | Árbol compañía → marketing → épica de equipo → tickets. |
| `/capacidad` Capacidad vs demanda   | `section.capacity` |                                                         |
| `/trimestres` Trimestre a trimestre | `section.qoq`      |                                                         |
| `/aprendido` Lo aprendido           | `section.learn`    |                                                         |
| `/definiciones` Definiciones        | `section.defs`     |                                                         |
| `/permisos` Administrador de roles  | `admin.roles`      | Solo Líder.                                             |

Rendimiento por página: las páginas que **no** dependen del usuario más allá de la visibilidad se generan con datos cacheados (sección 12); los gráficos se renderizan como SVG en servidor.

---

## 6. Integración con Jira

### 6.1 Principios

- **Solo lectura.** Token de servicio con permisos mínimos (Browse Projects sobre JSM-CONTENT, lectura de SLA/Service Desk).
- **Fuente de verdad = Jira.** La BD es una caché derivada; cualquier divergencia se resuelve a favor de Jira.
- **Tres mecanismos juntos**, para que nunca se quede desactualizado:

| Mecanismo                          | Cuándo                                                                                                                                                              | Qué hace                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Carga inicial**                  | Una vez al desplegar (`pnpm sync:jira --full`)                                                                                                                      | Trae todo el histórico del proyecto con paginación y límites de tasa.                                                                               |
| **Webhook**                        | Tiempo real                                                                                                                                                         | Eventos `jira:issue_created`, `jira:issue_updated`, `jira:issue_deleted`, y cambios de épica/estado. Cada evento actualiza solo el ticket afectado. |
| **Reconciliación perezosa**        | Al abrir el dashboard, si el último sync tiene más de 15 min, se lanza en segundo plano (máx. 1 cada 5 min). Reemplaza al cron mientras no haya plan que lo permita | Cubre eventos perdidos o webhooks caídos.                                                                                                           |
| **Botón "Resincronizar con Jira"** | Manual (permiso `action.sync`)                                                                                                                                      | Lanza una reconciliación inmediata (hay un botón análogo para Crowdin); limitado a 1 por minuto por usuario; muestra estado y hora del último sync. |

### 6.2 Webhook de Jira

- Endpoint: `POST /api/webhooks/jira`.
- **Dónde se crea:** (1) Jira → Configuración (engranaje) → Sistema → **WebHooks** → Crear webhook; requiere ser administrador de Jira. Poner la URL pública del Hub, eventos de incidencias y el JQL `project = JSM-CONTENT`, y revisar si el formulario ofrece un campo de secreto. (2) Si no eres administrador: **Automatización de Jira** (Configuración del proyecto → Automatización) con la acción **"Send web request"** (POST con una cabecera secreta propia) disparada al crear, editar o transicionar una incidencia; verificar el permiso que pide en vuestro sitio. (3) El **token de API** se genera en `id.atlassian.com/manage-profile/security/api-tokens`; usar una cuenta de servicio de solo lectura en vez de la personal.
- **Verificación [OBLIGATORIO]:** leer el **cuerpo crudo** antes de parsear, calcular HMAC-SHA256 con el secreto y compararlo con la cabecera `X-Hub-Signature` (`sha256=<hex>`) usando comparación de tiempo constante.
- **Atención, dependiente del tenant:** la documentación y las guías disponibles indican que solo los webhooks registrados con secreto (REST/dinámicos) llevan firma, y que los webhooks creados desde la interfaz de administración clásica pueden no firmarse. Primera tarea de la fase 1: **comprobar en el tenant real** qué tipo se puede crear. Si no hay firma, aplicar defensa en capas: token aleatorio largo en la ruta (`/api/webhooks/jira/<token>`), lista de IPs de Atlassian en el proxy y la reconciliación periódica como red de seguridad.
- Si se usa el webhook dinámico por REST, **caduca a los 30 días**: mostrar en `/estado` los días restantes y ofrecer al Líder un botón de renovación (sin cron).
- Idempotencia: guardar `X-Atlassian-Webhook-Identifier` en `webhook_event.delivery_id`; si ya existe, responder 200 sin reprocesar.
- Respuesta rápida (< 2 s): validar → guardar evento → responder `202`; el procesamiento ocurre en una Background Function de Netlify y, si falla, queda marcado en `webhook_event` y lo reintenta la siguiente reconciliación (perezosa o manual), con espera creciente (máx. 5) y cola de errores visible para el Líder.
- El payload es solo una señal: para el estado completo del ticket, **volver a pedirlo a Jira por clave** (no confiar en el contenido del webhook para campos calculados como SLA).

### 6.3 Campos y mapeos

Documentar en `docs/jira-mapping.md` (la primera tarea de la fase 1 es generarlo consultando los campos reales): estados (Por hacer, En progreso, En revisión, Hecho), tipos de solicitud, campo/relación de épica, los SLAs son **Time to response** y **Time to done** y se leen con la API de Service Desk (`GET /rest/servicedeskapi/request/{issueIdOrKey}/sla`), no desde campos personalizados, junto con su cálculo de incumplimiento. Los ids de campos personalizados se leen de configuración, nunca van quemados en el código.

### 6.4 Límites y resiliencia

Respetar `Retry-After` y 429; backoff con jitter; paginación por `nextPageToken`/`startAt`; tiempos de espera explícitos; el dashboard sigue sirviendo la última caché si Jira no responde y muestra "datos al <hora>".

---

## 7. Integración con Crowdin (webhook)

### 7.1 Qué se necesita de Crowdin

- Dos proyectos en **Crowdin Enterprise** (plan Team+), ambos **por archivos**, en `holafly.crowdin.com`: **app** (proyecto 19) y **ecommerce** (proyecto 55). Idioma fuente: inglés.
- Token de acceso de **solo lectura**, idealmente de una cuenta de servicio con acceso únicamente a esos dos proyectos.
- Un webhook por proyecto (Herramientas → Webhooks del proyecto; lo crea quien tenga rol de gestor).

### 7.2 Eventos a suscribir (proyectos por archivos)

Los eventos `string.*` pertenecen a proyectos por cadenas; aquí se usan los de archivo. Confirmar los nombres exactos en la documentación de eventos por archivos de Crowdin Enterprise al crear los webhooks.

| Evento                                                                       | Uso en el Hub                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `file.added`, `file.updated`, `file.deleted`                                 | Cambió el texto fuente o las llaves de un archivo → releer las cadenas del archivo y compararlas con los campos (7.4). |
| `file.translated`, `file.approved`, `project.translated`, `project.approved` | Reflejar el estado de traducción (`translation_status`) de la sección.                                                 |

### 7.3 Recepción segura

- Endpoint: `POST /api/webhooks/crowdin`.
- Los webhooks de Crowdin permiten **cabeceras personalizadas**: configurar una cabecera secreta (p. ej. `X-Hub-Secret`) con un valor largo y aleatorio y compararla en tiempo constante. Si se opta por una app de Crowdin, usar su cabecera `X-Crowdin-Signature` y validarla según la documentación vigente.
- Validar el payload con Zod; descartar eventos de proyectos no listados.
- Idempotencia por `delivery_id`/hash del evento, respuesta `202` inmediata y procesamiento asíncrono, igual que en Jira.
- El payload **no es la fuente de verdad**: tras recibir un evento, leer la cadena actual por API (`GET`) y comparar con `eco_field.current_text`.

### 7.4 Regla de sincronización de campos

```
evento Crowdin (file.*) → (proyecto, archivo) → agrupar eventos del mismo archivo (ventana de 60 s)
  → leer por API las cadenas del archivo → para cada llave:
     existe eco_field con esa crowdin_key y el texto difiere
        → actualizar current_text, status = "revisar", registrar eco_change_log,
          marcar la captura de la sección como posiblemente desactualizada (aviso al Líder)
     llave nueva sin eco_field → bandeja "Llaves sin ubicar"
     llave que ya no existe     → status = "desactualizado" + aviso (no se borra el campo)
```

La bandeja **"Llaves sin ubicar"** evita que el contenido nuevo quede fuera del Ecosistema (ver sección 8). Cada sección guarda a qué proyecto y archivo de Crowdin pertenece (`crowdin_project`, `crowdin_file`).

---

## 8. Content Ecosystem: cómo entra y se mantiene el contenido [OBLIGATORIO]

### 8.1 Modelo mental

Categoría → Sección (ubicación con una captura) → Campos (texto, llave, recuadro rojo, dependencias). Una sola captura por sección; al hacer clic en un campo cambia el detalle y el recuadro se mueve.

### 8.2 Vías de entrada (de la más masiva a la más fina)

| Vía                                       | Quién      | Qué hace                                                                                                                                                                                                                                                                                            | Fase |
| ----------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **A. Importación inicial (una sola vez)** | Sebas      | Se exporta a **CSV** la base "Content Ecosystem" de Confluence (espacio Content). Importador `pnpm import:confluence <archivo.csv>` con **modo simulación** e informe. Después de importar, **el Hub es la fuente de verdad** y la base de Confluence queda como archivo histórico de solo lectura. | 2    |
| **B. Carga por archivos de datos**        | Sebas      | Archivos versionados en el repositorio (`/data/ecosystem/*.yaml`, más las capturas) que un script (`pnpm ecosystem:load`) valida con Zod y carga, con modo simulación. Es la vía para añadir y corregir contenido mientras no exista editor.                                                        | 2    |
| **C. Bandeja "Llaves sin ubicar"**        | Sebas      | Llaves nuevas detectadas por Crowdin que aún no están en el Ecosystem: se listan y se añaden con la vía B.                                                                                                                                                                                          | 4    |
| **D. Detección de huecos**                | Automático | Reporte semanal: secciones sin captura, campos sin llave, llaves sin owner, campos sin verificar > 90 días.                                                                                                                                                                                         | 4    |

### 8.3 Reglas de importación (A)

1. **Mapeo de columnas** explícito en `docs/ecosystem-import-mapping.md`: Digital Asset → categoría, Page, Section, Text field, Image Reference, Content details (lista "etiqueta + llave" o "componente no gestionado por traducciones"), Platform, Collection/Project, Owner, Translation Status, Comments.
2. **Normalización:** recortar espacios, unificar mayúsculas de plataformas, separar la lista de campos del texto enriquecido (cada línea = un `eco_field`; "no gestionado por traducciones" ⇒ `managed_by_translations = false`).
3. **Validación (Zod):** categoría debe existir; llaves con formato válido; owners deben mapear a un usuario `@holafly.com` (si no, quedan "sin owner" en el informe).
4. **Idempotente:** clave natural (categoría + página + sección + llave); reimportar actualiza, no duplica.
5. **Informe** descargable: filas importadas, rechazadas (con motivo), duplicadas y ambigüedades.
6. Capturas e inventario de recuadros **no vienen del CSV**: se cargan en la vía B (o por lote con un archivo de coordenadas si se prepara).

### 8.4 Capturas y recuadro rojo (carga manual + detección asistida)

**Decisión v1:** Sebas sube las capturas. No hay un proceso que abra las páginas, y no se depende de atributos en el código del front. Los recuadros los **propone el sistema por OCR** y se revisan.

1. **Captura:** una por sección (página pública, en inglés), guardada en `/data/ecosystem/screens/` junto al archivo de datos de la sección. Para App, Push y WhatsApp, captura de pantalla de la app; para emails, captura del correo renderizado.
2. **Detección asistida:** el comando local `pnpm ecosystem:detect` (se ejecuta en el equipo de Sebas, nunca en el servidor de despliegue) lee la captura con OCR (Tesseract), busca el `current_text` de cada campo (texto vigente de Crowdin o del CSV, normalizado) y calcula `x, y, w, h`. Guarda `box_source = ocr` y `box_confidence`.
3. **Informe de revisión:** campos detectados, **dudosos** (confianza baja o el mismo texto aparece varias veces) y **no encontrados** (texto pequeño, bajo contraste, sobre imagen o no visible en la captura). Los dudosos y no encontrados se corrigen con coordenadas manuales (`box_source = manual`). Un recuadro manual nunca se sobrescribe con uno automático.
4. **Carga:** `pnpm ecosystem:load` valida los datos (el recuadro debe caber dentro de la imagen), sube la captura a Netlify Blobs y carga todo mediante un endpoint protegido (`POST /api/admin/ecosystem/import`, token de servicio `INGEST_API_TOKEN`, validación Zod, idempotente).
5. **Cambios de diseño:** al sustituir una captura se vuelve a ejecutar `detect`, que solo **propone** cambios para revisión.

**Subida de archivos [OBLIGATORIO]:** solo PNG, JPEG o WebP (SVG prohibido), máximo 5 MB, verificación por firma de archivo (magic bytes), recodificación en servidor (elimina metadatos y código embebido) y nombre aleatorio. Las capturas se sirven solo a usuarios autenticados con permiso de módulo (`section.eco`).

**Más adelante (fuera de v1):** captura automática de las páginas con un navegador sin interfaz y atributos de llave de traducción en el front, que harían la detección exacta. Se reconsidera si el negocio lo prioriza.

### 8.5 Dependencias e impacto

Cada campo declara de qué depende (SEO personalizado, otro campo, plantilla, plataforma). El **impacto es transitivo**: el detalle muestra una lista de verificación con todo lo que debe revisarse antes de cambiar el texto (p. ej. cambio de nombre de un destino ⇒ URL, SEO, emails, App). Se detectan ciclos al guardar y se rechazan.

### 8.6 Estados y verificación

`ok` / `revisar` / `desactualizado`; "última verificación" con fecha y persona. Un campo pasa a **revisar** automáticamente por evento de Crowdin (7.4) y vuelve a **ok** cuando su owner lo verifica (queda en `eco_change_log`). En v1 la verificación es un botón "Marcar como verificado" (permiso `action.ecoedit`), la única escritura del módulo desde la interfaz.

### 8.7 Fuente del texto vigente y Strapi

- El texto vigente se **lee de Crowdin** por API (solo lectura) y se guarda en `current_text`; nunca se edita en el Hub.
- **Strapi no se lee.** Cada sección solo guarda `strapi_collection` y `strapi_url`: el Hub indica en qué colección está el campo y ofrece un enlace directo para que el colaborador entre a Strapi a ajustar el texto.
- Los textos de campos no gestionados por traducciones se cargan desde el CSV y los archivos de datos.

---

## 9. Búsqueda

Basada en el comportamiento ya validado en el mockup:

- **Alcance:** opcionalmente una categoría (desplegable a la izquierda, no obligatorio) + barra de búsqueda + botón.
- **Motor:** Postgres `tsvector` (diccionario español + inglés) + `pg_trgm` para tolerancia a errores (equivale al fuzzy ≤ 1 del mockup) + tabla `eco_synonym` (ES↔EN, administrable por el Líder).
- **Coincidencia:** AND de términos con coincidencia literal, por sinónimo o aproximada; puntuación con bonificación por frase exacta.
- **Autocompletado (estilo Google):** endpoint `GET /api/ecosystem/suggest?q=&cat=` con tipos de sugerencia (frase, campo, llave, ubicación, "¿quisiste decir?"), respetando la categoría elegida; respuesta < 100 ms, `debounce` de 120 ms en el cliente, cancelación de peticiones previas.
- **Accesibilidad:** patrón _combobox_ ARIA con navegación por teclado (↑ ↓ Enter Esc).
- **Permisos:** la búsqueda solo responde si el usuario tiene el permiso del módulo `section.eco` (el acceso es a todo el módulo, sin filtrar por categoría); nunca se filtra en el cliente y no se revela cuántos resultados ocultos existen.
- **Entradas:** longitud máxima 120 caracteres, consultas parametrizadas, límite de tasa por usuario.

---

## 10. Roles y permisos granulares [OBLIGATORIO]

### 10.1 Modelo

- Roles: **Colaborador** y **Líder** (decisión cerrada). Hoy el único Líder es Sebas. El modelo admite crear roles nuevos sin cambiar código.
- **Permisos = catálogo fijo en código** (el Líder asigna, no inventa):
  - `section.<id>` — ver una sección/página (exec, summary, eco, work, sla, breach, goals, capacity, qoq, learn, defs).
  - `action.sync` — usar "Resincronizar con Jira".
  - `action.ecoedit` — en v1 solo "Marcar como verificado"; reservado para el editor futuro.
  - `admin.roles` — administrar permisos y usuarios (**siempre y solo Líder; no es asignable a otros roles**).
- Cada permiso se concede por **rol**. (Si se requieren excepciones por persona, se añade `user_permission_override` en una fase posterior.)

### 10.2 Administrador de roles (página `/permisos`)

- Solo visible y accesible para quien tenga `admin.roles`.
- Matriz rol × permiso con interruptores; cambios con **vista previa** ("este rol verá estas secciones") y confirmación.
- Reglas de seguridad: no se puede dejar el sistema **sin ningún Líder**; un Líder no puede quitarse a sí mismo el último permiso de administración; todo cambio queda en `audit_log` con antes/después.
- **Acceso por invitación:** el Líder añade el correo `@holafly.com` de cada persona y su rol (Colaborador o Líder) en `/permisos`. Solo quien está invitado y activo puede entrar; no hay alta automática. Para dar de baja se desactiva al usuario y sus sesiones se revocan al instante. Para promover a Líder se pide confirmación y queda en auditoría.
- Arranque (_bootstrap_): el primer Líder se define por variable de entorno (`BOOTSTRAP_LEADER_EMAIL`), válida solo mientras no exista ningún Líder.

### 10.3 "Ocultar, no bloquear" — cómo se aplica

La visibilidad se decide en **un único punto** (`AccessPolicy` en `domain/access`) y se aplica en todas las capas:

| Capa                     | Comportamiento                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Navegación**           | El menú se construye en servidor con solo las secciones permitidas. No existen enlaces, ni iconos de candado, ni texto "sin acceso".                         |
| **Rutas**                | Si el usuario pide una ruta no permitida, responde **404** (igual que una ruta inexistente), nunca 403, para no revelar que existe.                          |
| **API**                  | Mismo criterio: 404 y sin cuerpo informativo.                                                                                                                |
| **Datos**                | Las consultas reciben el conjunto de permisos y filtran en SQL. Los totales y KPIs se calculan **solo con lo visible**.                                      |
| **Búsqueda/sugerencias** | Filtradas en servidor (sección 9).                                                                                                                           |
| **Caché**                | Las claves de caché incluyen el hash del conjunto de permisos; nunca se sirve a un usuario una respuesta cacheada de otro perfil.                            |
| **Cliente**              | El HTML/JS enviado no contiene datos, rutas ni nombres de secciones no permitidas.                                                                           |
| **Cambios de permisos**  | Se aplican en la siguiente petición (los permisos se leen por petición o con caché de ≤ 60 s invalidada al guardar); no se incrustan en la cookie de sesión. |

Prueba obligatoria: un perfil sin acceso a una sección no debe poder detectar su existencia por menú, URL directa, API, búsqueda, caché ni código fuente de la página.

---

## 11. Seguridad [OBLIGATORIO]

La validación de seguridad es un entregable, no una tarea final. Se ejecuta en cada fase y se cierra con una revisión completa antes de producción.

### 11.1 Modelo de amenazas (resumen)

| Activo                        | Amenaza                        | Control principal                                                                |
| ----------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Datos de Jira y del Ecosystem | Acceso de personas ajenas      | Inicio de sesión Atlassian + correo @holafly.com + invitación + RBAC en servidor |
| Permisos                      | Escalada de privilegios        | `admin.roles` solo Líder, auditoría, validación en servidor                      |
| Webhooks                      | Eventos falsos                 | Firma/secreto, idempotencia, re-lectura desde la fuente                          |
| Tokens de API                 | Filtración                     | Gestor de secretos, mínimo privilegio, rotación                                  |
| Capturas                      | Archivo malicioso / fuga       | Validación de firma, recodificación, acceso autenticado                          |
| Búsqueda                      | Inyección, abuso               | Consultas parametrizadas, límites                                                |
| Dashboard                     | Datos de otro perfil por caché | Claves de caché por permisos                                                     |

### 11.2 Controles por área

**Autenticación y sesión**

- Inicio de sesión con **Atlassian OAuth 2.0 (3LO)**: `state` y PKCE, scopes mínimos (`read:me`), y validar que el correo del perfil sea `@holafly.com` **y exista como usuario invitado y activo**. Si Atlassian no devuelve el correo (por la visibilidad del perfil), se rechaza el acceso y se avisa al Líder. El puerto `AuthProvider` permite añadir Google más adelante.
- Sesión opaca en BD, expiración absoluta (12 h) e inactividad (60 min), rotación del identificador tras el login, cierre de sesión que la revoca en servidor.
- Usuario desactivado ⇒ sesiones revocadas de inmediato.

**Autorización**

- Denegar por defecto. Toda ruta y endpoint declara el permiso que exige; una prueba automática recorre todas las rutas y falla si alguna no lo declara.
- Comprobar permisos en servidor en cada petición; nunca confiar en datos del cliente.
- Protección contra IDOR: los identificadores de recursos se verifican contra el alcance del usuario.

**Entrada y salida**

- Zod en todo; límites de tamaño de cuerpo; tipos de contenido permitidos.
- Escape automático de Astro; prohibido `set:html` con datos externos (si es imprescindible, sanitizar con una lista blanca).
- SQL solo mediante Drizzle/parametrizado.
- Resaltado de búsqueda con DOM seguro (sin `innerHTML` con texto del usuario).

**CSRF y CORS**

- `security.checkOrigin` activo + cookies `SameSite=Lax` + token anti-CSRF en acciones que cambian estado. CORS cerrado (mismo origen).

**Cabeceras** (middleware): `Content-Security-Policy` con nonces (sin `unsafe-inline`), `Strict-Transport-Security` (1 año, `includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `frame-ancestors 'none'`, `Cross-Origin-Opener-Policy: same-origin`.

**Webhooks:** firma o secreto en tiempo constante, cuerpo crudo, tamaño máximo (1 MB), idempotencia, límite de tasa, listas de IP donde aplique (secciones 6.2 y 7.3).

**SSRF y llamadas salientes:** solo a dominios fijados en configuración (Atlassian, Crowdin y el proveedor de autenticación o correo); sin URLs controladas por el usuario; tiempos de espera y reintentos acotados.

**Secretos:** solo en variables de entorno/gestor de secretos del hosting, nunca en el repositorio ni en logs; tokens separados por entorno; rotación documentada; escaneo de secretos en CI (gitleaks).

**Cadena de suministro:** `npm audit`/OSV en CI, Dependabot o Renovate, versiones fijadas, revisión de dependencias nuevas, SBOM en cada release, mínimas dependencias de cliente.

**Limitación de tasa** (contador en BD o Redis, no en memoria): por IP y por usuario en login, búsqueda, sugerencias, resincronización y webhooks.

**Privacidad y datos:** guardar solo lo necesario de Jira (sin descripciones sensibles si no se usan); no almacenar datos personales de clientes; política de retención de `webhook_event` (30 días) y `audit_log` (≥ 1 año); copias de seguridad cifradas con prueba de restauración.

**Registro y auditoría:** registros estructurados sin datos sensibles; `audit_log` inmutable para cambios de permisos, roles, importaciones, ediciones del Ecosystem, inicios de sesión y fallos de autorización; alertas ante picos de 404/401/403 y de firmas inválidas.

**Infraestructura:** HTTPS gestionado por Netlify, base de datos accesible solo con credenciales del proyecto por entorno, usuario de BD con mínimo privilegio, variables de entorno separadas (Development / Preview / Production), **los despliegues Preview no deben exponer datos reales**: usar una base de datos distinta o desactivarlos, y proteger su acceso (en Netlify la protección con contraseña o por equipo puede requerir un plan de pago: verificar).

### 11.3 Revisión de seguridad (puerta de salida a producción)

- [ ] Lista OWASP Top 10 revisada punto por punto (documento en `docs/security-review.md`).
- [ ] Pruebas automáticas de autorización: cada rol × cada ruta/endpoint.
- [ ] Prueba de "ocultar, no bloquear" (sección 10.3).
- [ ] Prueba de webhooks: firma inválida, repetición, payload malformado, cuerpo gigante.
- [ ] Análisis estático (CodeQL o Semgrep) y de dependencias sin hallazgos críticos/altos abiertos.
- [ ] Escaneo de secretos limpio, incluido el historial de git.
- [ ] Prueba de la carga de capturas: archivos hostiles (SVG, polyglot, dimensiones extremas, nombres con `../`) y token de ingesta inválido.
- [ ] Revisión de cabeceras con una herramienta externa (calificación A).
- [ ] Prueba de penetración básica (interna o externa) antes del lanzamiento general.
- [ ] Plan de respuesta ante incidentes y rotación de tokens documentado.

---

## 12. Rendimiento [OBLIGATORIO]

**Presupuesto (medido en CI con Lighthouse CI y en producción con RUM simple):**

| Métrica                             | Meta                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| LCP                                 | ≤ 1,5 s en 4G simulada                                 |
| INP                                 | ≤ 150 ms                                               |
| CLS                                 | ≤ 0,05                                                 |
| JS enviado en páginas del dashboard | ≤ 30 KB gzip (idealmente 0 en páginas sin interacción) |
| JS de `/ecosystem`                  | ≤ 60 KB gzip                                           |
| TTFB (con caché caliente)           | ≤ 200 ms                                               |
| Respuesta del autocompletado        | ≤ 100 ms (p95)                                         |

**Tácticas:**

1. **HTML primero:** componentes `.astro` sin hidratar; islas con `client:visible` o `client:idle`; el buscador con `client:load` por ser la función principal.
2. **Datos precalculados:** un job tras cada sync calcula los agregados (KPIs, SLAs, árbol de objetivos) y los guarda en tablas/vistas materializadas; las páginas solo leen.
3. **Caché por capas:** caché de agregados precalculados en la BD (en un entorno serverless no hay memoria compartida entre instancias) + `ETag`/`Cache-Control: private, max-age` (nunca `public` para páginas con permisos); invalidación por evento de sync.
4. **Gráficos en SVG de servidor,** sin librerías de gráficos en el cliente.
5. **Fuentes:** sistema o una sola familia con `font-display: swap` y _preload_; sin bibliotecas de iconos (SVG en línea).
6. **Imágenes:** capturas servidas en WebP/AVIF con `width/height`, `loading="lazy"` salvo la principal, y una sola captura por sección.
7. **Compresión** Brotli en el proxy; HTTP/2 o 3.
8. **Índices de BD** para cada consulta de página; revisión con `EXPLAIN` en las 10 consultas más frecuentes.
9. **Presupuesto en CI:** el build falla si se supera el tamaño de JS definido.

---

## 13. Calidad, pruebas y CI/CD

| Nivel         | Qué cubre                                                                                                                                | Herramienta                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Unitarias     | `domain` completo (cálculo de SLA, % esfuerzo, impacto transitivo, búsqueda/puntuación, `AccessPolicy`)                                  | Vitest — cobertura ≥ 90 % en `domain` |
| Integración   | Repositorios con Postgres real (contenedor local de pruebas), clientes Jira/Crowdin contra _fakes_ o grabaciones, verificación de firmas | Vitest + Testcontainers               |
| Contrato      | Esquemas Zod contra respuestas reales anonimizadas de Jira/Crowdin                                                                       | Vitest                                |
| E2E           | Login, navegación por rol, búsqueda y sugerencias, recuadro rojo, administrador de roles, "ocultar no bloquear"                          | Playwright                            |
| Accesibilidad | Páginas clave                                                                                                                            | axe en Playwright (WCAG 2.1 AA)       |
| Rendimiento   | Presupuesto de la sección 12                                                                                                             | Lighthouse CI                         |
| Seguridad     | Sección 11.3                                                                                                                             | CodeQL/Semgrep, gitleaks, audit       |

**Pipeline (GitHub Actions):** instalar → lint → `astro check` → dependency-cruiser → unitarias → integración → build → e2e → Lighthouse → seguridad → publicar imagen. Ramas protegidas, revisión obligatoria, commits convencionales, _preview_ por PR, migraciones revisadas.

**Definición de terminado (por tarea):** código tipado, pruebas incluidas, sin avisos de lint, permisos declarados, registro de decisiones actualizado, sin regresión de presupuesto.

---

## 14. Operación y observabilidad

- Logs estructurados (JSON) con `request_id`; métricas: latencia, errores, cola de webhooks, antigüedad del último sync de Jira y de Crowdin.
- Página interna `/estado` (solo Líder): último sync, eventos fallidos, webhooks pendientes de renovar, cuota de API.
- Alertas: sync sin éxito > 30 min, webhooks con firma inválida, cola con retraso, errores 5xx.
- _Runbooks_ en `docs/runbooks`: re-sincronización completa, rotación de tokens, restauración de BD, reinstalar webhooks.
- Despliegue con migraciones automáticas y _rollback_ documentado; entornos dev/staging/prod.

---

## 15. Variables de entorno (tipadas con `astro:env`)

`DATABASE_URL`, `SESSION_SECRET`, `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, `ATLASSIAN_REDIRECT_URI`, `ALLOWED_EMAIL_DOMAIN=holafly.com`, `BOOTSTRAP_LEADER_EMAIL`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` (confirmar la clave exacta), `JIRA_WEBHOOK_SECRET`, `CROWDIN_TOKEN`, `CROWDIN_PROJECT_IDS=19,55`, `CROWDIN_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `INGEST_API_TOKEN`, `PUBLIC_APP_URL`. Se entrega un `.env.example` sin valores reales y la app **falla al arrancar** si falta o es inválida alguna variable requerida.

---

## 16. Fases y criterios de aceptación

| Fase                                   | Entregable                                                                                                                                                                                                                       | Criterios de aceptación                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Cimientos**                       | Repo, estructura de capas, CI, Astro configurado, esquema de BD, login con `@holafly.com`, sesiones, `AccessPolicy`, middleware de seguridad                                                                                     | Login solo con dominio válido; CI verde; dependency-cruiser activo; cabeceras de seguridad correctas; pruebas de autorización por defecto-deniega.                                            |
| **1. Jira + dashboard**                | Carga inicial, webhook, reconciliación, botón resincronizar, páginas del dashboard (exec, resumen, tareas, SLAs, incumplimientos, objetivos, capacidad, trimestres, aprendido, definiciones)                                     | Un cambio en Jira se refleja en < 1 min; webhook rechaza firmas inválidas; presupuesto de rendimiento cumplido; cifras coinciden con Jira en una muestra de 30 tickets.                       |
| **2. Roles + Ecosystem lectura**       | Administrador de roles, "ocultar no bloquear", importación desde Confluence (modo simulación + real), carga por archivos de datos, buscador con autocompletado, detalle con captura y recuadro (coordenadas manuales al inicio)  | Prueba 10.3 superada; importación reproducible con informe; búsqueda y sugerencias < 100 ms; navegación por teclado.                                                                          |
| **3. Detección asistida de recuadros** | Comando `ecosystem:detect` (OCR), informe de dudosos y no encontrados, carga de capturas por script                                                                                                                              | Meta a medir con una muestra de 30 campos: ≥ 80 % propuestos correctamente sin retoques; los dudosos y no encontrados aparecen siempre en el informe; carga idempotente y capturas validadas. |
| **4. Crowdin**                         | Webhook de Crowdin, bandeja "Llaves sin ubicar", detección de huecos, aviso de recaptura cuando cambia un texto                                                                                                                  | Cambio de texto fuente marca el campo como "revisar" en < 1 min y avisa de que la captura puede estar desactualizada; eventos duplicados no se reprocesan; reporte semanal de huecos.         |
| **5. Endurecimiento y lanzamiento**    | Revisión de seguridad completa (11.3), pruebas de carga, runbooks, formación                                                                                                                                                     | Lista 11.3 cerrada; sin hallazgos críticos/altos; plan de incidentes aprobado.                                                                                                                |
| **Futuro**                             | Editor de contenido del Ecosystem (alta guiada, subida de capturas, edición de recuadro y dependencias), captura automática de páginas, atributo de llave en el front, funciones programadas de Netlify como respaldo automático | Se decide con datos de uso real; el modelo y el permiso `action.ecoedit` ya existen.                                                                                                          |

---

## 17. Decisiones tomadas y pendientes

**Decisiones cerradas:**

| Tema                     | Decisión                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting                  | **Netlify** para todo, por ahora en el plan gratuito: Astro con `@astrojs/netlify`, Netlify DB (Postgres) y Netlify Blobs.                |
| Acceso                   | **Inicio de sesión con Atlassian.** Solo entran las personas **invitadas** por un Líder; el resto no puede ver el Hub.                    |
| Roles                    | Dos: **Colaborador** y **Líder**. Hoy solo Sebas es Líder.                                                                                |
| Permisos del Ecosistema  | Sobre el **módulo completo**; quien lo ve, ve todo su contenido.                                                                          |
| Actualización de datos   | Webhooks de Jira y Crowdin (cuando se creen en desarrollo) + **botón de resincronización** + reconciliación perezosa. Sin cron por ahora. |
| SLAs de Jira             | **Time to response** y **Time to done**.                                                                                                  |
| Crowdin                  | Dos proyectos **por archivos** (app 19, ecommerce 55), Enterprise (Team+), inglés como idioma fuente.                                     |
| Confluence               | Se exporta a **CSV una vez**; el Hub pasa a ser la **fuente de verdad**.                                                                  |
| Strapi                   | **No se lee**; solo guarda colección y enlace para ir a editar.                                                                           |
| Capturas                 | Las **sube Sebas** (páginas públicas, en inglés). Los recuadros los propone un OCR local y se revisan. Sin atributo de llave en el front. |
| Retención                | Valores por defecto de la sección 11.2.                                                                                                   |
| Contenido del Ecosistema | Lo carga Sebas; sin editor en v1.                                                                                                         |

**Pendientes (por orden de impacto):**

1. **Cuenta de Netlify.** Crear la cuenta del equipo, revisar los términos del plan gratuito y vigilar el consumo de créditos (300 al mes) durante el primer mes. Si hace falta más, pasar a un plan de pago no cambia el diseño.
2. **Atlassian:** crear la app OAuth 2.0 en la consola de desarrolladores y confirmar que el perfil devuelve el correo `@holafly.com` de todos los usuarios.
3. **Jira:** crear el webhook (o la regla de automatización) y el token de servicio al entrar a desarrollo; confirmar si admite secreto y la clave exacta del proyecto.
4. **Crowdin:** crear el token de lectura y los dos webhooks; confirmar los nombres de eventos por archivo y el mapeo archivo ↔ sección.
5. **Prueba del OCR:** antes de la fase 3, probar `detect` con 3 o 4 de tus capturas reales (PDP, Home, App) para confirmar la precisión esperada.

---

## 18. Mapa del mockup al producto

| En el mockup                                                               | En el producto                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Datos de ejemplo (331 tickets, fecha fija)                                 | Datos reales de Jira; fecha del servidor                                       |
| 3 roles y candados en páginas bloqueadas                                   | 2 roles; secciones sin acceso **ocultas**                                      |
| Un solo HTML con enrutamiento por hash                                     | Rutas Astro reales con permisos en servidor                                    |
| Ecosystem con 18 secciones / 33 campos sembrados                           | Datos importados y mantenidos según la sección 8                               |
| Captura PDP embebida en base64                                             | Capturas subidas por Sebas con el script de carga y servidas con autenticación |
| Recuadros con coordenadas fijas en los datos                               | Recuadros propuestos por OCR y revisados (manual como respaldo)                |
| Redibujar el recuadro arrastrando                                          | Fuera de v1; entra con el editor futuro                                        |
| Búsqueda en el navegador                                                   | Búsqueda en servidor con filtrado por permisos                                 |
| Paleta: coral `#e6485c`, violeta, aqua, amarillo, verde; tema claro/oscuro | Mantener tokens de diseño en un único archivo CSS de variables                 |
