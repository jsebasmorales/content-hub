import { z } from 'zod';
import type { ListTasksInput } from '@application/use-cases/jira/list-tasks';
import type { TaskFilter } from '@domain/jira/task-list';

/** Names of the filters in the address bar of /tareas, in the team's own language. */
const PARAMS = {
  requestType: 'tipo',
  status: 'estado',
  requesterId: 'solicitante',
  assigneeId: 'asignado',
  text: 'buscar',
} as const satisfies Record<keyof TaskFilter, string>;

const text = z.string().max(200).optional();

const query = z.object({
  [PARAMS.requestType]: text,
  [PARAMS.status]: text,
  [PARAMS.requesterId]: text,
  [PARAMS.assigneeId]: text,
  [PARAMS.text]: text,
  pagina: z
    .string()
    .regex(/^\d{1,5}$/)
    .optional(),
});

/**
 * Reads the filters and the page from the address. Anything malformed counts as "no filter";
 * whether a value really exists is decided later against the data, never here.
 */
export function parseTasksQuery(params: URLSearchParams): ListTasksInput {
  const parsed = query.safeParse(Object.fromEntries(params));
  const value = parsed.success ? parsed.data : {};
  return {
    filter: {
      requestType: value[PARAMS.requestType],
      status: value[PARAMS.status],
      requesterId: value[PARAMS.requesterId],
      assigneeId: value[PARAMS.assigneeId],
      text: value[PARAMS.text],
    },
    page: value.pagina === undefined ? 1 : Number(value.pagina),
  };
}

/** The address of a page of the list with the given filters, so links keep what was chosen. */
export function tasksHref(filter: TaskFilter, page: number): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(PARAMS) as (keyof TaskFilter)[]) {
    const chosen = filter[key];
    if (chosen !== null) params.set(PARAMS[key], chosen);
  }
  if (page > 1) params.set('pagina', String(page));
  const search = params.toString();
  return search === '' ? '/tareas' : `/tareas?${search}`;
}

export const TASKS_PARAM_NAMES = PARAMS;
