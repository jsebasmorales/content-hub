import type { Quarter } from '@domain/jira/quarter';
import type { LearnedContent, LearnedVersion } from '@domain/learned/learned';

export interface NewLearnedVersion {
  readonly quarter: Quarter;
  readonly content: LearnedContent;
  readonly authorId: string;
  readonly createdAt: Date;
}

/**
 * The Leader's written conclusions per quarter. Append-only: every save is a new version, so what
 * was written before is never lost (SDD §4.3 spirit, D-061).
 */
export interface LearnedRepository {
  add(input: NewLearnedVersion): Promise<LearnedVersion>;
  /** The most recent version of a quarter, or null when nobody has written about it. */
  latest(quarter: Quarter): Promise<LearnedVersion | null>;
  /** Every version of a quarter, newest first. */
  history(quarter: Quarter): Promise<LearnedVersion[]>;
  /** The quarters that have at least one version, newest first. */
  quartersWithEntries(): Promise<Quarter[]>;
}
