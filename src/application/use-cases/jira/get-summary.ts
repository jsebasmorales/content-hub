import type { PermissionSet } from '@domain/access/permission-set';
import type { Quarter } from '@domain/jira/quarter';
import {
  recentQuarters,
  resolvePeriod,
  type RawPeriod,
  type ResolvedPeriod,
} from '@domain/jira/report-period';
import {
  buildSummaryReport,
  summaryTypeOptions,
  type SummaryReport,
} from '@domain/jira/summary-report';
import type { FilterOption } from '@domain/jira/task-list';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

export interface SummaryInput {
  readonly period: RawPeriod;
  /** As the address bar sent it: not trusted until checked against the types that exist. */
  readonly requestType: string | null | undefined;
}

export interface SummaryPage {
  readonly now: Date;
  readonly resolved: ResolvedPeriod;
  readonly quarters: readonly Quarter[];
  readonly typeOptions: readonly FilterOption[];
  /** The request type being shown, or null for all of them. */
  readonly requestType: string | null;
  readonly report: SummaryReport;
}

/** Data for /resumen: the base view of tickets, open to every role that may see the section. */
export class GetSummary {
  constructor(private readonly deps: { readonly issues: IssueRepository; readonly clock: Clock }) {}

  async execute(
    permissions: PermissionSet,
    input: SummaryInput,
  ): Promise<Result<SummaryPage, 'forbidden'>> {
    if (!permissions.has('section.summary')) return err('forbidden');
    const now = this.deps.clock.now();
    const resolved = resolvePeriod(input.period, now);
    const tickets = await this.deps.issues.listTickets();
    const typeOptions = summaryTypeOptions(tickets);
    // A type that does not exist is dropped instead of producing an empty page nobody can explain.
    const requestType =
      typeOptions.find((option) => option.value === input.requestType)?.value ?? null;
    const shown =
      requestType === null ? tickets : tickets.filter((t) => t.requestType === requestType);
    return ok({
      now,
      resolved,
      quarters: recentQuarters(now),
      typeOptions,
      requestType,
      report: buildSummaryReport({ tickets: shown, range: resolved.period.range, now }),
    });
  }
}
