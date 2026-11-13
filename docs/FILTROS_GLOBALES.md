# Solicitud de desarrollo: filtros globales y comparación vs año previo

Documento para Claude Code. Complementa el SDD y el DESIGN.md. No empieces a escribir código hasta que apruebe el plan (ver §9).

---

## 1. Qué se pide

Un filtro **global y persistente** que aparece en cuatro páginas del Hub y que además incluye una **comparación del período elegido contra el mismo período del año anterior**.

Páginas donde aplica y se muestra:

1. Resumen ejecutivo (`/`)
2. Resumen (`/resumen`)
3. SLAs (`/sla`)
4. SLAs incumplidos (`/incumplimientos`)

En el resto de páginas (Tareas, Capacidad, Trimestre a trimestre, Lo aprendido, Definiciones, Estado, Permisos) **no se muestra ni se aplica**.

Esto reemplaza los filtros que hoy tiene `/resumen` (chips de período, fechas, tipo de solicitud) y cambia el significado del Resumen ejecutivo, que hoy es siempre "trimestre actual vs anterior".

---

## 2. Referencia de diseño

Las imágenes del diseño están en `docs/designs/filtros-globales/`. | Archivo | Qué muestra |
|---|---|
| `filtro-comparar-apagado.png` | Filtro con el interruptor "Comparar" **apagado** (estado por defecto: sin caja de año previo, sin morado). |
| `filtro-comparar-encendido.png` | Filtro con el interruptor "Comparar" **encendido** (aparece la caja de año previo, el color de comparación y el tag "N activos"). |

La versión móvil **no es prioridad** y queda fuera de este desarrollo (ver §2.3).

**La imagen manda sobre este texto** en lo visual. Usa los tokens de `docs/DESIGN.md` y construye `FilterBar` con componentes del proyecto (no pegues HTML de ninguna herramienta de diseño).

### 2.1 Estructura del componente (escritorio)

- Tarjeta blanca, borde 1 px `--border`, radio 16, padding 20 / 24.
- Cabecera: icono de embudo en caja `--magenta-100` (36 px, radio 12), título **"Filtros"** (20 px, peso 400) y a su derecha el tag dinámico **"N activos"** (píldora de 24 px con punto magenta; "1 activo" en singular; **se oculta si N = 0**).
- Separador de 1 px.
- Fila de controles, alineada a la derecha y con salto de línea si no cabe:
  1. Grupo de chips de período: **30 días**, **T1**, **T2**, **T3**, **T4** (el seleccionado con fondo `--magenta-100`, borde `--magenta-400` y texto `--magenta-500`).
  2. Selector de **año** (2026, 2025...) para los trimestres.
  3. Campo de rango de fechas con icono de calendario, "dd/mm/aaaa – dd/mm/aaaa" y, a la derecha, la duración en días ("30 d").
  4. Desplegable de **tipo de solicitud** con selección múltiple. Etiqueta "Todos los tipos (5)" o "N de 5 tipos". El botón debe ser lo bastante ancho para mostrar "Todos los tipos (5)" completo.
  5. Interruptor **"Comparar"** (icono de comparación en color de año previo).
  6. **"Restablecer"** (botón terciario, icono de reinicio) y **"Aplicar"** (primario con degradado Volare). Un solo "Restablecer"; no existe "Limpiar".
- Con la comparación encendida aparece, debajo de los controles, una **caja de año previo**: muestra "Año previo", el rango de fechas del año anterior, "mismo número de días, N d" y el aviso "Este color marca los datos del año previo en todo el Hub".
- Encima de la tarjeta, una nota de diseño "Aparece en..." **no forma parte del producto** (es solo una anotación del lienzo).

### 2.2 Color de comparación (nuevo, se añade a DESIGN.md)

El año previo se identifica **siempre** con el mismo color, en todo el sitio. Es un tinte morado de Volare, distinto del magenta de marca, del azul de la segunda serie y de los colores de estado.

| Token              | Claro                  | Uso                                          |
| ------------------ | ---------------------- | -------------------------------------------- |
| `--compare`        | `#643560` (Purple 400) | Texto, iconos, interruptor encendido, líneas |
| `--compare-fill`   | `#BD78B8` (Purple 300) | Relleno de barras y marcadores               |
| `--compare-bg`     | `#FFEEFE` (Purple 100) | Fondo de la caja y de chips                  |
| `--compare-border` | `#E2BEE0` (Purple 200) | Bordes de la caja                            |

