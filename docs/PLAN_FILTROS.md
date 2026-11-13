# Plan: filtros globales y comparación vs año previo

Estado: **plan aprobado. La fase 1.5a está hecha** (rama `feat/filtros-globales`): dominio del período y del filtro, las cuatro páginas con el filtro, cookie, menú, Definiciones y pruebas. Un script de mejora progresiva de ≤ 2 KB se añadió después (D-081). **Quedan 1.5b y 1.5c** (la comparación con el año previo); el interruptor "Comparar" no existe todavía (`COMPARE_ENABLED = false`).

## 0. Aprobación y medición de datos

### 0.1 Decisiones aprobadas

| Id                                 | Decisión                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-0a, D-0d, D-0e, D-0h, D-0i, D-0j | Aprobadas como se proponen. `GlobalFilters`, Zod en presentación, resolución en dominio                                                                                                                             |
| D-0b                               | Delta en **porcentaje** para conteos, **puntos** para tasas y **días** para tiempos, **también con la comparación apagada** (`/` pasa a porcentaje)                                                                 |
| D-0c                               | **Híbrido.** Chips de trimestre: los primeros N días del trimestre anterior (como hoy). `30 días` y rango personalizado: los N días inmediatamente anteriores. Reemplaza la regla única del §2.2 y la fila 6 del §9 |
| D-0f                               | Sin script por ahora. Selección vacía vale "todos", con aviso. Se revisa si molesta                                                                                                                                 |
| D-0g                               | "Ciclos en curso ahora" se filtra por tipo                                                                                                                                                                          |
| D-0k                               | El interruptor se enciende en las cuatro páginas a la vez al cerrar 1.5c                                                                                                                                            |
| §9                                 | Resto aprobado como se propone; referencia corregida a `docs/designs/` en `FILTROS_GLOBALES.md`                                                                                                                     |

### 0.2 Cuánto histórico hay (medición de solo lectura, 2026-11-13)

Fuente: **copia** de la base local `.data/dev` (pglite), sin abrir la original. Último sync correcto: 2026-11-13 15:44 UTC. No es la base de producción: antes de la 1.5b hay que repetirlo allí si se puede.

| Dato                            | Valor                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| Tickets                         | 1.046 (997 resueltos)                                             |
| `min` de creación               | **2025-04-08**                                                    |
| `min` de inicio de un ciclo SLA | **2025-04-08** (ambas métricas). Primer ciclo cerrado: 2025-04-24 |
| Ciclos                          | 2.119 (1.028 + 992 cerrados, 45 + 54 en curso)                    |
| Creados en 2025 / 2026          | 97 / 949                                                          |

Creados por mes (resueltos y ciclos cerrados, ambas métricas juntas):

| Mes                   | Creados                              | Resueltos                            | Ciclos cerrados                        |
| --------------------- | ------------------------------------ | ------------------------------------ | -------------------------------------- |
| 2025-04 a 2025-09     | 5, 9, 6, 10, 2, 16                   | 4, 9, 3, 10, 2, 15                   | 8, 19, 7, 24, 4, 32                    |
| 2025-10               | 17                                   | 11                                   | 28                                     |
| 2025-11               | 12                                   | 10                                   | 23                                     |
| 2025-12               | 20                                   | 13                                   | 34                                     |
| 2026-01               | 9                                    | 14                                   | 23                                     |
| 2026-02               | 63                                   | 34                                   | 81                                     |
| 2026-03 a 2026-10     | 104, 91, 104, 106, 119, 87, 117, 103 | 109, 80, 109, 94, 108, 103, 117, 104 | 223, 182, 211, 205, 224, 179, 229, 197 |
| 2026-11 (hasta el 13) | 46                                   | 48                                   | 87                                     |

**Qué significa para la comparación:**

| Período elegido hoy     | Año previo         | Cobertura por fecha                    | Volumen aproximado del previo         |
| ----------------------- | ------------------ | -------------------------------------- | ------------------------------------- |
| 30 días (16 oct–13 nov) | 16 oct–14 nov 2025 | ok                                     | ≈ 15 creados, ≈ 12 ciclos por métrica |
| T4 2026 (1 oct–13 nov)  | 1 oct–13 nov 2025  | ok                                     | ≈ 22 creados                          |
| T3 2026                 | T3 2025            | ok                                     | 28 creados                            |
| T2 2026                 | T2 2025            | **parcial** (faltan 1–7 abr)           | 20 creados                            |
| T1 2026                 | T1 2025            | **ninguna** (el dato empieza el 8 abr) | 0                                     |

### 0.3 Señal de muestra pequeña (aprobada, entra en 1.5b)

- **Constante:** `MIN_RELIABLE_SAMPLE = 30` en el dominio (`period-window.ts`), sin fechas fijas ni variables de entorno.
- **Qué es `n`:** el tamaño del **lado previo** de la cifra (el lado débil): tickets creados o resueltos en el rango previo para conteos; ciclos medidos de esa métrica para tasas de SLA; tickets resueltos para el tiempo típico; ciclos incumplidos más cumplidos para los conteos de incumplimientos.
- **Con `n < 30`:** el delta se muestra **absoluto** (la diferencia en unidades), sin porcentaje, y lleva la nota "Pocos datos del año previo (n = X)". Las tasas ya se expresan en puntos, así que su delta no cambia de forma: solo añade la nota. El porcentaje de la tarjeta del año previo (p. ej. "84 %") se sigue mostrando, con su "n de m".
- **Con `n ≥ 30`:** vuelve el porcentaje (conteos) y la nota desaparece.
- **Un solo componente:** `CompareNote` cubre tarjetas, gráficos y tablas (mensaje de muestra pequeña, "Sin datos del año previo" y "Estado de hoy, no se compara"). En tablas y gráficos, la nota va una vez bajo el título y la fila o barra concreta lleva solo un marcador con texto accesible.
- **En `Compared<T>`:** `coverage` se amplía a `'ok' | 'small-sample' | 'partial' | 'none' | 'off'`, y cada cifra comparable lleva su `previousN`. Prioridad: `none` > `partial` > `small-sample`.
- **Definiciones:** entrada nueva "Cuándo es fiable la comparación con el año previo": explica el año previo, el umbral de 30 y por qué con menos casos un porcentaje engaña. El número 30 sale de la constante, así la página y el código no se separan.
- **Pruebas:** frontera exacta (n = 29 y n = 30), n = 0 (sin porcentaje, "—"), conteo y tasa, y que ninguna prueba dependa de la fecha de hoy. Con fechas de 2027 en adelante la nota desaparece sola porque depende de `n`, no de un año.

### 0.4 Medición en producción (pendiente)

Debe repetirse antes de empezar 1.5b. Desde aquí no tengo, ni debo tener, la cadena de conexión de producción. Se necesita una de estas dos cosas: que tú ejecutes un script de solo lectura que prepararé (devuelve únicamente agregados, ningún dato de tickets), o una conexión de solo lectura que me indiques tú. Esta sección se completa con el resultado.

**Aprobado: camino 1.** Se prepara **al empezar 1.5b**, no antes. Requisitos del script: solo lectura; imprime únicamente mínimos de fecha y conteos por mes (tickets creados y resueltos, ciclos cerrados), sin claves, títulos, nombres ni ningún dato de ticket; lee la conexión del `DATABASE_URL` que ya tenga la sesión de quien lo ejecuta y no la guarda, no la imprime ni la pide; no escribe nada en la base.

