# Mapeo de Jira (proyecto JSMCO)

Generado el 2026-11-11 con `pnpm probe:jira` (solo lectura) más consultas puntuales. Es el insumo del
paso 1.0 de la Fase 1 (SDD §6.3). Los ids de campos personalizados se leen de configuración, nunca
van quemados en el código. Las respuestas crudas están en `.data/jira-probe/` (ignorado por git) y se
anonimizan antes de convertirse en pruebas de contrato (paso 1.5).

## Proyecto

| Dato                       | Valor real                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Clave (`JIRA_PROJECT_KEY`) | `JSMCO` (el SDD decía `JSM-CONTENT`, que es el nombre)                               |
| Nombre                     | `JSM--CONTENT`                                                                       |
| Tipo                       | Service Desk (`service_desk`, next-gen). Service Desk id `306`                       |
| Tickets                    | 1.046 (991 en categoría Hecho, 55 abiertos); 381 actualizados en los últimos 30 días |
| Credenciales               | `GET /myself` → 200; la cuenta puede leer el proyecto y **leer SLAs**                |

## Estados

No coinciden con los del SDD (Por hacer / En progreso / En revisión / Hecho). Hay siete, y la
categoría de estado de Jira es la que debe usar el dominio para agrupar.

| Estado              | Categoría de Jira | Aparece en                     |
| ------------------- | ----------------- | ------------------------------ |
| To Do               | `new`             | Todos los tipos                |
| In progress         | `indeterminate`   | Todos los tipos                |
| PENDING APPROVAL    | `indeterminate`   | Todos los tipos                |
| PENDING DEPLOY      | `indeterminate`   | Todos menos "New Landing page" |
| Pending             | `indeterminate`   | La mayoría                     |
| Pending translation | `indeterminate`   | Launch New Content, UX Writing |
| Done                | `done`            | Todos los tipos                |

Consecuencia: "En progreso" del SDD (% de esfuerzo ponderado por tiempo) **no es un solo estado**.
Hay que decidir cuáles cuentan como trabajo activo (D-040).

## Tipos de incidencia = tipos de solicitud

El tipo de incidencia coincide con el tipo de solicitud del portal. Los campos `Request Type`
(`customfield_10010`, `customfield_11846`) vienen **vacíos** en los tickets recientes, así que
`request_type` se toma de `issuetype.name`.

- Email request
- Launch New Content
- UX Writing for Features
- Edit or Change Content (Characteristics, Content)
- Translate Marketing Materials
- Launch a New Language
- New Landing page Request
- Translate Marketing Materials - Moi - DON'T USE (tipo obsoleto; se excluye o se marca)

## SLAs

| Métrica del SDD  | Nombre real en Jira        | Campo               |
| ---------------- | -------------------------- | ------------------- |
| Time to response | **Time to first response** | `customfield_10062` |
| Time to done     | Time to done               | `customfield_10152` |

**Hallazgo clave:** estos campos (tipo `sd-servicelevelagreement`) **vienen dentro de la búsqueda
JQL** con `fields=customfield_10062,customfield_10152`. No hace falta una llamada a
`/rest/servicedeskapi/request/{key}/sla` por ticket. La carga inicial son unas 11 páginas de 100
tickets, no 1.046 llamadas (D-039).

Estructura de cada ciclo (completado en `completedCycles[]`, en curso en `ongoingCycle`):

```
startTime / stopTime / breachTime  { iso8601, jira, friendly, epochMillis }
breached                           boolean
goalDuration / elapsedTime / remainingTime  { millis, friendly }
```

Se guardan `startTime`, `stopTime`, `breachTime`, `goalDuration`, `elapsedTime` y `breached`; el
incumplimiento de un ciclo abierto se calcula al leer comparando `breachTime` con la hora actual (D-038).
El endpoint de Service Desk queda como respaldo si algún ticket no trae el campo.

## Relaciones y objetivos (hallazgo que bloquea `/objetivos`)

| Dato                                        | Resultado                   |
| ------------------------------------------- | --------------------------- |
| Épicas dentro de JSMCO                      | **0**                       |
| Tickets con `parent`                        | **0**                       |
| Tickets con Epic Link (`customfield_10014`) | **0**                       |
| Tickets con Goals (`customfield_10031`)     | **0**                       |
| Tickets con `issuelinks`                    | 252 de 1.046                |
| Épicas en otros proyectos de Jira           | 1.118 (por ejemplo SB, MIG) |