Modo oscuro [Proposed]: `--compare` `#E2BEE0`, `--compare-fill` `#BD78B8`, `--compare-bg` `#3C263A`, `--compare-border` `#4D2B49`. Calcula el contraste de cada par y ajusta si no llega a 4,5:1 (texto) o 3:1 (gráficos).

Reglas:

- El año previo **nunca depende solo del color**: en barras usa trama diagonal (rayas de `--compare-fill` sobre `--compare-bg`) y en líneas trazo discontinuo, además de leyenda con texto "Año previo".
- Comparación apagada: desaparecen la caja, el morado, las series del año previo y los deltas vs año previo; los deltas vuelven a "vs período anterior" (comportamiento actual).
- Añade a `docs/DESIGN.md` una sección "Filtros globales y comparación" con esto, y los tokens a `tokens.css` en la capa semántica.

### 2.3 Móvil

Sin diseño y sin requisito por ahora. Solo se pide que el componente no rompa el layout en pantallas estrechas (que los controles se apilen o envuelvan) y que no se pierda ningún patrón móvil existente del Hub. No hagas trabajo específico de móvil para el filtro ni para la comparación en este desarrollo.

---

## 3. Comportamiento funcional

### 3.1 Valor por defecto

- **Últimos 30 días terminando hoy** (hoy incluido), en hora de Bogotá (`America/Bogota`).
- Todos los tipos de solicitud (los vigentes, no los obsoletos).
- Comparación apagada.
- Con estos valores el contador "N activos" es 0 y no se muestra.

### 3.2 Qué cuenta como "activo"

Suma 1 por cada una de estas condiciones: período distinto del por defecto; tipos distintos de "todos"; comparación encendida.

### 3.3 Período

- Opciones: 30 días (rodante), T1–T4 de un año elegido (año por defecto: el actual), o rango personalizado con "Desde" y "Hasta (incluido)".
- Validaciones: `desde <= hasta`, período máximo de 3 años. Un trimestre en curso se acota a hoy para los cálculos y el rótulo lo indica ("hasta hoy").
- Los chips usan el rótulo **T1–T4** (no Q1–Q4), igual que el resto del Hub.

### 3.4 Tipo de solicitud

Selección **múltiple**, no puede quedar vacía (si el usuario desmarca el último, no se permite). Las opciones salen de los tipos de solicitud vigentes que ya conoce el Hub.

### 3.5 Comparación vs año previo

- Con el interruptor encendido, se compara el período efectivo contra **el mismo rango de calendario un año antes, con el mismo número de días**. Ej.: 15/10/2026 – 13/11/2026 contra 15/10/2025 – 13/11/2025.
- Cálculo: `inicio_previo = inicio − 1 año` (si el día no existe, p. ej. 29 de febrero, usar el 28); `fin_previo = inicio_previo + (días − 1)`. Así el número de días siempre coincide.
- Si el período incluye hoy (parcial), se acota a hoy y el año previo se acota al mismo número de días (reutiliza la lógica de "mismos N días" que ya existe en `describeChange`).
- La comparación **no cambia las fórmulas** existentes: se calcula la misma métrica sobre el rango previo.
- Verifica que la sincronización con Jira cubra al menos un año atrás de datos (tickets y SLAs). Si faltan, la caja de año previo debe decir "Sin datos suficientes del año previo" en lugar de mostrar ceros.

### 3.6 Persistencia

- La URL es la fuente de verdad (parámetros validados con Zod, por ejemplo `periodo`, `anio`, `desde`, `hasta`, `tipos`, `comparar`). Así el enlace es compartible.
- Además se recuerda en una **cookie de sesión** (sin `Max-Age`, `SameSite=Lax`, `Secure`, `HttpOnly`) que fija el servidor al aplicar el filtro. Se guarda el **preset** ("30d", "T4-2026"...), no las fechas resueltas, para que "30 días" siga siendo "hasta hoy" al día siguiente.
- Al abrir una de las cuatro páginas sin parámetros, el servidor usa la cookie; si no hay cookie o es inválida, usa el por defecto. Nunca confíes en la cookie ni en la URL sin validar.
- Una sesión nueva vuelve al valor por defecto.
- Los enlaces del menú hacia las cuatro páginas conservan el filtro. Las otras páginas quedan sin parámetros.
- Debe funcionar **sin JS**: formulario GET, chips como radios, interruptor como casilla estilizada, desplegable múltiple con `<details>` y casillas. Mantén los 0 KB de JS salvo que sea imprescindible.

### 3.7 Efecto en cada página

