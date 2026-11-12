import type { LearnedRepository, NewLearnedVersion } from '@application/ports/learned';
import type { Quarter } from '@domain/jira/quarter';
import type { LearnedVersion } from '@domain/learned/learned';
import { newId } from '../../shared/ids';

const sameQuarter = (a: Quarter, b: Quarter): boolean =>
  a.year === b.year && a.quarter === b.quarter;

/** The same behaviour as the database repository, held in memory for fast tests. */
export class InMemoryLearnedRepository implements LearnedRepository {
  private readonly versions: LearnedVersion[] = [];

  add(input: NewLearnedVersion): Promise<LearnedVersion> {
    const version: LearnedVersion = {
      id: newId(),
      quarter: input.quarter,
      ...input.content,
      authorId: input.authorId,
      createdAt: input.createdAt,
    };
    this.versions.push(version);
    return Promise.resolve(version);
  }

  latest(quarter: Quarter): Promise<LearnedVersion | null> {
    return Promise.resolve(this.newestFirst(quarter)[0] ?? null);
  }

  history(quarter: Quarter): Promise<LearnedVersion[]> {
    return Promise.resolve(this.newestFirst(quarter));
  }

  quartersWithEntries(): Promise<Quarter[]> {
    const found: Quarter[] = [];
    for (const { quarter } of this.versions) {
      if (!found.some((known) => sameQuarter(known, quarter))) found.push(quarter);
    }
    return Promise.resolve(found.sort((a, b) => b.year * 4 + b.quarter - (a.year * 4 + a.quarter)));
  }

  /** Newest first; a later insertion breaks a tie in time, like the id does in the database. */
  private newestFirst(quarter: Quarter): LearnedVersion[] {
    return this.versions
      .map((version, order) => ({ version, order }))
      .filter(({ version }) => sameQuarter(version.quarter, quarter))
      .sort(
        (a, b) =>
          b.version.createdAt.getTime() - a.version.createdAt.getTime() || b.order - a.order,
      )
      .map(({ version }) => version);
  }
}