**Script preparado (2026-11-13):** `scripts/measure-coverage.mjs`. Una sola transacción `READ ONLY` que se deshace; imprime totales, fechas mínima y máxima (hora de Bogotá) y conteos por mes de tickets creados, tickets resueltos y ciclos SLA cerrados por métrica; nada más (ni claves, ni títulos, ni nombres, ni tipos, ni la conexión: ante un fallo solo imprime el código del error). Probado contra una copia de la base local, no contra producción. Uso: `$env:DATABASE_URL = Read-Host "Cadena de conexión"; node scripts/measure-coverage.mjs; Remove-Item Env:DATABASE_URL`. El resultado se pega aquí.

**Resultado en producción (2026-11-13 22:29 UTC, ejecutado por el usuario):** 1.047 tickets (998 resueltos); primer ticket creado **2025-04-08**, primero resuelto 2025-04-23, último creado 2026-11-13. Ciclos: `done` 1.073 (1.029 cerrados, 44 en curso) y `first_response` 1.047 (992 cerrados, 55 en curso); primer ciclo iniciado 2025-04-08 y primer cierre 2025-04-23 en ambas métricas. Por mes, creados / resueltos: 2025-04 a 2025-09: 5/4, 9/9, 6/3, 10/10, 2/2, 16/15; 2025-10: 17/11; 2025-11: 12/10; 2025-12: 20/13; 2026-01: 9/14; 2026-02: 63/34; 2026-03 a 2026-10: 104/109, 91/80, 104/109, 106/94, 119/108, 87/103, 117/117, 103/104; 2026-11 (hasta el 13): 47/49. Coincide con la base local (§0.2) salvo por 1 a 2 tickets de diferencia por la hora del sync. **Las conclusiones de §0.2 se mantienen:** el año previo tiene una décima parte del volumen actual, T1 no tiene datos previos y T2 los tiene parciales (faltan 1–7 abr). Con `MIN_RELIABLE_SAMPLE = 30`, los creados del año previo quedan por debajo de 30 en el período de 30 días (≈ 15), en T4 (≈ 22) y en T2 (20); T3 queda en 28. Hoy ningún período elegible supera el umbral solo con creados.

**Hallazgo que el plan no preveía (base local):** hasta enero de 2026 entraban de 2 a 20 tickets al mes; desde febrero, unos 100. La cobertura por fecha no basta: aunque el año previo "tenga datos", son una décima parte del volumen actual. Las comparaciones darán +300 % a +900 % y los porcentajes de SLA del año previo se calcularán con unos 12 ciclos por métrica. Hay que decidir si se añade una señal de muestra pequeña (propuesta en la respuesta de la medición).
Fuentes leídas: `docs/FILTROS_GLOBALES.md`, las dos imágenes de `docs/designs/filtros-globales/` (la solicitud las nombra en `docs/design/`, pero la carpeta real es `docs/designs/`), el SDD, `docs/DESIGN.md`, `docs/PLAN_DISENO.md`, `docs/DECISIONES.md` (hasta D-076) y el código de las cuatro páginas, sus casos de uso, su dominio y sus componentes.

Convenciones: los textos de la interfaz van en español; los identificadores del código, en inglés (como hoy). En los tipos, `current` es el "actual" y `previous` el "previo" de la solicitud.

---

## 1. Inventario de lo que hoy muestra cifras

### 1.1 Páginas

| Página                | Cifras que muestra hoy                                                                                                                                                                      | Qué cambia con el filtro global                                                                                                      | Dato de comparación que recibirá                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` Resumen ejecutivo | 2 tarjetas de SLA (trimestre en curso); 4 KPI (creados, resueltos, abiertos hoy, tiempo típico) contra "mismo tramo del trimestre anterior"; gráfico fijo de 6 meses; barras "Qué se pidió" | Deja de ser "trimestre en curso". Todo sigue el período y los tipos elegidos. Títulos dinámicos                                      | Con comparación apagada: período anterior inmediato de igual duración. Encendida: año previo. En ambos casos el delta usa el mismo par `current/previous` |
| `/resumen`            | 6 KPI; gráfico "Mes a mes"; tabla "Por tipo de solicitud"; barras "Abiertos hoy por estado"                                                                                                 | Sustituye `PeriodPicker` y el selector de un solo tipo. El gráfico cambia de granularidad                                            | Año previo solo si está encendida la comparación. Apagada: sin deltas (igual que hoy)                                                                     |
| `/sla`                | 2 tarjetas de cumplimiento; gráfico y tabla mensuales; tabla por tipo; lista "Ciclos en curso ahora"                                                                                        | Sustituye `PeriodPicker`. La lista de ciclos en curso no depende del período                                                         | Año previo en tarjetas, gráfico, tabla mensual y tabla por tipo                                                                                           |
| `/incumplimientos`    | 3 KPI (total y por métrica); barras por persona y por tipo; lista paginada                                                                                                                  | Sustituye `PeriodPicker` y el filtro "Tipo de solicitud" de la lista (pasa a ser global). La lista conserva "Métrica" y "Asignado a" | Solo conteos: total y por métrica. Las barras y la lista son del período actual                                                                           |

### 1.2 Casos de uso (capa `application`)

| Caso de uso                                                                                                              | Entrada hoy                                                 | Salida hoy                          | Cambio                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GetExecutiveSummary`                                                                                                    | solo permisos                                               | `ExecutiveSummary` (trimestre fijo) | Recibe el filtro. Devuelve `Compared<ExecutiveSummary>`                                                                 |
| `GetSummary`                                                                                                             | `{ period: RawPeriod, requestType }`                        | `SummaryPage`                       | Recibe el filtro. Devuelve `Compared<SummaryReport>` más la barra de filtros resuelta                                   |
| `GetSlaReport`                                                                                                           | `RawPeriod`                                                 | `SlaPage`                           | Recibe el filtro. Devuelve `Compared<SlaReport>`; `ongoing` y los contadores de pausa salen una sola vez, fuera del par |
| `GetSlaBreaches`                                                                                                         | `{ period, filter{metric, requestType, assigneeId}, page }` | `BreachesPage`                      | Recibe el filtro global más el filtro de lista (métrica y asignado). Devuelve además `previousSummary` (solo totales)   |
| `GetCapacity`, `GetQuarterlyReport`, `GetLearned`, `ListTasks`, `GetDefinitionsData`, `GetSyncStatus`, `GetSystemStatus` | —                                                           | —                                   | **No cambian.** Ver §1.6                                                                                                |

Los cuatro leen lo mismo: `listTickets()` y `listSlaCycles()`, o sea **dos consultas** a la base de datos por página. La comparación no añade consultas: calcula el rango previo en memoria sobre los mismos arreglos (ver §4.3).

### 1.3 Dominio (`src/domain/jira`)

