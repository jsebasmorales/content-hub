# Plan de rediseño visual con Stitch

Estado: **plan aprobado. Fases A y B hechas; en la Fase C van `/resumen`, `/tareas`, `/sla` e `/incumplimientos`.** Las decisiones tomadas al aprobar y los desvíos del plan están en `docs/DECISIONES.md` (D-067 a D-072).
Alcance: solo la capa de presentación (`src/presentation`). No cambian consultas, cálculos, endpoints, esquema, roles ni permisos.

---

## 0. Resultado de la verificación (Paso 0)

### 0.1 El MCP de Stitch responde

Proyecto **Content Hub Dashboard Redesign** (`projects/14446170521611475380`, móvil en la ficha, claro). Pantallas:

| Pantalla                                        | Tipo      | Qué se pudo descargar                          |
| ----------------------------------------------- | --------- | ---------------------------------------------- |
| `DESIGN.md`                                     | documento | Texto completo (la versión larga con §1–§13)   |
| `Resumen ejecutivo · Content Hub` (2560 × 4628) | diseño    | HTML completo e imagen                         |
| `resumen_ejecutivo.png`                         | imagen    | solo captura                                   |
| `diseño_actual_a_mejorar.png`                   | imagen    | solo captura (el diseño actual, de referencia) |

Solo existe **una** pantalla de diseño: el Resumen ejecutivo. Las otras nueve páginas hay que derivarlas del DESIGN.md (§9) o pedirlas a Stitch.

### 0.2 Hay dos DESIGN.md distintos

| Archivo                                          | Contenido                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/DESIGN.md` del repo (sin versionar)        | Formato YAML + 8 secciones de prosa (176 líneas). Es el "design system" que exporta Stitch (`Volare Content Hub`).                                           |
| Documento `DESIGN.md` dentro del proyecto Stitch | Versión larga con §1–§13, etiquetas **[Volare]** / **[Proposed]**, paleta de gráficos (§8), patrones de página (§9), accesibilidad (§10) y tokens CSS (§12). |

Tu encargo cita §8, §9, §10, §12 y las etiquetas [Volare]/[Proposed]. **Esas partes solo existen en la versión de Stitch**, no en `docs/DESIGN.md`.

Diferencias que importan:

| Tema                    | `docs/DESIGN.md` (repo)               | DESIGN.md de Stitch (largo)                                                      |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| Modo oscuro             | No existe ("el claro es el canónico") | Valores propuestos (§2.6)                                                        |
| Paleta de gráficos      | No existe                             | Magenta 400, Blue 400 `#327DF0`, Amber 400, Green 500, Purple 300, Baby blue 500 |
| Navegación móvil        | Overlay por debajo de **1024 px**     | Tira de iconos a 1024 px y overlay por debajo de **768 px**                      |
| Escala de radios        | `xl = 1.5rem`, sin `2xl`              | `xl = 20`, `2xl = 24`, `3xl = 32`                                                |
| Escala de espaciado     | Hasta `space-6xl` (64)                | Hasta `7xl` (80)                                                                 |
| Accesibilidad, patrones | No                                    | §9 y §10                                                                         |
| Grupos del menú         | No                                    | "Resumen, Content Ecosystem, Trabajo, Objetivos, Referencia, Administración"     |

Los valores comunes (colores, tipografía, radios de botón/tarjeta, elevación) coinciden.

**Propuesta:** usar la versión larga de Stitch como fuente de verdad y guardarla como `docs/DESIGN.md`, reemplazando la del repo (que quedaría como subconjunto). No lo hago sin tu OK porque `docs/DESIGN.md` es un archivo tuyo sin versionar.

### 0.3 La pantalla aprobada contradice el DESIGN.md en seis puntos

Se tratan como **referencia visual, no como especificación**. El DESIGN.md manda; en cada caso propongo qué hacer:

| #   | La pantalla de Stitch                                                                            | Regla que incumple                                                         | Qué haré                                                |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Candado junto a "Permisos" en el menú                                                            | DESIGN §11, SDD §10.3 (ocultar sin candados)                               | No se reproduce. Sin acceso, el elemento no existe.     |
| 2   | Mayúsculas: `TIPO DE SOLICITUD`, `RANGO DE FECHAS`, `RESUMEN`, `TOTAL: 149 TICKETS`, `SIGUIENTE` | DESIGN §3 "sin mayúsculas"                                                 | Todo en minúsculas de frase.                            |
| 3   | Tailwind por CDN, Google Fonts, Material Symbols                                                 | SDD §12 (sin librerías de iconos, fuente propia), CSP `default-src 'self'` | Mulish alojada, iconos SVG en línea, CSS propio.        |
| 4   | Textos de 11 px                                                                                  | Mínimo 12 px en la escala                                                  | Se sube a 12 px (`label-header`).                       |
| 5   | Segunda serie del gráfico en `#2065CE` (Blue 500)                                                | DESIGN §8 pide Blue 400 `#327DF0`                                          | Se usa §8. Si prefieres el azul de la pantalla, dímelo. |
| 6   | Entradas "Configuración" y "Ayuda" en el pie del menú, y un punto verde con `animate-pulse`      | No existen rutas; animación decorativa (§10)                               | Se omiten (anotado como pendiente).                     |

### 0.4 Estado actual de la presentación y qué se reutiliza

| Pieza                                 | Hoy                                                                                                                                                             | Reutilizable                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `styles/tokens.css` (80 líneas)       | Paleta cálida propia (`#f9f9f7`, `#e6485c`, violeta de foco), fuente del sistema, radio 10 px. El oscuro está escrito **dos veces** (data-theme y media query). | Se reescribe entero. Se conserva el mecanismo `data-theme` + `prefers-color-scheme`.                       |
| `styles/base.css` (1036 líneas)       | CSS global con clases (`.card`, `.kpi-grid`, `.chip`, `.btn`, `.bar-row`...). Solo 2 colores escritos a mano; el resto usa variables.                           | La estructura de clases es buena base. Se migran los nombres de variable.                                  |
| `layouts/BaseLayout.astro`            | Sidebar + columna con TopBar + `<main>`; ya lee el tema de la cookie.                                                                                           | Se conserva el contrato; cambia el marcado interior.                                                       |
| `AppSidebar`, `TopBar`, `ThemeToggle` | Menú plano sin iconos ni grupos; perfil con zona horaria; selector de tema; cierre de sesión. Todo con formularios, **sin JS**.                                 | Se mantiene la función. Zona horaria y tema **no están en el diseño de Stitch**: hay que darles sitio.     |
| 21 componentes `.astro`               | KpiCard, SlaMeter, VolumeChart, ComplianceChart, LoadBars, RequestTypeBars, PeriodPicker, InfoTip, tablas...                                                    | Se refactorizan; sus props y datos no cambian.                                                             |
| Patrones móviles existentes           | `.chart-scroll` (gráfico con scroll lateral), `.only-narrow` (tabla → lista con "Ver más"), objetivos de toque grandes.                                         | **Se conservan** (regla del proyecto: toda página debe leerse bien en el teléfono).                        |
| Seguridad / CSP                       | `default-src 'self'`, CSS siempre en archivo (`inlineStylesheets: 'never'`), sin script inline salvo hash.                                                      | Condiciona la fuente, los iconos y la navegación móvil.                                                    |
| Rendimiento (hoy)                     | **0 KB de JS.** CSS propio: 18 KB sin comprimir, **4,8 KB gzip** (tokens 0,8 + base 4,0).                                                                       | Es la línea base de CSS. LCP y JS se miden con `pnpm perf` antes de tocar nada (primer paso de la Fase A). |

---

## 1. Tokens → variables CSS y tema claro/oscuro

**Dos capas en `styles/tokens.css`**, tal como la §12 del DESIGN.md:

1. **Primitivas Volare** (`--magenta-400`, `--neutral-300`, `--blue-500`, `--space-2xl`, `--radius-l`...). Solo se usan dentro de `tokens.css`.
2. **Capa semántica** (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--link`, `--focus`, `--shadow-float`, `--shadow-modal`, `--success-*`, `--warning-*`, `--error-*`, `--info-*`, `--chart-1..6`). **Los componentes solo usan esta capa.**

**Claro/oscuro sin duplicar valores:** cada token semántico se escribe una sola vez con `light-dark(claro, oscuro)` y el tema se elige con `color-scheme` (`:root[data-theme='light']`, `[data-theme='dark']`, y `light dark` por defecto para seguir al dispositivo). Esto elimina el bloque duplicado actual. Compatible con Chrome 123, Safari 17.5 y Firefox 120; para un equipo interno de 5–15 personas es aceptable. _Decisión D-067 propuesta._

**Los valores oscuros son [Proposed]** (§2.6). Antes de usarlos calcularé el contraste de cada par y ajustaré solo si alguno no llega a 4,5:1 (texto) o 3:1 (gráficos), dejándolo anotado.

**Sin colores, radios ni sombras a mano.** Se añade `scripts/check-tokens.mjs` (se ejecuta en `pnpm lint`, o como paso de CI): falla si encuentra un hex, `rgb(`, `px` de radio o `box-shadow` literal fuera de `tokens.css`. Hoy hay 2 colores literales en `base.css` y 0 en los `.astro`, así que el punto de partida es limpio.

**Reglas del DESIGN.md que se vuelven variables o clases:** foco = anillo de 2 px `--focus` con 2 px de separación; degradado solo en el botón primario; sombras solo en capas flotantes; `font-variant-numeric: tabular-nums` en cifras.

## 2. Fuente

- **Mulish** variable (eje de peso 300–600), subconjunto **latino** (cubre tildes, ñ, ¿, ¡), formato **woff2**, **alojada en `public/fonts/`** (el CSP no permite Google Fonts).
- `@font-face` con `font-display: swap`, `<link rel="preload" as="font" crossorigin>` en el layout (SDD §12 táctica 5) y una fuente de respaldo con `size-adjust`/`ascent-override` para no pasar de **CLS 0,05**.
- Pesos usados: 300 (cifras), 400 (texto), 600 (cabeceras, chips). Nunca 700.
- Peso esperado: el woff2 variable latino de Mulish ronda los 30–50 KB; **se mide al descargarlo** y se compara con el presupuesto (LCP ≤ 1,5 s). Si pesa demasiado, plan B: dos o tres pesos estáticos o un subconjunto reducido.
- Pendiente de comprobar en la Fase A: que Mulish incluya la característica `tnum` (cifras tabulares). Si no, las cifras alinean con un respaldo y se anota.
- Evitar caracteres fuera del subconjunto (la pantalla usa `▲`; se sustituye por un icono SVG).
- Licencia: Mulish es OFL; se añade el texto de la licencia junto al archivo.

## 3. Componentes de presentación

Todos viven en `src/presentation/components/` (la regla de capas del SDD: `presentation → application → domain`; nada de aquí lo importan las otras capas, dependency-cruiser lo comprueba). Ninguno recibe consultas ni permisos nuevos: reciben las mismas props que hoy.

| Componente                                   | Acción                               | Notas                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell` (dentro de `BaseLayout`)          | Refactor                             | Riel de 248 px fijo, barra superior de 64 px, contenido máx. 1200 px, rejilla de 12 columnas.                                                                                            |
| `SideNav` (hoy `AppSidebar`)                 | Refactor                             | Iconos SVG y grupos. Un grupo sin elementos visibles **no se dibuja ni su título** (si no, revelaría que existe). 248 px ≥1440, 72 px solo iconos 1024–1439, panel superpuesto en móvil. |
| `TopBar`                                     | Refactor                             | Título de página, "Datos al ‹hora›", botón "Resincronizar con Jira" (solo con `action.sync`), menú de usuario con zona horaria, tema y cerrar sesión.                                    |
| `Icon`                                       | Nuevo                                | ~20 iconos SVG en línea, trazo 1,5 px, 20 px (16 px en chips y tablas). Sin librería ni fuente de iconos.                                                                                |
| `PageHeader`                                 | Nuevo                                | Título h1, propósito en una línea, acción secundaria ("Cómo se calcula" → `/definiciones`).                                                                                              |
| `KpiCard`                                    | Refactor                             | Etiqueta + ⓘ, cifra 56/64 (hero) o 40/48 (secundaria), delta con icono y texto, chip de estado. Mismas props más variante.                                                               |
| `SlaCard` (hoy `SlaMeter`)                   | Refactor                             | Cifra grande, barra con marca al 90 % y etiqueta "Meta 90 %", chip "Cumple la meta".                                                                                                     |
| `ChartCard` + `ProgressBar` + `BarList`      | Nuevo / refactor                     | Título, subtítulo, gráfico, leyenda con etiquetas directas, pie con la fecha de corte. `RequestTypeBars` pasa a `BarList`.                                                               |
| `DataTable`                                  | Refactor de las tablas actuales      | Cabecera fija de 40 px, filas de 48 px, cifras a la derecha, clave de ticket como enlace. Se mantiene "tabla en pantalla ancha, lista con Ver más en móvil".                             |
| `Chip` / `StatusChip`                        | Nuevo (+ refactor de `.badge`)       | Píldora de 24 px con icono de 16 px y texto: nunca solo color.                                                                                                                           |
| `FilterBar`                                  | Refactor de `PeriodPicker` + filtros | Una fila de chips y selects compactos; "Limpiar". Los selects siguen siendo formularios GET (sin JS).                                                                                    |
| `Tooltip` (hoy `InfoTip`)                    | Refactor                             | 8 px de radio, máx. 280 px, al pasar el ratón y al enfocar con teclado, sin JS.                                                                                                          |
| `EmptyState`                                 | Nuevo                                | Icono, título, ayuda y una acción.                                                                                                                                                       |
| `InsightCard`                                | Nuevo, **bloqueado**                 | Ver §7: no hay fuente de datos.                                                                                                                                                          |
| `Skeleton`                                   | **No se crea ahora**                 | Las páginas se renderizan completas en servidor y el sync corre aparte; no hay estado de carga en el cliente. Se reevalúa si aparece una isla.                                           |
| `ObjectiveTree`                              | **No aplica**                        | La página "Objetivos" no existe en la Fase 1.                                                                                                                                            |
| `LoadBars`, `VolumeChart`, `ComplianceChart` | Refactor visual                      | Solo paleta, tipografía y rejilla (ver §4).                                                                                                                                              |

**Menú con grupos e iconos:** se añaden `menuGroup` y `menuIcon` a `RouteDefinition` en `presentation/routes.ts` (es presentación; el permiso de cada ruta no cambia). Agrupación propuesta, la de la pantalla aprobada: _Resumen_ (Resumen ejecutivo, Resumen), _Trabajo_ (Tareas, SLAs, SLAs incumplidos), _Impacto y planeación_ (Capacidad, Trimestre a trimestre, Lo aprendido), _Ayuda y ajustes_ (Definiciones, Estado, Permisos).

**Navegación móvil sin JS:** el panel superpuesto usa el atributo `popover` del navegador (cierra con Esc y al pulsar fuera, sin script). Mantiene los **0 KB de JS** y respeta el CSP. Si en las pruebas de teclado y lector de pantalla no basta, plan B: un script de menos de 1 KB con hash.

## 4. Gráficos

- **SVG renderizado en servidor** (como hoy, SDD §2 y §12). Sin librerías.
- Paleta del DESIGN.md §8, en este orden: `--chart-1` Magenta 400, `--chart-2` Blue 400, `--chart-3` Amber 400, `--chart-4` Green 500, `--chart-5` Purple 300, `--chart-6` Baby blue 500; más de seis series se agrupan en "Otros" (neutral 400).
- Rejilla: líneas horizontales de 1 px `--border`; ejes en 12 px `--text-muted`. Objetivo del 90 %: línea discontinua con etiqueta.
- Sin significado solo por color: etiquetas directas y marcadores. Cada gráfico conserva (o recibe) **alternativa textual**: hoy `VolumeChart` ya usa `<figure>`/`<figcaption>`; se revisa que los demás lo tengan y que haya una frase resumen o tabla.
- Los gráficos con muchas columnas conservan el desplazamiento lateral en móvil (`.chart-scroll`).
- Fundido de 200 ms al cargar, opcional y con `prefers-reduced-motion` respetado.

## 5. Orden de trabajo y verificación visual

**Fase A. Fundaciones** — tokens, fuente, `AppShell`, `SideNav`, `TopBar`, `Icon` y componentes base (`KpiCard`, `Chip`, `ChartCard`, `DataTable`, `FilterBar`, `Tooltip`, `EmptyState`). Antes de empezar: capturas y mediciones "antes".
**Fase B. Resumen ejecutivo (`/`)** — reproducir la pantalla aprobada con datos reales. **Parada obligatoria:** te enseño las capturas antes de seguir.
**Fase C. Resto, una por una**, en este orden (de más a menos cercana al Resumen ejecutivo): `/resumen`, `/tareas`, `/sla`, `/incumplimientos`, `/capacidad`, `/trimestres`, `/aprendido`, `/definiciones`, `/estado`, `/permisos`. `/login` hereda tokens y se ajusta al final (no estaba en tu lista; lo incluyo porque cambia con los tokens).

**Verificación visual**

- Script `scripts/capture-pages.mjs` con Playwright (ya está en el proyecto): cada página a **1440 px y 1024 px**, tema **claro y oscuro** = 4 capturas por página. Añado **390 px** (teléfono) porque es una regla del proyecto, sin que cuente como parte de tu matriz.
- Las capturas "antes" se toman **una vez, antes de la Fase A**, con los mismos datos que las "después".
- Datos para las capturas: un arranque local con el Jira simulado y los datos de ejemplo anonimizados que ya existen en `tests/fixtures`. **Está por confirmar** que se pueda sembrar con la cantidad de datos suficiente; si no, uso la base local con datos reales solo en mi máquina y las capturas no se suben al repositorio.
- Las capturas no se versionan (`.design-captures/` en `.gitignore`); solo se versionan las aprobadas, si lo quieres.
- Pruebas visuales automáticas: el proyecto **no tiene** hoy comparación de capturas. Reutilizo lo que sí existe: el e2e `hide-not-block` (ocultar sin candados) y axe/Lighthouse mediante `pnpm perf`. No añado una herramienta nueva de regresión visual sin tu OK.

**Puerta de cierre de cada fase:** `pnpm lint`, `pnpm check`, `pnpm arch`, `pnpm test`, `pnpm e2e`, `pnpm format:check` y `pnpm perf` (JS ≤ 30 KB gzip, LCP ≤ 1,5 s, CLS ≤ 0,05, accesibilidad ≥ 0,95), más `check-tokens`. Reporto CSS y JS antes/después. Al terminar, la skill `quality-gate` (revisión de código y documentación).

## 6. Riesgos y decisiones D-0xx a registrar

| Riesgo                                                                  | Mitigación                                                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| La fuente supera el presupuesto de LCP/CLS                              | Medir en la Fase A; plan B de pesos estáticos; respaldo con métricas ajustadas.                                                          |
| `light-dark()` no soportado en algún navegador del equipo               | Comprobar versiones; si hace falta, volver a dos bloques de variables.                                                                   |
| Un grupo del menú vacío revela una sección oculta                       | Prueba e2e nueva: perfil sin `section.*` de un grupo no ve su título (ampliar `hide-not-block`).                                         |
| Tira de iconos a 1024 px: elementos sin texto visible                   | `aria-label` + tooltip en foco y hover; probar con teclado.                                                                              |
| Se pierde el selector de tema o la zona horaria (no están en el diseño) | Se alojan en el menú de usuario de la barra superior.                                                                                    |
| Copiar la pantalla de Stitch trae sus incumplimientos (§0.3)            | Se trata como referencia visual; la revisión de cierre (`impeccable-finish-reviewer` o `quality-gate`) los contrasta con el DESIGN.md.   |
| Modo oscuro sin diseño aprobado                                         | Es [Proposed]; se verifica contraste y se muestra en las capturas de la Fase B.                                                          |
| Cambiar los nombres de variables rompe estilos sin darnos cuenta        | Capa de compatibilidad temporal en las Fases A–B (`--ink` → `--text`...), eliminada al cerrar la Fase C y comprobada con `check-tokens`. |

**Decisiones a registrar en `docs/DECISIONES.md` (numeración tentativa, siguiente libre D-067):**

- **D-067** Sistema visual Volare: tokens en dos capas, `light-dark()`, `check-tokens`.
- **D-068** Mulish alojada, variable, latina; presupuesto de peso y plan B.
- **D-069** Iconos SVG en línea (sin fuente de iconos Volare) hasta recibir el paquete aprobado.
- **D-070** Navegación: grupos e iconos en el registro de rutas; grupos vacíos no se dibujan; panel móvil con `popover` sin JS.
- **D-071** Gráficos SVG de servidor con la paleta §8 y alternativa textual obligatoria.
- **D-072** Elementos del diseño sin fuente de datos (ver §7) y su resolución.

Además se actualizan: SDD §12 (fuentes: de "sistema o una familia" a "Mulish alojada"), §18 (mapa del mockup) y `docs/ARQUITECTURA.md` si describe los estilos.

---

## 7. Elementos del diseño sin fuente de datos (pendientes de tu decisión)

| Elemento de la pantalla aprobada                                     | ¿Hay dato real?                                                                                                                                                            | Propuesta                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Puntos de atención** ("El backlog crece...")                       | **No.** El caso de uso del resumen ejecutivo no calcula alertas. Derivarlas (creados > resueltos) sería lógica nueva en dominio.                                           | Se deja fuera. Si lo quieres, es un cambio de dominio aparte, con pruebas.                      |
| **Mensaje del líder**                                                | **Parcial.** "Lo aprendido" guarda texto del Líder por trimestre, pero ese permiso (`section.learn`) no es el del resumen ejecutivo; mostrarlo ahí cambiaría quién ve qué. | Se deja fuera. No se mezcla con la página del Líder sin tu decisión.                            |
| Filtro "Tipo de solicitud" y rango de fechas en el Resumen ejecutivo | **No.** El resumen ejecutivo es siempre "trimestre actual vs anterior"; los filtros existen en `/resumen`, no en `/`.                                                      | Se deja fuera de `/`. Los chips de periodo y el selector de tipo se aplican en `/resumen`.      |
| Chip "Cumple la meta · meta 90 %"                                    | **Sí** (`sla.goalMet` y la meta por métrica).                                                                                                                              | Se implementa. Si `goalMet` es `null`, chip neutro "Sin datos suficientes".                     |
| Delta "frente a T3 2026 (mismos 43 días)"                            | **Sí** (`describeChange`).                                                                                                                                                 | Se implementa con icono y texto.                                                                |
| Pie "Siguiente: Resumen"                                             | **Sí**, derivable del menú visible del usuario.                                                                                                                            | Se implementa solo con páginas visibles para esa persona.                                       |
| Insignia "Líder" y "Colombia · Bogotá" junto al usuario              | **Sí** (`principal.user.role.name`, zona horaria).                                                                                                                         | Se implementa en el menú de usuario.                                                            |
| "Configuración", "Ayuda"                                             | **No hay rutas.**                                                                                                                                                          | Se omiten.                                                                                      |
| "Hora de la última actualización" y botón de sincronizar en la barra | **Sí**, pero hoy lo pinta `SyncPanel` dentro de cada página. Pasar el estado a la barra implica que cada página lo entregue al layout.                                     | Propuesta: cada página pasa `sync` al layout (ya lo calcula). Sin consultas nuevas. Confírmalo. |

---

## 8. Revisión de datos (solo reporte, sin cambios)

**Fila "Launch New Content": 2 creados, 5 completados, 0 % completadas.** Revisé el código (`src/domain/jira/summary-report.ts`):

- **Creados** = tickets con fecha de creación dentro del periodo.
- **Completados** = tickets cuya fecha de resolución cae dentro del periodo, **sin importar cuándo se crearon**.
- **% completadas** = de los tickets **creados en el periodo**, cuántos están completados **hoy**: `createdAndCompleted / created` (en la fila y en el KPI global, con la misma fórmula y un decimal).

Por tanto, **no es un error de cálculo**: los 5 completados salieron del trabajo de periodos anteriores, y los 2 creados siguen abiertos, de ahí el 0 %. El KPI global de 74,5 % usa la misma fórmula (`createdAndCompleted / created`).

**Sí hay una inconsistencia de lectura:** dos columnas con poblaciones distintas conviven en la misma fila, y "5 completados con 0 %" parece contradictorio. La explicación está en el tooltip del KPI, pero no en la tabla. Otras dos notas:

1. Los tipos obsoletos se excluyen de la tabla pero **no de los totales**, así que la suma de la tabla puede no coincidir con el KPI.
2. Un ticket creado en el periodo y completado después cuenta como completado "hoy", por lo que el porcentaje de un periodo reciente sube con el tiempo (el tooltip ya lo dice).

Limitación: lo comprobé leyendo el código y las definiciones, **no ejecutándolo contra tus datos reales**. Para confirmar que 2/5/0 % corresponde a esa explicación hay que revisar los tickets de ese tipo (un recuento independiente, como el de D-063).

Opciones, para que elijas (ninguna se aplica sin tu OK): (a) dejarlo y aclarar la cabecera de la columna; (b) renombrar "% completadas" a "% de lo creado ya completado"; (c) mostrar "Completados de los creados" como una columna aparte de "Completados en el periodo".

---

## 9. Qué necesito de ti para empezar la Fase A

1. ¿Aprobado usar el DESIGN.md largo de Stitch como fuente de verdad y guardarlo en `docs/DESIGN.md`?
2. Breakpoint de la navegación móvil: 768 px (versión larga) o 1024 px (versión del repo).
3. Segunda serie del gráfico: Blue 400 `#327DF0` (§8) o Blue 500 `#2065CE` (pantalla).
4. Elementos de la §7: confirmar que "Puntos de atención", "Mensaje del líder" y los filtros del resumen ejecutivo quedan fuera.
5. Confirmar que el estado de sincronización se pasa por página al layout.
6. Qué hacer con la fila de "Launch New Content" (a, b, c o nada).

---

## 10. Estado de la ejecución

**Decisiones de la aprobación:** DESIGN.md largo como fuente (el corto queda en `docs/DESIGN.stitch-corto.md`); tira de iconos entre 768 y 1439 px y panel por debajo de 768 px; segunda serie Blue 400; "Puntos de atención", "Mensaje del líder" y filtros del resumen ejecutivo fuera (D-072); `sync` por página al layout; la fila "Launch New Content" se aclara en `/resumen` y en Definiciones sin tocar fórmulas (Fase C).

**Hecho:**

- **Fases A y B:** tokens y puerta de diseño, Mulish alojada, iconos SVG, marco (navegación, barra superior, menú de la persona), componentes base y el Resumen ejecutivo con datos reales.
- **Fase C, casi completa** (decisiones registradas en `docs/DECISIONES.md`): `/resumen` (D-073), `/tareas`, `/sla` y `/incumplimientos` (D-074), `/capacidad`, `/trimestres` y `/definiciones` (D-075), `/estado` y `/permisos` (D-076).
- **Puerta de cierre (2026-11-13):** `lint`, `check`, `arch`, `test` (863 pruebas), `e2e` (8), `format:check` y `check:design` pasan. `perf` cumple JS (0 KB), accesibilidad (100) y CLS (0), pero **el LCP supera 1500 ms en 5 páginas** (`/tareas` 1963, `/sla` 1811, `/incumplimientos` 1660, `/estado` 1659 y `/capacidad` 1562 ms) medido sobre el servidor de desarrollo. Es el hallazgo ya descrito en D-074 y D-076 y sigue sin medirse sobre una compilación de producción.

**Desvíos del plan:** se añadió `scripts/check-design.mjs` en lugar de `check-tokens.mjs` (hace además el contraste); el menú de la persona (zona horaria, tema) vive en el pie de la navegación y no en la barra superior, porque así lo muestra la pantalla de Stitch; el e2e `hide-not-block` se adaptó a esa ubicación; `Skeleton` y `ObjectiveTree` siguen sin crearse (ver §3).

**Pendiente:**

- **`/aprendido`:** la pantalla de Stitch no existe (se agotó el tiempo dos veces, D-075). El archivo ya se adaptó a los componentes y tokens nuevos, pero ninguna decisión lo da por cerrado: falta su revisión visual.
- **`/login`:** solo hereda los tokens; falta su revisión visual.
- Ninguna de las dos bloquea el trabajo de filtros globales, que no las toca.
- Recuento independiente de "Launch New Content" (tarea aparte).
- Medir el LCP sobre una compilación de producción (`pnpm build` falla en este equipo por el permiso de enlaces simbólicos de Windows, ver `docs/COMO_EJECUTAR.md`); es la forma de saber si las 5 páginas por encima de 1500 ms lo están de verdad.
