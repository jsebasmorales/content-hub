import type { PermissionSet } from '@domain/access/permission-set';
import {
  buildFilterOptions,
  matchesFilter,
  paginate,
  sanitizeFilter,
  sortByRecentActivity,
  type PageOf,
  type TaskFilter,
  type TaskFilterOptions,
} from '@domain/jira/task-list';
import type { Ticket } from '@domain/jira/ticket';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';

export interface ListTasksInput {
  /** As the address bar sent them: not trusted until sanitised. */
  readonly filter: Partial<Record<keyof TaskFilter, string | null | undefined>>;
  readonly page: number;
}

export interface TaskList {
  readonly filter: TaskFilter;
  readonly options: TaskFilterOptions;
  readonly tasks: PageOf<Ticket>;
  /** Tickets in the cache, before filtering. */
  readonly totalInCache: number;
}

/** The /tareas list: filtered, newest activity first, one page at a time. */
export class ListTasks {
  constructor(private readonly deps: { readonly issues: IssueRepository }) {}

  async execute(
    permissions: PermissionSet,
    input: ListTasksInput,
  ): Promise<Result<TaskList, 'forbidden'>> {
    if (!permissions.has('section.work')) return err('forbidden');
    const all = await this.deps.issues.listTickets();
    const options = buildFilterOptions(all);
    const filter = sanitizeFilter(input.filter, options);
    const matching = sortByRecentActivity(all.filter((ticket) => matchesFilter(ticket, filter)));
    return ok({
      filter,
      options,
      tasks: paginate(matching, input.page),
      totalInCache: all.length,
    });
  }
}