| Archivo / función                                                                               | Qué hace hoy                                                                | Cambio                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report-period.ts` (`resolvePeriod`, `RawPeriod`, `ResolvedPeriod`, `recentQuarters`)           | Trimestre o rango; por defecto, el trimestre en curso                       | Se queda para los consumidores que no cambian. Los cuatro casos de uso pasan al módulo nuevo (§2). Si tras la migración nadie lo importa, se elimina |
| `executive-summary.ts` (`buildExecutiveSummary`)                                                | Trimestre actual contra el anterior, `sameStretch` calculado dentro         | Se reescribe sobre una ventana de fechas (`PeriodWindow`). Calcula el mismo resumen para cualquier ventana                                           |
| `executive-summary.ts` (`createdIn`, `resolvedIn`, `medianResolutionDays`, `monthPoint`)        | Helpers que usan también `capacity.ts`, `quarterly.ts`, `summary-report.ts` | **No cambian de firma.** Son el contrato de "las fórmulas no cambian"                                                                                |
| `summary-report.ts` (`buildSummaryReport`, `typeSummaries`, `monthFlows`, `summaryTypeOptions`) | Un solo rango; cubetas por mes                                              | Se generaliza la cubeta (día, semana, mes). `byType` se calcula sobre los tipos elegidos. Las fórmulas, no                                           |
| `sla-report.ts` (`buildSlaReport`, `byMonth`, `byRequestType`, `ongoingCycles`)                 | Un solo rango; cubetas por mes                                              | Igual: cubeta generalizada. `ongoingCycles` se separa para calcularse una vez                                                                        |
| `sla-compliance.ts` (`slaCompliance`, `cycleInPeriod`)                                          | Fórmula de cumplimiento (D-042)                                             | **No cambia**                                                                                                                                        |
| `sla-breaches.ts` (`buildBreachReport`, `sanitizeBreachFilter`)                                 | Un rango; opciones de tipo salen de las filas del período                   | Se ejecuta sobre cada rango. `options.requestTypes` desaparece (el tipo es global)                                                                   |
| `ticket.ts` (`isObsoleteRequestType`)                                                           | Detecta tipos "DON'T USE"                                                   | Se reutiliza para las opciones del desplegable                                                                                                       |

### 1.4 Componentes de presentación

La columna "Cambio de props" es lo que cambia en la interfaz del componente. En todos los casos la prop nueva es opcional y, ausente, el componente se dibuja exactamente como hoy.

| Componente                                                       | Cifras que muestra hoy                                                                            | Dónde se usa (de las 4 páginas)                                | Dato de comparación que recibe                              | Cambio de props                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KpiCard`                                                        | Una cifra y un `delta` ya calculado                                                               | `/` ×4, `/resumen` ×6, `/incumplimientos` ×3                   | Valor previo y su delta                                     | `delta` pasa a poder llevar `{ reference, previousText }`. Nueva prop `compare?: { text, tone: 'year' \| 'period', noData }`. Hoy el delta es una diferencia absoluta y la solicitud pide porcentaje (§5.5, decisión D-0b)                                                   |
| `SlaCard`                                                        | Porcentaje, barra con la meta, "N cumplidos de M medidos", chip de meta                           | `/` ×2, `/sla` ×2                                              | `MetricCompliance` previo                                   | Nueva prop `previous?: MetricCompliance \| null`. Muestra porcentaje y "n de m" previos en `--compare` y una segunda marca en la barra. El chip de meta sigue siendo solo del período actual                                                                                 |
| `VolumeChart`                                                    | Barras creados y resueltos por mes; valores sobre las barras; descripción para lector de pantalla | `/`, `/resumen`                                                | Serie previa alineada por posición                          | `Item` gana `previousCreated?` y `previousResolved?`. Nueva prop `previousLabel`. Cada grupo pasa de 2 a 4 barras (las previas con trama). `GROUP_WIDTH` sube de 96 a unos 150 px y el gráfico mantiene su desplazamiento lateral. La `desc` y la leyenda incluyen el previo |
| `ComplianceChart`                                                | Barras de cumplimiento por mes y línea de meta                                                    | `/sla`                                                         | Cumplimiento previo por posición                            | `Item` gana `previous?: SlaCompliance \| null`. Se dibuja una línea discontinua con marcadores por métrica (círculo y cuadrado, para no depender del color)                                                                                                                  |
| `ComplianceTable`                                                | Cumplimiento y "n de m" por fila (mes o tipo)                                                     | `/sla` ×2                                                      | Cumplimiento previo por fila                                | `Row` gana `previous?: SlaCompliance \| null`. Segunda línea en `--compare` dentro de cada celda                                                                                                                                                                             |
| `SummaryTypeTable`                                               | Creados, completados, % completadas, abiertos hoy, por tipo                                       | `/resumen`                                                     | `TypeSummary` previo del mismo tipo                         | `rows` pasa a `{ current, previous }[]`. La columna "Abiertos hoy" no se compara                                                                                                                                                                                             |
| `BarList`                                                        | Barras de conteo; "Otros" agrupa lo que sobra del límite                                          | `/` (por tipo), `/resumen` (por estado), `/incumplimientos` ×2 | Solo "por tipo" de `/`                                      | `Item` gana `previousCount?`. Segunda barra con trama. Las demás instancias no la reciben                                                                                                                                                                                    |
| `ChartCard`                                                      | Título, subtítulo, total                                                                          | `/`, `/resumen`, `/sla`, `/incumplimientos`                    | —                                                           | Gana un `legend?` opcional donde va el "Año previo"                                                                                                                                                                                                                          |
| `OngoingTable`, `BreachTable`                                    | Filas de ciclos y de incumplimientos                                                              | `/sla`, `/incumplimientos`                                     | **Ninguno** (listas del período actual o del estado de hoy) | Sin cambios                                                                                                                                                                                                                                                                  |
| `PeriodPicker`                                                   | Chips de trimestres, rango, aviso de "ignorado"                                                   | `/resumen`, `/sla`, `/incumplimientos`                         | —                                                           | **Se elimina.** Es lo que reemplaza el filtro global                                                                                                                                                                                                                         |
| `FilterBar` (el actual)                                          | Formulario GET genérico de filtros de lista                                                       | `/incumplimientos` (lista), `/tareas`                          | —                                                           | Se queda para filtros de lista. **El filtro nuevo se llama `GlobalFilters`** para no chocar con este nombre (decisión D-0e)                                                                                                                                                  |
| `Tooltip`, `PageHeader`, `EmptyState`, `DataTable`, `StatusChip` | Texto y estructura                                                                                | todas                                                          | —                                                           | Sin cambios. Cambian los textos que les pasan                                                                                                                                                                                                                                |

Componentes nuevos (todos en `src/presentation/components/`): `GlobalFilters`, `PeriodChips`, `TypeMultiSelect`, `CompareSwitch`, `ComparisonBox`, `CompareLegend`, `CompareNote` ("Sin datos del año previo" y "Esto no se compara").

### 1.5 Cifras que no se comparan (con su nota)

| Cifra                                                              | Dónde                        | Motivo                                    |
| ------------------------------------------------------------------ | ---------------------------- | ----------------------------------------- |
| Abiertos hoy (tarjeta)                                             | `/`                          | Foto de hoy, no hay histórico             |
| En curso hoy, Sin empezar hoy                                      | `/resumen`                   | Ídem                                      |
| Abiertos hoy por estado                                            | `/resumen`                   | Ídem. Se filtra por tipos, no por período |
| Columna "Abiertos hoy"                                             | tabla por tipo de `/resumen` | Ídem                                      |
| Ciclos en curso ahora, ciclos en pausa, cerrados con reloj abierto | `/sla`                       | Dependen de hoy, no del período           |
| Lista de incumplimientos, barras por persona y por tipo            | `/incumplimientos`           | Solo conteo, por la solicitud             |

Cada una lleva la nota discreta "Estado de hoy, no se compara" (`CompareNote`), visible solo con la comparación encendida.

### 1.6 Qué no se toca y cómo se protege

`/tareas`, `/capacidad`, `/trimestres`, `/aprendido`, `/definiciones`, `/estado` y `/permisos` no muestran ni aplican el filtro. Pero `capacity.ts`, `quarterly.ts` y `get-learned.ts` importan `createdIn`, `resolvedIn`, `medianResolutionDays`, `monthsIn`, `recentQuarters`, `resolvePeriod` y `slaCompliance`. Regla: **esas firmas no cambian**. Todo lo nuevo es aditivo. Las pruebas existentes de `capacity`, `quarterly` y `learned` son la red de seguridad y deben pasar sin editarlas.

