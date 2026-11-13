import type { PermissionSet } from '@domain/access/permission-set';
import { decideAccess } from '@domain/access/route-access';
import {
  BALANCE_TOLERANCE,
  MIN_BAND,
  PACE_MONTHS,
  RECENT_DAYS,
  TEAM_MEMBERS,
} from '@domain/jira/capacity';
import { SUPPORTED_TIME_ZONES } from '@domain/access/time-zone';
import { QUARTERS_SHOWN } from '@domain/jira/quarterly';
import { SLA_TARGET_PERCENT } from '@domain/jira/sla-compliance';
import {
  LAZY_SYNC_MIN_INTERVAL_MS,
  LAZY_SYNC_STALE_AFTER_MS,
  MAX_DELETE_SHARE,
} from '@domain/jira/sync-policy';
import { TASKS_PER_PAGE } from '@domain/jira/task-list';
import { PHONE_ROWS } from './phone-split';
import { findRoute } from './routes';

/** A page where the figure can be seen. The page filters these by what the reader may open. */
export interface DefinitionLink {
  readonly label: string;
  readonly href: string;
}

export interface Definition {
  /** Stable name for links to this entry: `/definiciones#sla-cumple`. */
  readonly id: string;
  /** What the reader sees in the dashboard, spelled the same way. */
  readonly term: string;
  /** What it means, in plain words. */
  readonly meaning: string;
  /** How it is worked out, when that is not obvious from the meaning. */
  readonly how?: string;
  readonly seenIn: readonly DefinitionLink[];
}

export interface DefinitionGroup {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly items: readonly Definition[];
}

const minutes = (ms: number): number => Math.round(ms / 60_000);
const percent = (share: number): number => Math.round(share * 100);

const EXEC = { label: 'Resumen ejecutivo', href: '/' };
const SUMMARY = { label: 'Resumen', href: '/resumen' };
const TASKS = { label: 'Tareas', href: '/tareas' };
const SLA = { label: 'SLAs', href: '/sla' };
const BREACHES = { label: 'SLAs incumplidos', href: '/incumplimientos' };
const CAPACITY = { label: 'Capacidad', href: '/capacidad' };
const QUARTERS = { label: 'Trimestre a trimestre', href: '/trimestres' };
const STATUS = { label: 'Estado', href: '/estado' };
const LEARNED = { label: 'Lo aprendido', href: '/aprendido' };

const dataGroup: DefinitionGroup = {
  id: 'datos',
  title: 'De dónde salen los datos y hasta cuándo',
  intro:
    'Todo lo que muestra el Hub viene de Jira, que es la fuente de verdad. El Hub solo lee: no crea ni cambia ningún ticket.',
  items: [
    {
      id: 'fecha-de-corte',
      term: 'Fecha de corte',
      meaning:
        'El momento de la última actualización correcta desde Jira. Todo lo que ves está calculado con los datos de ese momento; lo que cambie en Jira después no aparece hasta la siguiente actualización.',
      how: `Los datos se actualizan solos al abrir una página si tienen más de ${String(minutes(LAZY_SYNC_STALE_AFTER_MS))} minutos (como máximo una vez cada ${String(minutes(LAZY_SYNC_MIN_INTERVAL_MS))} minutos, aunque entre mucha gente) y cuando un Líder pulsa "Resincronizar con Jira". Si una actualización falla, se siguen mostrando los últimos datos buenos y la página lo avisa.`,
      seenIn: [EXEC, STATUS],
    },
    {
      id: 'zona-horaria',
      term: 'Hora y zona horaria',
      meaning: `Cada persona elige en su perfil (tu nombre, al pie del menú) la zona en la que ve las horas: ${SUPPORTED_TIME_ZONES.map((zone) => zone.label).join(', ')}. Por defecto es la de Bogotá. Es una preferencia personal: solo cambia cómo ves las horas, no las cifras.`,
      how: 'Para agrupar por mes y por trimestre se usa siempre la hora de Bogotá, de modo que los totales sean los mismos para todo el equipo, la veas en la zona que la veas.',
      seenIn: [SLA, BREACHES, STATUS],
    },
    {
      id: 'tickets-borrados',
      term: 'Tickets borrados en Jira',
      meaning:
        'Si un ticket desaparece de Jira, desaparece también del Hub, pero solo cuando se hace una lectura completa.',
      how: `Como protección ante un fallo de Jira, nunca se borra de golpe más del ${String(percent(MAX_DELETE_SHARE))} % de lo guardado.`,
      seenIn: [STATUS],
    },
  ],
};