| Página            | Qué cambia                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumen ejecutivo | Deja de ser "trimestre actual vs anterior". Los títulos pasan a ser dinámicos ("Cumplimiento de SLA en {rango}"). Sin comparación: compara con el período anterior de igual duración. Con comparación: contra el año previo.                                |
| Resumen           | Reemplaza sus filtros actuales. Los KPI, "Por tipo de solicitud" y "Abiertos hoy por estado" se filtran por período y tipos. Con período corto, el gráfico "Mes a mes" pasa a semanal (≤ 100 días) o diario (≤ 14 días); mensual solo para períodos largos. |
| SLAs              | Porcentaje y "n" (cumplidos de medidos) siempre visibles, con el año previo si está activa la comparación. Con muestras pequeñas el "n" debe verse bien.                                                                                                    |
| SLAs incumplidos  | La lista se filtra por período y tipos. La comparación se muestra **solo como conteo** ("N incumplimientos vs M año previo"), no como lista.                                                                                                                |

"Abiertos hoy" es el estado de hoy y **no** se filtra por período (se mantiene la aclaración actual). Los tipos obsoletos siguen sin salir en la tabla pero sí en los totales: añade la nota al pie ya acordada.

### 3.8 La comparación toca muchos componentes que ya existen (parte grande del alcance)

Esta es la parte más pesada del desarrollo y no se limita a la barra de filtros. Con la comparación encendida, **cada cifra, gráfico y tabla de las cuatro páginas debe mostrar también su valor del año previo**, en el color de comparación. Hoy esos componentes solo conocen el período actual y, a lo sumo, el "período anterior". Hay que modificar los componentes y los casos de uso, no solo añadir uno nuevo.

Reglas generales:

- Los casos de uso devuelven siempre un par `{ actual, previo }`. `previo` es nulo cuando la comparación está apagada. Las fórmulas no cambian: se ejecutan sobre dos rangos.
- Con la comparación apagada todo se ve y calcula exactamente como hoy (incluido "vs período anterior").
- Con la comparación encendida, el delta "vs año previo" **sustituye** al delta "vs período anterior" (no se muestran los dos).
- En gráficos, el año previo se alinea por **posición relativa** (día 1 con día 1, semana 1 con semana 1), no por fecha.
- Sin datos del año previo: mensaje "Sin datos del año previo" en ese componente, nunca ceros engañosos. Si el denominador es 0, mostrar "—".

Lista orientativa (haz tú el inventario real leyendo el código; esta lista no es exhaustiva):

| Componente / zona                                               | Con comparación encendida                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tarjetas KPI (creados, resueltos, % completadas, tiempo típico) | Delta vs año previo con el valor previo entre paréntesis, p. ej. "+16 % vs año previo (102)"                          |
| Tarjetas de SLA (primera respuesta, resolución)                 | Porcentaje y "n" (cumplidos de medidos) del año previo junto al actual; el chip de meta aplica solo al período actual |
| Gráfico de creados y resueltos                                  | Serie del año previo con trama y leyenda; tooltip y alternativa textual incluyen el previo                            |
| Gráfico de cumplimiento de SLA                                  | Línea discontinua del año previo                                                                                      |
| Barras "Qué se pidió" por tipo                                  | Segunda barra o marcador del año previo por tipo                                                                      |
| Tabla "Por tipo de solicitud"                                   | Valores del año previo (creados, completados, % completadas) junto a los actuales, en color de comparación            |
| Tiempo típico de resolución                                     | Valor del año previo y delta                                                                                          |
| SLAs incumplidos                                                | Solo conteo ("N incumplimientos vs M año previo"); la lista es solo del período actual                                |
| "Abiertos hoy" y "Abiertos hoy por estado"                      | **No se comparan**: son una foto de hoy y no hay histórico. Indicarlo con una nota discreta                           |
| Tooltips ⓘ y página Definiciones                                | Explicar cómo se calcula el año previo                                                                                |

Primer entregable del plan: un **inventario completo** de cada componente, página y caso de uso que hoy muestra cifras, con el dato de comparación que recibirá cada uno y qué cambia en sus props. Tiene que cubrir también gráficos con muchas columnas y tablas con vista alternativa.

Rendimiento: como máximo dos consultas por página (actual y previo); mide antes y después y cacha por período, tipos y comparación.

### 3.9 Permisos

Sin cambios. El filtro es una preferencia de visualización, no un permiso. Las secciones sin acceso siguen ocultas y no aparecen en ningún enlace del menú.

---