---

## 2. Dominio: un único módulo de período y comparación

Archivo nuevo: `src/domain/jira/period-window.ts`, puro, sin Zod ni acceso a datos. Es el "único módulo" que piden las reglas técnicas: las cuatro páginas lo reutilizan a través del caso de uso.

### 2.1 Tipos

```ts
type PeriodPreset =
  | { kind: 'rolling'; days: 30 }
  | { kind: 'quarter'; quarter: Quarter }
  | { kind: 'custom'; from: YearMonthDay; to: YearMonthDay };

interface PeriodWindow {
  preset: PeriodPreset;
  from: YearMonthDay; // first day, Bogotá
  to: YearMonthDay; // last day included, already clamped to today
  days: number;
  range: TimeRange; // [from 00:00, to+1 00:00), what the formulas receive
  partial: boolean; // the preset runs past today and was clamped
}

type CompareReference = 'previous-year' | 'previous-period' | null;

interface Compared<T> {
  current: T;
  previous: T | null; // null when the comparison is off
  reference: CompareReference;
  previousWindow: PeriodWindow | null;
  coverage: 'ok' | 'partial' | 'none' | 'off'; // of the previous side
}
```

### 2.2 Reglas

- **Hoy y zona:** todo en `America/Bogota` (`REPORTING_TIME_ZONE`), con helpers nuevos `dayOf(date)`, `addYears(day, n)` y `daysBetween`. `quarter.ts` ya tiene `startOfDay`, `addDays` y `quarterRange`.
- **Por defecto:** `rolling 30`, que termina hoy incluido: `[hoy − 29, hoy]`.
- **Trimestre:** `quarterRange` completo, acotado a hoy si el trimestre está en curso (`partial = true`, rótulo "hasta hoy"). Un trimestre futuro es inválido.
- **Personalizado:** `desde ≤ hasta` y `days ≤ MAX_CUSTOM_DAYS` (3 × 366, ya existe). Un `hasta` futuro se acota a hoy.
- **Año previo:** `inicio_previo = addYears(inicio, −1)` con 29 feb → 28 feb; `fin_previo = inicio_previo + (days − 1)`. Mismo número de días siempre, también cuando el actual está acotado a hoy.
- **Período anterior (comparación apagada en `/`):** la ventana inmediatamente anterior de `days` días: `[inicio − days, inicio − 1]`. Ver decisión D-0c: cambia la definición de hoy para los trimestres.
- **Cubetas** (`bucketsOf(window, granularity)`):
  - `daily` si `days ≤ 14`; `weekly` si `days ≤ 100`; `monthly` en adelante (recorta a 36 como hoy).
  - `weekly` son bloques de 7 días **anclados al inicio del período**, no a lunes. Así "semana 1 del año previo" es exactamente el mismo desplazamiento que "semana 1 del actual" y no hay semanas a medias desalineadas. La última cubeta puede ser corta y se rotula así.
  - `monthly` usa meses de calendario con los extremos recortados al período (como hoy). El año previo se alinea por posición.
  - El gráfico de SLA nunca baja de `weekly`: con 1 a 3 ciclos medidos al día un porcentaje diario es ruido.
  - La alineación por posición exige **no recortar cubetas vacías al principio**, que es lo que hacen hoy `monthFlows` y `byMonth` ("desde el primer mes con datos"). Con comparación se recorta el mismo número de cubetas en ambos lados o ninguno. Sin comparación, se conserva el recorte actual para no cambiar lo que se ve.
- **Cobertura del año previo** (`previousCoverage(window, dataStart)`): `none` si `previous.to < dataStart`; `partial` si `previous.from < dataStart ≤ previous.to`; `ok` en el resto. `dataStart` sale del mínimo de `createdAt` (volúmenes) y del mínimo de `startedAt` de los ciclos (SLA); dos fechas porque Jira puede no tener SLA en tickets viejos.
- **Tipos:** `TypeSelection = { all: true } | { all: false; names: string[] }`. `all` incluye también los tipos obsoletos (para que los totales coincidan con los de hoy). Una selección explícita solo contiene tipos vigentes. Si la selección explícita coincide con el conjunto actual de tipos vigentes, se normaliza a `all`, así un tipo nuevo de Jira entra solo.

### 2.3 Resolución del filtro

`resolveGlobalFilter(raw, now, knownTypes, dataStart)` es pura y devuelve `ResolvedFilter { window, types, compare, ignored, activeCount, years, … }`. Cualquier valor inválido cae al por defecto con `ignored = true` (el aviso "No pudimos usar el período pedido…" que ya existe). Es la única función que decide qué significa un parámetro.

---

## 3. Parámetros y cookie

### 3.1 URL (fuente de verdad)

| Parámetro        | Valores                                       | Notas                                                                               |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `periodo`        | `30d`, `T1`..`T4`                             | Ausente = `30d`                                                                     |
| `anio`           | `2000`..`2100`                                | Solo con `T1`..`T4`; ausente = año actual                                           |
| `desde`, `hasta` | `YYYY-MM-DD`                                  | Si ambos son válidos, mandan sobre `periodo` (como hoy: el rango gana al trimestre) |
| `tipos`          | nombre del tipo, repetido (`tipos=A&tipos=B`) | Ausente = todos. Hay que leer con `getAll`, no con `Object.fromEntries` como hoy    |
| `comparar`       | `1`                                           | Ausente = apagado                                                                   |

Compatibilidad: `trimestre=2026-T4` se lee como `periodo=T4&anio=2026` y `tipo=X` como `tipos=X`. Los nombres `desde` y `hasta` no cambian. Eso mantiene vivos los enlaces guardados. Los parámetros propios de cada página (`pagina`, `metrica`, `asignado`, `sync`) conviven con estos y no los toca el filtro global.

Parseo: un esquema Zod en presentación (`presentation/global-filter.ts`, mismo patrón que `sla-query.ts`) que solo da forma a los textos y limita su longitud. El significado y la validación semántica están en `resolveGlobalFilter`. Eso se aparta un poco de la frase "parseo y validación en `application`" del §4: Zod hoy vive solo en presentación y el dominio no lo importa. Si prefieres lo contrario, lo cambio (D-0e).

### 3.2 Cookie de sesión

- Nombre `hub_filter` (`__Host-hub_filter` cuando `secureCookies`, igual que la cookie de sesión, D-022). `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Max-Age` ni `Expires`. `Secure` sigue el mismo ajuste que la sesión: en desarrollo local con http no se puede exigir.
- Contenido: el **preset**, no las fechas resueltas: `p=30d`, `p=T4-2026`; tipos y comparación como `t=` y `c=1`. Un rango personalizado guarda sus dos fechas, porque no tiene otra forma de repetirse. Tope de 1,5 KB: si los tipos no caben, se descartan (vuelve a "todos").
- Se valida igual que la URL. Cookie inválida o manipulada: se ignora y se borra.
- Quién la escribe: la página, al responder, cuando la URL trae parámetros válidos del filtro. Quién la lee: la página, cuando la URL no trae ninguno. Sesión nueva (cookie ausente) = por defecto.
- **Restablecer:** enlace a `?restablecer=1`. La página borra la cookie y responde 303 a la URL limpia. Funciona sin JS.

### 3.3 Funcionamiento sin JS: la regla de las fechas