const ticketsGroup: DefinitionGroup = {
  id: 'tickets',
  title: 'Tickets',
  intro: 'Las cifras base: cuántos tickets entran, cuántos se cierran y cuántos siguen abiertos.',
  items: [
    {
      id: 'creados',
      term: 'Creados',
      meaning: 'Tickets cuya fecha de creación cae dentro del periodo elegido.',
      seenIn: [EXEC, SUMMARY, QUARTERS],
    },
    {
      id: 'completados',
      term: 'Completados en el periodo (resueltos)',
      meaning:
        'Tickets que pasaron a Hecho dentro del periodo, sin importar cuándo se crearon. Un ticket creado en un trimestre y cerrado en el siguiente cuenta como creado en el primero y completado en el segundo. Por eso puede haber más completados que creados.',
      how: 'La fecha de finalización es el momento en que el ticket entró en la categoría Hecho de Jira. Se usa esa fecha porque el flujo de Jira no rellena el campo "Resolución". Si un ticket se reabre, deja de contar como completado hasta que vuelva a cerrarse.',
      seenIn: [EXEC, SUMMARY, QUARTERS],
    },
    {
      id: 'porcentaje-completadas',
      term: '% de lo creado ya completado',
      meaning:
        'De los tickets creados en el periodo, el porcentaje que ya está completado hoy. No cuenta los tickets creados antes, aunque se hayan completado dentro del periodo.',
      how: 'Creados en el periodo que hoy están en Hecho, divididos entre los creados en el periodo. En un periodo reciente el porcentaje es más bajo simplemente porque los tickets han tenido menos tiempo para cerrarse. Ejemplo: un tipo con 2 creados (los dos siguen abiertos) y 5 completados en el periodo (todos creados antes) muestra 0 %: los 5 completados salieron de trabajo anterior.',
      seenIn: [SUMMARY],
    },
    {
      id: 'tipos-obsoletos',
      term: 'Tipos de solicitud obsoletos',
      meaning:
        'Tipos que Jira marca como retirados. No aparecen en la tabla por tipo ni en el filtro, pero sus tickets sí cuentan en los totales, así que la suma de la tabla puede ser menor que el total.',
      seenIn: [SUMMARY],
    },
    {
      id: 'abiertos',
      term: 'Abiertos',
      meaning:
        'Tickets que todavía no están en la categoría Hecho de Jira, sea cual sea su antigüedad.',
      seenIn: [EXEC, SUMMARY, CAPACITY],
    },
    {
      id: 'en-curso-sin-empezar',
      term: 'En curso hoy / Sin empezar hoy',
      meaning:
        'El estado de hoy de los tickets abiertos, según la categoría que les da Jira. "En curso" incluye los tickets que están en trabajo y los que esperan algo (aprobación, traducción, despliegue); "Sin empezar" son los que nadie ha empezado.',
      how: 'Son una foto de hoy, no del periodo elegido.',
      seenIn: [SUMMARY, CAPACITY],
    },
    {
      id: 'tiempo-tipico',
      term: 'Tiempo típico de resolución',
      meaning:
        'Los días naturales que suele tardar un ticket desde que se crea hasta que se completa.',
      how: 'Es la mediana (el valor del medio) de los tickets completados en el periodo, no el promedio, para que unos pocos tickets muy antiguos no distorsionen la cifra.',
      seenIn: [EXEC, SUMMARY, QUARTERS],
    },
    {
      id: 'tipo-de-solicitud',
      term: 'Tipo de solicitud',
      meaning:
        'La clase de petición del ticket (por ejemplo, UX Writing for Features). Es el tipo de incidencia de Jira.',
      how: 'Los tipos que el equipo ha retirado en Jira (los que llevan "DON\'T USE" en el nombre) no aparecen en los desgloses ni en los filtros, pero sus tickets siguen contando en los totales.',
      seenIn: [SUMMARY, TASKS, BREACHES],
    },
    {
      id: 'trimestre',
      term: 'Trimestre',
      meaning:
        'Trimestre natural (T1 de enero a marzo, T2 de abril a junio, etc.), en hora de Bogotá.',
      seenIn: [EXEC, SLA, QUARTERS],
    },
    {
      id: 'mismo-tramo',
      term: 'Mismo tramo del trimestre anterior',
      meaning:
        'Para comparar el trimestre en curso con el anterior sin engañar, se compara con el mismo número de días del anterior: si van 43 días de T4, se compara con los primeros 43 días de T3.',
      seenIn: [EXEC],
    },
    {
      id: 'tabla-trimestres',
      term: 'Trimestres que se muestran',
      meaning: `La comparativa trimestre a trimestre mira hasta ${String(QUARTERS_SHOWN)} trimestres hacia atrás, empezando por el primero que tiene datos. El trimestre en curso se marca como parcial.`,
      seenIn: [QUARTERS],
    },
  ],
};