## 4. Reglas técnicas

- Respeta las capas del SDD: parseo y validación de filtros en `application` (caso de uso de "período y comparación"), cálculo de fechas en `domain` con pruebas, UI en `presentation`.
- Un único módulo calcula el período efectivo y el período de comparación; las cuatro páginas lo reutilizan.
- Las claves de caché incluyen período, tipos y comparación.
- Tope de 3 años y validación de `desde/hasta` en servidor.
- Presupuestos de rendimiento y CSP del SDD siguen vigentes.
- Accesibilidad: el interruptor es `role="switch"` con `aria-checked`; los chips usan `aria-pressed` o radios con etiqueta; foco visible; objetivos de 44 px; el año previo nunca solo por color.

---

## 5. Cambios en documentación

- SDD: nueva sección "Filtros globales y comparación", actualización de §5 (páginas), §6 (consultas por período), §15 si hay variables nuevas (ninguna esperada) y §16 (nueva fase 1.5).
- `docs/DECISIONES.md`: D-0xx período por defecto de 30 días; D-0xx persistencia URL + cookie de sesión; D-0xx comparación con mismo número de días; D-0xx color de comparación.
- `docs/DESIGN.md`: sección y tokens de §2.2.
- Página "Definiciones": explicar el período por defecto, la comparación y el acotado a hoy.

---

## 6. Pruebas mínimas

- Unitarias del cálculo de períodos: 30 días, trimestres, rangos personalizados, años bisiestos (29 feb), frontera de zona horaria (Bogotá), trimestre en curso acotado.
- Unitarias de la comparación: mismo número de días, rango previo, caso sin datos del año previo.
- Validación: parámetros inválidos, cookie manipulada, rango > 3 años, `desde > hasta`, tipos vacíos o inexistentes.
- E2E: el filtro se conserva al navegar entre las cuatro páginas; "Restablecer" vuelve al valor por defecto; no aparece en las demás páginas; sin JS sigue funcionando; el e2e `hide-not-block` no se rompe.
- Visuales: capturas a 1440 y 1024 px, claro y oscuro, con comparación apagada y encendida, de las cuatro páginas.
- Componentes: pruebas de que cada componente con comparación muestra el previo cuando está encendida, lo oculta cuando está apagada y maneja "sin datos del año previo".

---

## 7. Criterios de aceptación

1. El filtro aparece en las cuatro páginas y solo en ellas, con el diseño de las imágenes.
2. El contador "N activos" es dinámico y se oculta en 0.
3. La selección persiste al navegar durante la sesión y se resetea en sesión nueva.
4. Con la comparación encendida, todas las métricas del año previo usan el color de comparación (con trama o leyenda) y las fechas de la caja coinciden con el cálculo.
5. Las fórmulas existentes no cambian; los números del período sin comparación coinciden con los de antes para el mismo rango.
6. Todos los componentes del inventario del §3.8 muestran su dato de año previo cuando la comparación está encendida, y ninguno lo muestra cuando está apagada.
7. Pasan lint, typecheck, dependency-cruiser, tests, e2e, `pnpm perf` y `check-tokens`.

---

## 8. Puntos a confirmar conmigo (no los resuelvas tú)

1. Trimestre en curso: ¿acotar a hoy tanto el período actual como el año previo? (propuesta: sí).
2. Granularidad del gráfico por rangos (diario ≤ 14 días, semanal ≤ 100, mensual después).
3. Si faltan datos del año previo en Jira: ¿mensaje "Sin datos suficientes" o esconder la comparación?
4. Nombre de la fase en el SDD (1.5 propuesta).
5. Que "Abiertos hoy" y "Abiertos hoy por estado" no se comparen (propuesta del §3.8).
6. Si el alcance del §3.8 es demasiado grande para una sola fase, propón cómo dividirlo (por ejemplo, primero filtro y persistencia, luego comparación por página) sin dejar páginas a medias.

---

## 9. Cómo trabajar

1. **Primero solo plan.** Entrega `docs/PLAN_FILTROS.md` con: impacto en cada página, diseño del caso de uso y del módulo de fechas, formato de parámetros y cookie, componentes de presentación, riesgos, decisiones D-0xx y pruebas. Espera mi aprobación.
2. Coordina con el rediseño visual en curso: el componente `FilterBar` se construye con el diseño de este documento; la lógica va en una fase aparte.
3. Si algo del diseño contradice DESIGN.md o el SDD, dímelo antes de decidir.
4. No cambies fórmulas, esquema ni permisos sin avisarme.