El diseño muestra el campo de fechas rellenado con el rango del período elegido ("01/10/2026 – 31/12/2026, 92 d"). En un formulario GET eso crea una ambigüedad: si el usuario cambia el chip de T4 a T1, el formulario envía `periodo=T1` junto con las fechas viejas de T4, y no hay forma de saber si las tocó. Lo mismo al cambiar el año.

Regla propuesta, sin JS: el formulario envía también `desde0` y `hasta0`, que son las fechas con las que se dibujó la página. Si `desde/hasta` son **iguales** a `desde0/hasta0`, las fechas no se tocaron y mandan `periodo` y `anio`. Si **difieren**, la persona las editó y manda el rango personalizado. Al aplicar, la página responde con un 303 a la URL canónica (sin `desde0/hasta0` ni valores por defecto) y escribe la cookie en la misma respuesta. El enlace compartible queda corto: `?periodo=T4&anio=2026&tipos=…&comparar=1`.

Otros límites de "sin JS", a asumir o resolver con un script de menos de 1 KB (decisión D-0f):

- El desplegable de tipos hecho con `<details>` no se cierra al pulsar fuera ni con Esc.
- "No puede quedar vacía" no se puede impedir al desmarcar. Se resuelve en el servidor: una selección vacía vale "todos" y se avisa.
- La duración "92 d" y la caja de año previo se calculan al dibujar, así que al editar las fechas se actualizan después de "Aplicar", no mientras se escribe.

---

## 4. Casos de uso, flujo y rendimiento

### 4.1 Forma

Cada página llama a **un** caso de uso: `execute(permissions, rawFilter, pageInput?)`. Dentro:

1. Comprueba el permiso (igual que hoy, defensa en capas).
2. Lee `listTickets()` y `listSlaCycles()` (las dos consultas de hoy).
3. Calcula `dataStart`, resuelve el filtro con `resolveGlobalFilter`.
4. Filtra por tipos **una vez** (tickets por `requestType`, ciclos por el tipo de su ticket).
5. Ejecuta el cálculo existente para `window.range` y, si hay comparación, para el rango previo.
6. Devuelve `Compared<Report>` más `filter: ResolvedFilter`, que la página pasa a `GlobalFilters`.

No hay un caso de uso aparte "ResolveFilter" que lea datos: sería una tercera consulta. El módulo de resolución es una función pura que los cuatro llaman. Se añade una clase `GlobalFilterService` solo si hace falta compartir la carga de datos (`loadReportData`) entre los cuatro.

Filtrar por tipo en SLA: hoy `buildSlaReport.overall` cuenta todos los ciclos del período aunque su ticket no esté en la caché, y `byRequestType` ya los omite. Con "todos" se mantiene exactamente así (cifras iguales a las de antes). Con tipos elegidos, un ciclo sin ticket no tiene tipo y queda fuera. Se comprobará cuántos huérfanos hay con la calidad del dato (`data-quality.ts`).

### 4.2 Qué filtra el filtro global

| Cifra                                                            | Período | Tipos                |
| ---------------------------------------------------------------- | ------- | -------------------- |
| Creados, resueltos, % completadas, tiempo típico                 | sí      | sí                   |
| Abiertos hoy, en curso hoy, sin empezar hoy, abiertos por estado | no      | sí                   |
| Cumplimiento SLA (tarjetas, gráfico, tablas)                     | sí      | sí                   |
| Ciclos en curso ahora                                            | no      | sí (propuesta, D-0g) |
| Incumplimientos (KPI, barras, lista)                             | sí      | sí                   |

### 4.3 Rendimiento

- **Consultas:** el máximo de "dos por página (actual y previo)" se cumple con holgura: siguen siendo **dos lecturas** (tickets y ciclos) y el rango previo es un segundo cálculo en memoria. El cálculo se duplica, no la lectura.
- **Medición:** antes de empezar, `pnpm perf` sobre `/`, `/resumen`, `/sla`, `/incumplimientos` con la base local, más el tiempo del caso de uso (inicio a fin) con comparación apagada y encendida. Se repite al cerrar cada fase. El presupuesto del SDD (§12) sigue vigente.
- **Caché:** hoy no existe ninguna (el SDD §12 habla de agregados precalculados, pero el código calcula en memoria en cada petición). No añado una por adelantado. Si la medición lo exige, se implementa un puerto `ReportCache` con clave `{última sincronización correcta}|{inicio ISO}|{fin ISO}|{tipos ordenados o "all"}|{comparar}|{página}`. Esa clave invalida sola al terminar cada sync (el dato ya se lee en `syncStatus`) y no necesita variables de entorno nuevas. Es una decisión a tomar con números, no antes (D-0h).
- Las cabeceras siguen siendo `Cache-Control: private` por página. La respuesta que escribe la cookie no cambia eso.

---

## 5. Presentación

### 5.1 `GlobalFilters` según las imágenes

La imagen manda. Tarjeta blanca, borde `--border`, radio 16, padding 20/24. Cabecera con embudo en caja `--magenta-100`, "Filtros" y la píldora "N activos" (oculta con 0, "1 activo" en singular). Fila de controles que envuelve: chips `30 días | T1 | T2 | T3 | T4` (radios), selector "Año", campo de rango con "N d", desplegable de tipos ("Todos los tipos (5)" o "N de 5 tipos"), interruptor "Comparar", y debajo a la derecha "Restablecer" (terciario con icono) y "Aplicar" (primario con degradado, con icono de visto). Con la comparación encendida, la caja de año previo debajo.

Detalles que las imágenes aclaran y la solicitud no decía:

- Los chips de trimestre de un año en curso que aún no empiezan se muestran desactivados.
- Las dos imágenes tienen "Aplicar" y "Restablecer" en una segunda fila a la derecha; así se respeta.
- Los años del selector van del año del dato más antiguo al actual.
- El contador de las imágenes ("2 activos" con T4 y "1 de 5 tipos"; "3 activos" al encender Comparar) coincide con la regla del §3.2 de la solicitud.
- Los textos del diseño usan "dd/mm/aaaa". `DESIGN.md` §10 dice "12 nov 2026". La imagen manda en el filtro y la caja (D-0i).

### 5.2 Color de comparación

Tokens de la solicitud en la capa semántica de `tokens.css` y sección nueva "Filtros globales y comparación" en `DESIGN.md`. Cálculo de contraste, aproximado (lo confirma `scripts/check-design.mjs`, que ya mide pares):

| Par                                                       | Contraste aproximado | Umbral | Resultado   |
| --------------------------------------------------------- | -------------------- | ------ | ----------- |
| `--compare` `#643560` sobre blanco                        | > 9:1                | 4,5:1  | pasa        |
| `--compare-fill` `#BD78B8` sobre blanco                   | ≈ 3,2:1              | 3:1    | pasa justo  |
| `--compare-fill` `#BD78B8` sobre `--compare-bg` `#FFEEFE` | ≈ 2,9:1              | 3:1    | **no pasa** |
| Oscuro: `--compare` `#E2BEE0` sobre `#3C263A`             | ≈ 8:1                | 4,5:1  | pasa        |

La trama de rayas (fill sobre bg) queda por debajo de 3:1, así que cada barra previa lleva además un **borde de 1,5 px en `--compare`**. El borde sostiene el 3:1 del gráfico y la trama sigue añadiendo la segunda pista no cromática. Líneas: trazo discontinuo y un marcador distinto por métrica (círculo y cuadrado).

### 5.3 Accesibilidad