const slaGroup: DefinitionGroup = {
  id: 'sla',
  title: 'SLAs',
  intro:
    'Jira calcula el reloj de cada SLA con su calendario laboral y sus pausas. El Hub no lo recalcula: cuenta el resultado.',
  items: [
    {
      id: 'sla-metricas',
      term: 'Primera respuesta y Resolución',
      meaning:
        'Las dos métricas de SLA. "Primera respuesta" mide el tiempo hasta responder al solicitante; "Resolución" (Time to done) mide el tiempo hasta completar el ticket. Los plazos son los configurados hoy en Jira.',
      seenIn: [EXEC, SLA, QUARTERS],
    },
    {
      id: 'sla-meta',
      term: 'Meta de SLA',
      meaning: `Cada métrica debe llegar al ${String(SLA_TARGET_PERCENT)} % de cumplimiento por separado. Si una sola se queda por debajo, la meta no se cumple, aunque la otra vaya muy bien.`,
      seenIn: [EXEC, SLA, QUARTERS],
    },
    {
      id: 'sla-ciclo',
      term: 'Ciclo',
      meaning:
        'Una vuelta del reloj de un SLA en un ticket. Un ticket suele tener un ciclo por métrica, y más de uno si se reabre: cada reapertura empieza un ciclo nuevo.',
      seenIn: [SLA, BREACHES],
    },
    {
      id: 'sla-cumple',
      term: 'Cumplido / incumplido',
      meaning:
        'El % de cumplimiento es: ciclos cumplidos entre ciclos medidos (cumplidos más incumplidos).',
      how: 'Un ciclo terminado cuenta como cumplido o incumplido según Jira. Un ciclo que sigue corriendo y ya pasó su límite cuenta como incumplido. Un ciclo que sigue corriendo dentro de plazo todavía no se ha decidido, así que no cuenta. Un ciclo en pausa tampoco cuenta. Cada ciclo terminado cuenta en el periodo en que terminó.',
      seenIn: [EXEC, SLA, BREACHES, QUARTERS],
    },
    {
      id: 'sla-retraso',
      term: 'Retraso',
      meaning:
        'El tiempo real que pasó desde el límite del ciclo hasta que terminó (o hasta hoy, si sigue corriendo).',
      how: 'Es tiempo de reloj, no horas laborables: un retraso de un fin de semana se ve de dos días aunque en horas laborables sea menor.',
      seenIn: [BREACHES],
    },
    {
      id: 'sla-pausa',
      term: 'Ciclo en pausa',
      meaning:
        'Un reloj que Jira ha detenido (por ejemplo, mientras se espera algo). Mientras está en pausa no cuenta como incumplido ni como cumplido.',
      seenIn: [SLA, STATUS],
    },
    {
      id: 'sla-cerrado-abierto',
      term: 'Ciclo abierto en un ticket cerrado',
      meaning:
        'Un reloj que Jira nunca detuvo aunque el ticket ya está en Hecho (por ejemplo, porque nunca hubo un comentario al cliente). Si ya pasó su límite, cuenta como incumplido y aparece marcado en SLAs incumplidos; como nadie puede actuar sobre él, no sale en la lista de ciclos en curso.',
      seenIn: [SLA, BREACHES, STATUS],
    },
  ],
};

