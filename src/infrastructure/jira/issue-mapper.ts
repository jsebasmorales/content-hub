import type { IssueSnapshot, JiraError } from '@application/ports/jira';
import type { StatusTransition } from '@domain/jira/effort';
import type { SlaCycle, SlaMetric } from '@domain/jira/sla';
import type { StatusCategory } from '@domain/jira/ticket';
import { err, ok, type Result } from '@shared/result';
import { slaFieldSchema, type History, type RawIssue, type SlaFieldValue } from './jira-schemas';

export interface SlaFieldIds {
  readonly firstResponse: string;
  readonly done: string;
}

const invalid = (message: string): JiraError => ({ kind: 'invalid_response', message });

/**
 * Jira writes offsets as `+0100`, which is not strict ISO 8601. Normalising to `+01:00` makes the
 * parse the same on every JavaScript engine.
 */
export function parseJiraDate(value: string): Date | null {
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

const CATEGORIES: readonly StatusCategory[] = ['new', 'indeterminate', 'done'];

/** Unknown categories (Jira also has "undefined") are treated as work in flight, never as done. */
function toCategory(key: string): StatusCategory {
  return CATEGORIES.find((category) => category === key) ?? 'indeterminate';
}

export function mapTransitions(
  histories: readonly History[],
): Result<StatusTransition[], JiraError> {
  const transitions: StatusTransition[] = [];
  for (const history of histories) {
    const at = parseJiraDate(history.created);
    if (at === null) return err(invalid('A history entry has an unreadable date'));
    for (const item of history.items) {
      if (item.field !== 'status') continue;
      transitions.push({ from: item.fromString ?? '', to: item.toString ?? '', at });
    }
  }
  return ok(transitions.sort((a, b) => a.at.getTime() - b.at.getTime()));
}

function mapCycles(metric: SlaMetric, field: SlaFieldValue): SlaCycle[] {
  if (!field) return [];
  const toDate = (time: { epochMillis: number } | null | undefined): Date | null =>
    time ? new Date(time.epochMillis) : null;
  const completed = field.completedCycles.map((cycle): SlaCycle => ({
    metric,
    state: 'completed',
    startedAt: new Date(cycle.startTime.epochMillis),
    stoppedAt: toDate(cycle.stopTime),
    breachAt: toDate(cycle.breachTime),
    breached: cycle.breached,
    paused: false,
  }));
  const open = field.ongoingCycle;
  if (!open) return completed;
  return [
    ...completed,
    {
      metric,
      state: 'ongoing',
      startedAt: new Date(open.startTime.epochMillis),
      stoppedAt: null,
      breachAt: toDate(open.breachTime),
      breached: open.breached,
      paused: open.paused ?? false,
    },
  ];
}

function readSla(
  metric: SlaMetric,
  fields: Readonly<Record<string, unknown>>,
  fieldId: string,
): Result<SlaCycle[], JiraError> {
  const parsed = slaFieldSchema.safeParse(fields[fieldId]);
  return parsed.success
    ? ok(mapCycles(metric, parsed.data))
    : err(invalid(`SLA field ${fieldId} has an unexpected shape`));
}

/**
 * When a ticket was finished. This Jira's workflow moves tickets to Done without filling the
 * "Resolution" field (checked on the live project, 2026-11-12), so `resolutiondate` is always
 * empty. The moment the ticket entered the done category is the reliable substitute. A ticket
 * that is not done again (reopened) has no finish date.
 */
function resolvedAt(raw: RawIssue['fields'], category: StatusCategory): Date | null {
  if (category !== 'done') return null;
  const finished = raw.resolutiondate ?? raw.statuscategorychangedate;
  return finished ? parseJiraDate(finished) : null;
}

/**
 * Turns one validated Jira issue into what the Hub stores. `histories` is the full status
 * history (the caller completes it when the embedded one was cut short).
 */
export function mapIssue(
  raw: RawIssue,
  histories: readonly History[],
  slaFields: SlaFieldIds,
): Result<IssueSnapshot, JiraError> {
  const created = parseJiraDate(raw.fields.created);
  const updated = parseJiraDate(raw.fields.updated);
  const resolved = resolvedAt(raw.fields, toCategory(raw.fields.status.statusCategory.key));
  if (created === null || updated === null) {
    return err(invalid(`Issue ${raw.key} has an unreadable date`));
  }
  const transitions = mapTransitions(histories);
  const response = readSla('first_response', raw.fields, slaFields.firstResponse);
  const done = readSla('done', raw.fields, slaFields.done);
  if (!transitions.ok) return transitions;
  if (!response.ok) return response;
  if (!done.ok) return done;

  const { fields } = raw;
  return ok({
    ticket: {
      key: raw.key,
      summary: fields.summary,
      status: fields.status.name,
      statusCategory: toCategory(fields.status.statusCategory.key),
      requestType: fields.issuetype.name,
      priority: fields.priority?.name ?? null,
      assigneeId: fields.assignee?.accountId ?? null,
      assigneeName: fields.assignee?.displayName ?? null,
      requesterId: fields.reporter?.accountId ?? null,
      requesterName: fields.reporter?.displayName ?? null,
      createdAt: created,
      resolvedAt: resolved,
      updatedAt: updated,
    },
    transitions: transitions.value,
    slaCycles: [...response.value, ...done.value],
  });
}