- El interruptor: `<input type="checkbox" role="switch">` con etiqueta. El estado lo expone el propio elemento; añadir `aria-checked` a un checkbox nativo es redundante y las guías ARIA lo desaconsejan. Lo anoto como pequeña desviación respecto del §4 de la solicitud.
- Chips: radios dentro de `fieldset` con leyenda "Período" (oculta visualmente). Foco visible, objetivos de 44 px.
- Todo gráfico con previo lleva leyenda con texto "Año previo" y descripción (`<desc>`) que incluye los valores previos. Las tablas de apoyo ("Ver los números de cada mes") incluyen el previo.
- El año previo nunca usa solo color: trama o discontinuo, borde, texto en leyenda y en tooltips.

### 5.4 Textos dinámicos

Los títulos salen de `describeWindow(window)` en presentación: "los últimos 30 días", "T4 2026 (hasta hoy)", "15 oct – 13 nov 2026". Los avisos "No hay datos suficientes del año previo" y "Sin datos del año previo" se muestran en la caja y en cada componente afectado. Cuando el denominador es 0, el delta es "—". Un 0 real nunca se confunde con "sin datos".

### 5.5 Deltas

La solicitud pide "+16 % vs año previo (102)". Hoy `describeDelta` devuelve una **diferencia absoluta** ("+12 frente a T3 (mismos 44 días)"). Se añade `describeComparedDelta` en `format-number.ts`:

| Tipo de cifra                                | Formato             | Ejemplo                             |
| -------------------------------------------- | ------------------- | ----------------------------------- |
| Conteo (creados, resueltos, incumplimientos) | porcentaje y previo | "+16 % vs año previo (102)"         |
| Tasa (% completadas, cumplimiento SLA)       | puntos porcentuales | "+3,2 pp vs año previo (84,0 %)"    |
| Días (tiempo típico)                         | días                | "−1,5 días vs año previo (12 días)" |
| Previo = 0 en un conteo                      | sin porcentaje      | "— vs año previo (0)"               |
| Sin dato previo                              | texto               | "Sin datos del año previo"          |

La dirección y el tono bueno/malo siguen la regla actual de `describeDelta` (`higherIs`). Con comparación encendida el delta lleva el color de comparación para la referencia y el tono bueno/malo se muestra con icono y palabra, como hoy.

---

## 6. Impacto por página (qué cambia en el archivo `.astro`)