const capacityGroup: DefinitionGroup = {
  id: 'capacidad',
  title: 'Capacidad',
  intro:
    'Mide cómo se reparte el trabajo abierto entre las personas del equipo y si entra más trabajo del que sale.',
  items: [
    {
      id: 'capacidad-carga',
      term: 'Carga',
      meaning:
        'Hoy la carga de una persona es su número de tareas abiertas: todas pesan lo mismo. Más adelante se podrá medir con puntos de esfuerzo para que una tarea difícil pese más.',
      seenIn: [CAPACITY],
    },
    {
      id: 'capacidad-equipo',
      term: 'El equipo',
      meaning: `El análisis incluye solo a ${String(TEAM_MEMBERS.length)} personas: ${TEAM_MEMBERS.join(', ')}. Las demás personas con tareas en el proyecto son de otros equipos y no entran en ninguna cifra de Capacidad, pero la página las nombra en "Fuera del análisis". Todas las del equipo aparecen aunque no tengan nada abierto.`,
      seenIn: [CAPACITY],
    },
    {
      id: 'capacidad-equilibrio',
      term: 'En equilibrio / por encima / por debajo',
      meaning: `Se compara la carga de cada persona con el promedio del equipo. Se considera equilibrada a menos de ±${String(percent(BALANCE_TOLERANCE))} % del promedio, y nunca con un margen menor de ${String(MIN_BAND)} tarea (con pocas tareas, una de diferencia no es un desequilibrio).`,
      seenIn: [CAPACITY],
    },
    {
      id: 'capacidad-ritmo',
      term: 'Entran / salen por mes',
      meaning: `Las tareas que se crean y las que se completan cada mes, en promedio de los últimos ${String(PACE_MONTHS)} meses completos (sin contar el mes en curso). Cuentan las tareas del equipo y las que nadie tiene asignadas.`,
      seenIn: [CAPACITY],
    },
    {
      id: 'capacidad-vaciar',
      term: 'Meses para vaciar la cola',
      meaning:
        'La cola actual dividida entre lo que sale por mes, como si no entrara nada nuevo. Es una referencia para dimensionar, no una predicción.',
      seenIn: [CAPACITY],
    },
    {
      id: 'capacidad-terminadas',
      term: 'Terminó (90 días)',
      meaning: `Las tareas que la persona completó en los últimos ${String(RECENT_DAYS)} días.`,
      how: 'Se atribuye a quien tiene la tarea asignada hoy, no a quien la tuvo antes: el Hub no guarda el historial de asignaciones.',
      seenIn: [CAPACITY],
    },
    {
      id: 'sin-responsable',
      term: 'Sin responsable',
      meaning:
        'Tareas abiertas que nadie tiene asignadas. No entran en el promedio por persona, pero sí en la cola.',
      seenIn: [CAPACITY, STATUS],
    },
  ],
};

const presentationGroup: DefinitionGroup = {
  id: 'lectura',
  title: 'Cómo leer las páginas',
  intro: 'Reglas de presentación que se repiten en todo el Hub.',
  items: [
    {
      id: 'paginas',
      term: 'Listas largas',
      meaning: `Las listas se muestran de ${String(TASKS_PER_PAGE)} en ${String(TASKS_PER_PAGE)}. En el móvil se ven primero las ${String(PHONE_ROWS)} más importantes y el resto queda tras "Ver más".`,
      seenIn: [TASKS, BREACHES],
    },
    {
      id: 'periodo',
      term: 'Periodo',
      meaning:
        'Puedes elegir un trimestre con un clic o un rango de fechas propio (hasta 3 años, con el último día incluido). Si el periodo pedido no es válido, se muestra el trimestre en curso y la página lo avisa.',
      seenIn: [SLA, BREACHES, SUMMARY],
    },
    {
      id: 'personas',
      term: 'Nombres de personas',
      meaning: 'Se guardan solo los nombres que muestra Jira, nunca los correos de las cuentas.',
      seenIn: [TASKS, CAPACITY],
    },
    {
      id: 'lo-aprendido',
      term: 'Lo aprendido',
      meaning:
        'Texto que escribe el Líder para cada trimestre: sus conclusiones y el foco del siguiente. No sale de Jira ni se calcula: es interpretación humana. Cada guardado crea una versión nueva y las anteriores se conservan.',
      seenIn: [LEARNED],
    },
  ],
};

/** Every definition the page shows, in reading order. Numbers come from the code that uses them. */
export function buildDefinitionGroups(): readonly DefinitionGroup[] {
  return [dataGroup, ticketsGroup, slaGroup, capacityGroup, presentationGroup];
}

/**
 * The pages from `seenIn` that this reader may open. A definition never links to a page the person
 * cannot see: that would be a "no access" trace the menu is built to avoid (SDD §10.3).
 */
export function visibleLinks(
  links: readonly DefinitionLink[],
  permissions: PermissionSet,
): readonly DefinitionLink[] {
  return links.filter((link) => {
    const route = findRoute(link.href);
    return route !== undefined && decideAccess(route.access, { permissions }) === 'allow';
  });
}

/** Lower case without accents, so "tiempo tipico" finds "Tiempo típico". */
const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The longest search the page takes. */
export const MAX_DEFINITION_SEARCH = 80;

/**
 * Keeps the definitions whose term, meaning or method contains every word of `query`. A group with
 * no match disappears. An empty search keeps everything. Works on the page's own static text:
 * nothing about tickets or people is searched.
 */
export function filterDefinitionGroups(
  groups: readonly DefinitionGroup[],
  query: string,
): readonly DefinitionGroup[] {
  const words = plain(query.slice(0, MAX_DEFINITION_SEARCH))
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const text = plain(`${item.term} ${item.meaning} ${item.how ?? ''}`);
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
