import type { StatusCategory } from '@domain/jira/ticket';
import type { IconName } from './icons';
import type { StatusKind } from './status-kind';

/**
 * How a ticket's Jira status is drawn (DESIGN.md §7.7): the color follows Jira's own category, the
 * word is the status exactly as Jira names it, and an icon backs both so color is never alone.
 */
export const TICKET_STATUS_CHIP: Record<StatusCategory, { kind: StatusKind; icon: IconName }> = {
  new: { kind: 'neutral', icon: 'minus' },
  indeterminate: { kind: 'info', icon: 'clock' },
  done: { kind: 'success', icon: 'check-circle' },
};