| Página                      | Cambios                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.astro`               | Quita `quarterLabel`/`sameStretch`. Títulos con `describeWindow`. `SlaCard` con `previous`. Cuatro `KpiCard` con delta nuevo. El gráfico pasa de 6 meses fijos a cubetas del período. `BarList` con `previousCount`. Añade `GlobalFilters` bajo el encabezado. Se retira la frase "Se compara con el mismo tramo del trimestre anterior" |
| `resumen.astro`             | Quita `PeriodPicker` y su `<select>` de tipo. Añade `GlobalFilters`. Seis tarjetas, dos con `CompareNote`. La tabla por tipo se muestra siempre que haya filas, no solo cuando `requestType === null`                                                                                                                                    |
| `sla.astro`                 | Quita `PeriodPicker`. Añade `GlobalFilters`. `SlaCard`, `ComplianceChart` y las dos `ComplianceTable` con previo. "Ciclos en curso ahora" sin cambios (salvo el tipo)                                                                                                                                                                    |
| `incumplimientos.astro`     | Quita `PeriodPicker` y el `<select>` de tipo de la lista. Añade `GlobalFilters`. KPI con "N incumplimientos vs M año previo". El formulario de la lista pasa los parámetros globales como ocultos (reemplaza `periodParams`)                                                                                                             |
| `SideNav` / `navigation.ts` | Los enlaces a las cuatro páginas llevan los parámetros del filtro cuando se está en una de las cuatro. En las demás páginas van sin parámetros y la cookie hace el resto. Los enlaces entre las cuatro ("Ver el detalle de SLAs", "Siguiente") los conservan                                                                             |
| `definitions.ts`            | Entradas nuevas: período por defecto, comparación, acotado a hoy, "mismo número de días", granularidad del gráfico. Se reescriben `trimestre`, `mismo-tramo`, `periodo` y `tabla-trimestres` donde mencionaban el trimestre fijo. Cada tooltip ⓘ de una cifra comparable explica el año previo                                           |

---

## 7. Respuestas a los puntos del §8

1. **Trimestre en curso, ¿acotar ambos?** **Sí.** El actual se acota a hoy y el previo queda acotado por construcción (misma cantidad de días). El rótulo lo dice ("T4 2026, hasta hoy"). Un rango personalizado con `hasta` en el futuro también se acota. Esto cambia `/` respecto de hoy en un punto (D-0c, ver §9).
2. **Granularidad.** Sí a diario ≤ 14 días, semanal ≤ 100, mensual después, con tres ajustes: las semanas se anclan al inicio del período (no a lunes); el gráfico de SLA nunca baja de semanal; con comparación no se recortan cubetas vacías al principio. Consecuencia: **todo trimestre completo (≤ 92 días) sale semanal**; mensual solo con rangos de más de 100 días.
3. **Faltan datos del año previo.** Mostrar el mensaje, no esconder la comparación. En la caja: "Sin datos suficientes del año previo". En cada componente: "Sin datos del año previo". Con cobertura parcial, se muestra el valor y una nota "Datos del año previo desde dd/mm". No he consultado cuántos años de histórico hay en la base real (no tengo acceso a ella desde aquí); el primer paso de la Fase 1.5b es medir `min(createdAt)` y `min(startedAt)` y reportártelo antes de dibujar nada.
4. **Nombre de la fase.** **"1.5 · Filtros globales y comparación"** en la tabla del §16 del SDD, con sub-fases 1.5a, 1.5b y 1.5c (§8). El SDD ya tiene fases 0 a 5, así que 1.5 encaja entre la 1 y la 2. `docs/PLAN_FASE_1.md` existe y se deja como está.
5. **"Abiertos hoy" y "Abiertos hoy por estado".** **No se comparan**, con la nota discreta. Se añaden las otras cifras de "hoy" listadas en el §1.5 (En curso hoy, Sin empezar hoy, columna "Abiertos hoy", "Ciclos en curso ahora").
6. **Dividir el alcance.** Sí, en tres fases. Ver §8.

---

## 8. Fases y cuándo ejecutarlo respecto del rediseño visual

### 8.1 Fases

| Fase                                                  | Qué entrega                                                                                                                                                                                                                 | Páginas completas al terminar                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **1.5a · Filtro y persistencia**                      | Tokens y `DESIGN.md`; módulo de período; resolución y cookie; `GlobalFilters` **sin** interruptor; granularidad nueva; títulos dinámicos; `/` contra el período anterior; eliminar `PeriodPicker`; navegación; Definiciones | Las cuatro, filtradas por período y tipos. Se puede publicar sola |
| **1.5b · Comparación en `/` y `/resumen`**            | `Compared<T>`, cobertura, deltas, `KpiCard`, `SlaCard`, `VolumeChart`, `BarList`, `SummaryTypeTable`, `CompareLegend`, `CompareNote`, `ComparisonBox`                                                                       | `/` y `/resumen`                                                  |
| **1.5c · Comparación en `/sla` y `/incumplimientos`** | `ComplianceChart`, `ComplianceTable`, conteos de incumplimientos, prueba e2e de la barra, capturas, cierre de documentación                                                                                                 | Las cuatro                                                        |

El interruptor "Comparar" se muestra solo cuando existe en una constante de configuración la lista de páginas que ya soportan comparación. 1.5b y 1.5c se fusionan a `main` como PR separados, pero **el interruptor se enciende para todas a la vez al cerrar 1.5c**. Así no queda una página a medias a la vista de nadie, que es lo que pediste. Si prefieres publicar `/` y `/resumen` antes, se enciende en 1.5b y `/sla` e `/incumplimientos` quedan sin interruptor (decisión D-0j).

Cada fase cierra con la puerta de siempre: `pnpm lint`, `pnpm check`, `pnpm arch`, `pnpm test`, `pnpm e2e`, `pnpm format:check`, `pnpm perf` y `check-design`, más la skill `quality-gate`.

### 8.2 Dónde estamos en el rediseño y cuándo conviene

Lo que encuentro en el repositorio:

- `PLAN_DISENO.md` §10 dice "Hecho (Fases A y B)", pero `DECISIONES.md` registra la Fase C casi completa: D-073 (`/resumen`), D-074 (`/tareas`, `/sla`, `/incumplimientos`), D-075 (`/capacidad`, `/trimestres`, `/definiciones`) y D-076 (`/estado`, `/permisos`). Faltan `/aprendido` (la pantalla de Stitch se agotó dos veces) y `/login`. El §10 del plan de diseño está desactualizado.
- **Todo eso está sin confirmar:** la rama es `feat/rediseno-stitch` y hay unos 49 archivos modificados y varios borrados en el árbol de trabajo, sin commit.

**Recomendación:** ejecutar el filtro **después de cerrar y fusionar la Fase C**, en una rama nueva desde `main`. Las cuatro páginas, `KpiCard`, `SlaCard`, los gráficos, las tablas, `FilterBar`, `tokens.css` y `DESIGN.md` son exactamente los archivos que el rediseño acaba de reescribir y que aún no están confirmados. Hacerlo en paralelo mezcla dos cambios grandes sobre los mismos archivos y deja la regresión visual sin una línea base limpia.

Lo que **sí puede ir antes o en paralelo** sin riesgo: la sección de `DESIGN.md` y los tokens `--compare*` (1.5a, primer paso), porque solo añaden. Y lo que falta de la Fase C (`/aprendido` y `/login`) no toca ninguna de las cuatro páginas, así que no bloquea: basta con que `feat/rediseno-stitch` esté fusionada.

Orden propuesto: (1) commit y fusión de `feat/rediseno-stitch`; (2) tu aprobación de este plan; (3) rama `feat/filtros-globales`; (4) 1.5a, 1.5b, 1.5c.

---

## 9. Contradicciones y puntos que decidir antes de empezar (§9.3 de la solicitud)

| #   | Qué contradice                                                                                                                                                                                                                                                   | Qué propongo                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | La solicitud nombra `docs/design/`; la carpeta real es `docs/designs/`                                                                                                                                                                                           | Uso `docs/designs/`. Corrijo la referencia en el documento si lo apruebas                                                                                                                                                                                                          |
| 2   | D-072 dejó **fuera** los filtros del Resumen ejecutivo. Esta solicitud los incorpora                                                                                                                                                                             | Se registra una decisión nueva que reemplaza esa parte de D-072 (D-0a)                                                                                                                                                                                                             |
| 3   | `DESIGN.md` §7.2 habla de "Limpiar"; la solicitud y la imagen usan "Restablecer" y dicen que "Limpiar" no existe. Además `/incumplimientos` y `/tareas` usan "Limpiar" en sus filtros de lista                                                                   | Filtro global: "Restablecer". Filtros de lista: se quedan con "Limpiar", porque limpian cosas distintas. Se actualiza el §7.2 de `DESIGN.md`. Dime si prefieres otro texto para la lista                                                                                           |
| 4   | `DESIGN.md` §8 asigna **Purple 300 `#BD78B8`** como quinta serie de los gráficos; la solicitud usa el mismo color como `--compare-fill`                                                                                                                          | Las cuatro páginas usan como máximo dos series propias, así que no se cruzan. Se anota en `DESIGN.md` que el morado queda **reservado** al año previo y la quinta serie se reasigna (propongo Baby blue 500)                                                                       |
| 5   | Contraste de la trama (≈ 2,9:1)                                                                                                                                                                                                                                  | Borde de 1,5 px en `--compare` (§5.2)                                                                                                                                                                                                                                              |
| 6   | Sin comparación, la solicitud pide que `/` compare con "el período anterior de igual duración", y también que todo se vea "exactamente como hoy". Hoy `/` compara con el **mismo tramo del trimestre anterior** (los primeros N días de T3 frente a los N de T4) | La regla nueva es "los N días inmediatamente anteriores". Para T4 en curso (44 días) eso es 18 ago–30 sep, no 1 jul–13 ago. Cambia el número de `/` con comparación apagada. Alternativa: para chips de trimestre, mantener "primeros N días del trimestre anterior". Elige (D-0c) |
| 7   | `describeChange` no es "la lógica de mismos N días". Es solo un formateador. La lógica real está en `sameStretch` dentro de `buildExecutiveSummary`                                                                                                              | Se reemplaza por la ventana del módulo nuevo                                                                                                                                                                                                                                       |
| 8   | Hoy los deltas son diferencias absolutas; la solicitud da el ejemplo en porcentaje                                                                                                                                                                               | Formato del §5.5. Confirma que `/` con comparación apagada también pasa a porcentaje, o conserva el absoluto (D-0b)                                                                                                                                                                |
| 9   | "Tipos distintos de todos" cuenta como activo. "Todos" incluye los obsoletos en los totales; la selección explícita no puede incluirlos                                                                                                                          | Normalización de §2.2: la selección que coincide con todos los vigentes vale "todos"                                                                                                                                                                                               |
| 10  | "Usa `FilterBar`" choca con el componente `FilterBar` existente                                                                                                                                                                                                  | Se llama `GlobalFilters` (D-0e)                                                                                                                                                                                                                                                    |
| 11  | `role="switch"` con `aria-checked` en un checkbox nativo                                                                                                                                                                                                         | Solo `role="switch"` (§5.3)                                                                                                                                                                                                                                                        |
| 12  | SDD §12 habla de agregados precalculados y de caché de agregados; el código no tiene ninguno                                                                                                                                                                     | No es una contradicción de la solicitud, pero afecta a "cacha por período, tipos y comparación". Ver §4.3                                                                                                                                                                          |
| 13  | D-054: "nunca se excluye un incumplimiento"                                                                                                                                                                                                                      | Sigue vigente: con "todos los tipos" no se excluye ninguno. Un tipo desmarcado es una elección explícita de la persona, no una exclusión del Hub                                                                                                                                   |
| 14  | "No puede quedar vacía" y "se cierra al pulsar fuera" no son posibles sin JS                                                                                                                                                                                     | §3.3. Servidor: vacía = todos                                                                                                                                                                                                                                                      |

---

## 10. Riesgos

