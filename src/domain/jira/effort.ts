/** One status change from a ticket's history. */
export interface StatusTransition {
  readonly from: string;
  readonly to: string;
  readonly at: Date;
}

/**
 * Only `In progress` counts as active work (D-040). The pending, approval and deploy statuses are
 * waiting time, not effort.
 */
export const ACTIVE_STATUSES: readonly string[] = ['In progress'];

export interface ActiveTimeInput {
  readonly transitions: readonly StatusTransition[];
  /** Used when the ticket has no transitions at all. */
  readonly currentStatus: string;
  readonly createdAt: Date;
  /** Closes an interval that is still open. */
  readonly now: Date;
}

const normalize = (status: string): string => status.trim().toLowerCase();

/** Milliseconds a ticket spent in an active status, summed over every visit. */
export function activeTimeMs(
  input: ActiveTimeInput,
  activeStatuses: readonly string[] = ACTIVE_STATUSES,
): number {
  const active = new Set(activeStatuses.map(normalize));
  const ordered = [...input.transitions].sort((a, b) => a.at.getTime() - b.at.getTime());
  let status = ordered[0]?.from ?? input.currentStatus;
  let since = input.createdAt.getTime();
  let total = 0;
  for (const transition of ordered) {
    const at = transition.at.getTime();
    if (active.has(normalize(status))) total += Math.max(0, at - since);
    status = transition.to;
    since = at;
  }
  if (active.has(normalize(status))) total += Math.max(0, input.now.getTime() - since);
  return total;
}