Los tickets de JSMCO **no cuelgan de épicas**. Los enlaces existentes son de tipo "is idea for"
(hacia historias de `CONT`), "is blocked by" (desde `JSMIT`), "blocks" y "relates to" (hacia `SB`,
`PLAT`, `CC`). Por tanto el árbol "compañía → marketing → épica de equipo → tickets" (§5, §4.1
`objective`) **no se puede derivar de Jira tal como está**. Hay que decidir de dónde sale (D-041).

## Otros campos útiles

| Campo                        | Id                  | Notas                                                                             |
| ---------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| Asignado                     | `assignee`          | 1.001 de 1.046 tienen asignado. Se guarda id y nombre                             |
| Solicitante                  | `reporter`          | Cuenta de Atlassian de la empresa. Se guarda id y nombre, nunca el correo (D-045) |
| Etiquetas                    | `labels`            | Solo 34 tickets las usan                                                          |
| Prioridad                    | `priority`          |                                                                                   |
| holafly_managed_content_team | `customfield_12447` | Equipo del contenido (por ejemplo "Pink"); opcional                               |
| holafly_managed_data_quarter | `customfield_13863` | Trimestre; vacío en la muestra, no fiarse                                         |
| Story points                 | varios ids          | No se usan en el Hub                                                              |

El historial de estados se obtiene con `expand=changelog` dentro de la misma búsqueda (las
transiciones aparecen como ítems de campo `status` con `fromString` / `toString`). Si un ticket
supera la página de historial incluida, se pide el resto con `GET /issue/{key}/changelog`.

## Paginación y volumen

`POST /rest/api/3/search/jql` con `maxResults` y `nextPageToken`; el conteo aproximado sale de
`POST /rest/api/3/search/approximate-count`. El sync incremental esperado (381 tickets en 30 días)
cabe en pocas páginas.

## Cómo calcula Jira los SLAs (configuración real, 2026-11-11)

El Hub **no recalcula** los SLAs: usa lo que Jira ya calculó (`breached`, `breachTime`, `paused`).
Jira aplica el calendario y las pausas; replicarlo en el Hub sería frágil.

| Aspecto    | Time to done                                                 | Time to first response         |
| ---------- | ------------------------------------------------------------ | ------------------------------ |
| Meta       | 160 h (20 días laborables de 8 h)                            | 16 h                           |
| Calendario | "Sample 9-5 Calendar"                                        | "Sample 9-5 Calendar"          |
| Empieza    | Entra a la categoría de estado In Progress                   | Incidencia creada              |
| Pausa      | PENDING APPROVAL, PENDING DEPLOY, Pending translation, To Do | **Due Date: Not Set**          |
| Termina    | Entra a la categoría de estado Done                          | Comentario dirigido a clientes |
| Reapertura | Genera un nuevo ciclo (49 tickets tienen más de uno)         | Un solo ciclo                  |

Observaciones a revisar con el equipo (no cambian el diseño del Hub):

- **Pending no pausa** el reloj de Time to done, pero To Do y Pending translation sí. Es una decisión del
  equipo y es distinta de D-040 (que mide esfuerzo, no SLA).
- **Time to first response se pausa cuando no hay fecha de vencimiento.** En 53 de los 55 tickets abiertos
  el reloj está pausado. Probablemente es un efecto no buscado de la regla, y hace que esta métrica
  se vea mejor o peor de lo real según el caso.
- Ambos usan el calendario de ejemplo "Sample 9-5": confirmar que es el horario y la zona horaria reales.

### Cumplimiento medido sobre los 1.046 tickets

| Métrica                | Ciclos completados | Incumplidos | Cumplimiento |
| ---------------------- | ------------------ | ----------- | ------------ |
| Time to first response | 991                | 152         | **84,7 %**   |
| Time to done           | 1.022              | 97          | **90,5 %**   |
| Combinado (ambos)      | 2.013              | 249         | **87,6 %**   |

Ciclos en curso: 55 (response, 53 pausados) y 49 (done, 17 pausados). Cada ciclo en curso trae
`startTime`, `breachTime`, `breached`, `paused`, `withinCalendarHours`, `goalDuration`, `elapsedTime`
y `remainingTime`.

## Fecha de resolución (hallazgo del 2026-11-12)

En este flujo de trabajo los tickets pasan a Hecho **sin rellenar el campo "Resolución"**: en los
tickets en Hecho, `resolutiondate` y `resolution` vienen siempre vacíos. El Hub usa en su lugar
`statuscategorychangedate` (el momento en que el ticket entró en la categoría Hecho), y solo si el
ticket sigue en Hecho; un ticket reabierto no tiene fecha de fin. Si algún día Jira rellena
`resolutiondate`, se usa esa. Tras cambiar esta regla hay que hacer una carga completa
(`pnpm sync:jira --full`) para recalcular los tickets ya guardados.