| Riesgo                                                                                                                                      | Mitigación                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Romper `/capacidad`, `/trimestres` o `/aprendido` al tocar helpers compartidos                                                              | Firmas congeladas (§1.6); sus pruebas deben pasar sin editarse                                                                                                                                                               |
| Que "las fórmulas no cambian" se rompa por reescribir `buildExecutiveSummary`                                                               | Prueba de equivalencia: para un mismo rango, la cifra nueva coincide con la vieja (criterio 5). Las fórmulas se ejecutan por las mismas funciones                                                                            |
| Gráficos de 4 barras por grupo muy anchos con muchas cubetas (36 meses o 13 semanas)                                                        | Se mantiene el desplazamiento lateral existente; tabla alternativa en `<details>`; prueba de captura a 1024 px                                                                                                               |
| Año previo sin datos mostrado como ceros                                                                                                    | `coverage` obligatorio en `Compared<T>` y prueba por componente                                                                                                                                                              |
| Ruido en SLA con pocos ciclos                                                                                                               | Granularidad mínima semanal y "n de m" siempre visible                                                                                                                                                                       |
| El formulario GET interpreta mal fechas viejas                                                                                              | Regla `desde0/hasta0` con pruebas (§3.3)                                                                                                                                                                                     |
| LCP: el documento crece con cuatro barras y la caja de comparación. D-076 ya midió que el LCP del servidor de desarrollo sube con el tamaño | Medir antes y después en cada fase; la tabla alternativa va en `<details>` cerrado pero está en el HTML, así que cuenta. Revisar con la compilación de producción                                                            |
| Cookie manipulada o enorme                                                                                                                  | Validación estricta, tope de 1,5 KB, se ignora y se borra                                                                                                                                                                    |
| `hide-not-block`                                                                                                                            | El filtro no cambia permisos. Los enlaces que lleven parámetros se generan solo desde `buildMenu`, que ya filtra por permiso. Se añade una comprobación de que los enlaces con parámetros no aparecen para secciones ocultas |
| Tipos de Jira que se renombran: la cookie guarda nombres                                                                                    | Un nombre desconocido se descarta y se avisa con el aviso existente de "ignorado"                                                                                                                                            |

---

## 11. Decisiones D-0xx a registrar

La última registrada es D-077 (la prueba de rendimiento de CI), así que empiezan en D-078. Las letras son provisionales hasta que se numeren al aprobar.

| Id provisional | Decisión                                                                                                                                                                | Requiere tu respuesta                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D-0a           | Los filtros globales reemplazan los de `/resumen` y la lógica "trimestre en curso" de `/`. Sustituye la parte de D-072 que dejó fuera los filtros del resumen ejecutivo | Sí (se confirma con la aprobación)                       |
| D-0b           | Formato de delta: porcentaje para conteos, puntos para tasas, días para tiempos; el previo entre paréntesis. Sobre si `/` con comparación apagada también lo usa        | **Sí**                                                   |
| D-0c           | "Período anterior" = los N días inmediatamente anteriores, también para trimestres (cambia el número de `/` frente a hoy)                                               | **Sí**                                                   |
| D-0d           | Período por defecto de 30 días, hasta hoy, en hora de Bogotá                                                                                                            | No, viene de la solicitud                                |
| D-0e           | Persistencia: URL como fuente de verdad más cookie `hub_filter` de sesión con el preset. Nombre `GlobalFilters`. Zod en presentación, resolución en dominio             | Sí en el nombre y la ubicación del parseo                |
| D-0f           | Sin JS: regla `desde0/hasta0`, selección vacía vale "todos", desplegable sin cierre por Esc. Opción de un script de menos de 1 KB                                       | **Sí**                                                   |
| D-0g           | `Ciclos en curso ahora` se filtra por tipo y no por período                                                                                                             | **Sí**                                                   |
| D-0h           | Sin caché hasta medir; clave definida en §4.3                                                                                                                           | Sí, con números                                          |
| D-0i           | Comparación con el mismo número de días, cubetas ancladas al inicio, cobertura y mensaje "Sin datos suficientes"                                                        | No, viene de la solicitud; confirma los detalles de §2.2 |
| D-0j           | Color de comparación y reserva del morado; borde en barras con trama                                                                                                    | No, viene de la solicitud                                |
| D-0k           | Interruptor encendido para todas las páginas a la vez al cerrar 1.5c                                                                                                    | **Sí**                                                   |

---

## 12. Pruebas

**Unitarias (dominio)**

- `period-window`: 30 días, `T1`–`T4`, personalizado, trimestre en curso acotado, `hasta` futuro acotado, trimestre futuro inválido, `desde > hasta`, más de 3 años.
- Frontera de Bogotá: `now` a las 23:30 y 00:30 hora local, y el cambio de día en UTC.
- Año previo: 29 feb en el inicio, rango que cruza un 29 feb, mismo número de días siempre, período anterior inmediato.
- Cubetas: diaria, semanal anclada, mensual con extremos recortados, alineación por posición, cubetas cortas, sin recorte inicial con comparación.
- Cobertura: `ok`, `partial`, `none`.
- Normalización de tipos: "todos" frente a selección explícita, obsoletos.
- Cookie y URL: parámetros inválidos, repetidos, desconocidos, cookie manipulada, vacía, enorme, `restablecer`, alias antiguos `trimestre` y `tipo`.

**Integración (casos de uso)**

- Para cada uno de los cuatro: la cifra del rango actual coincide con la que daba antes el mismo rango; con comparación apagada `previous` es `null` y no se calcula nada extra; encendida, `current` no cambia y `previous` coincide con ejecutar la fórmula en el rango previo.
- Dos lecturas de base de datos como máximo, comprobadas con un espía en el repositorio simulado.
- Tipos: filtro por ticket y por ciclo; con "todos" los ciclos sin ticket se mantienen.
- Sin datos del año previo: `coverage = 'none'` y ninguna cifra previa.

**Componentes**

- Cada componente del §1.4: sin `previous` se dibuja igual que antes (comparación del HTML contra el actual); con `previous` muestra el valor, el color de comparación y la trama o el discontinuo; con `noData` muestra el mensaje y nunca un cero.

**E2E (`tests/e2e`)**

- El filtro aparece en las cuatro páginas y en ninguna de las otras siete.
- Se conserva al navegar entre las cuatro; sesión nueva vuelve al por defecto; Restablecer vuelve al por defecto y borra la cookie.
- Funciona con JavaScript desactivado (aplicar período, tipos y comparar).
- `hide-not-block` no se rompe y los enlaces con parámetros no revelan secciones ocultas.
- Axe a 1440 y 1024 px, con comparación apagada y encendida.

**Visuales:** capturas de las cuatro páginas a 1440 y 1024 px, claro y oscuro, comparación apagada y encendida con `scripts/capture-pages.mjs`. Este script y `scripts/perf-check.mjs` ya cubren las cuatro rutas.

---

## 13. Cambios en documentación

- **SDD:** sección nueva "Filtros globales y comparación"; §5 (la tabla de páginas deja de decir "filtro por periodo" en cada fila y apunta a la sección nueva); §6 (consultas por período, en memoria); §16 (fila "1.5"). §15 sin cambios, no hay variables nuevas.
- **`docs/DECISIONES.md`:** las del §11, numeradas desde D-078.
- **`docs/DESIGN.md`:** sección "Filtros globales y comparación" y tokens; ajustes de §7.2 ("Restablecer"), §8 (reserva del morado) y §10 (fecha del filtro).
- **`docs/PLAN_DISENO.md` §10:** corregir el estado (Fase C casi completa) cuando se fusione.
- **Definiciones:** período por defecto, comparación, acotado a hoy y alineación por posición.
- **`docs/PRUEBAS.md`, `docs/ARQUITECTURA.md`, `docs/COMO_EJECUTAR.md`:** el módulo nuevo, las pruebas nuevas y cómo medir con comparación.

---

## 14. Qué no voy a cambiar sin avisarte

Fórmulas de creados, resueltos, % completadas, mediana, cumplimiento de SLA (D-042) e incumplimientos; el esquema de la base de datos; los permisos y la forma de ocultar secciones. La única cifra cuya definición cambia es el delta de `/` con comparación apagada (D-0c), y es una de las preguntas abiertas.
