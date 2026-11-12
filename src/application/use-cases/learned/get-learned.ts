import type { PermissionSet } from '@domain/access/permission-set';
import { quarterOf, type Quarter } from '@domain/jira/quarter';
import { parseQuarterParam, recentQuarters } from '@domain/jira/report-period';
import type { LearnedVersion } from '@domain/learned/learned';
import { err, ok, type Result } from '@shared/result';
import type { UserRepository } from '../../ports/repositories';
import type { LearnedRepository } from '../../ports/learned';
import type { Clock } from '../../ports/services';

/** How many quarters back the selector offers even when nobody has written about them. */
export const LEARNED_QUARTERS_OFFERED = 8;

/** A saved version with the name of the person who wrote it. */
export interface LearnedEntry extends LearnedVersion {
  readonly authorName: string;
}

export interface LearnedPage {
  readonly quarter: Quarter;
  /** Quarters for the selector, newest first, each marked when it already has text. */
  readonly quarters: readonly { readonly quarter: Quarter; readonly written: boolean }[];
  /** What is written now, or null. */
  readonly latest: LearnedEntry | null;
  /** Every version, newest first (the first is `latest`). */
  readonly history: readonly LearnedEntry[];
  /** The address named a quarter that cannot be used, so the current one is shown. */
  readonly ignoredQuarter: boolean;
}

const same = (a: Quarter, b: Quarter): boolean => a.year === b.year && a.quarter === b.quarter;
const index = (quarter: Quarter): number => quarter.year * 4 + quarter.quarter;

/** Data for /aprendido: the text of one quarter, its versions and which quarters have text. */
export class GetLearned {
  constructor(
    private readonly deps: {
      readonly learned: LearnedRepository;
      readonly users: UserRepository;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    permissions: PermissionSet,
    rawQuarter: string | null | undefined,
  ): Promise<Result<LearnedPage, 'forbidden'>> {
    if (!permissions.has('section.learn')) return err('forbidden');
    const current = quarterOf(this.deps.clock.now());
    const asked = parseQuarterParam(rawQuarter);
    const usable = asked !== null && index(asked) <= index(current);
    const quarter = usable ? asked : current;

    const [versions, written] = await Promise.all([
      this.deps.learned.history(quarter),
      this.deps.learned.quartersWithEntries(),
    ]);
    const entries = await this.withAuthors(versions);
    const offered = [...recentQuarters(this.deps.clock.now(), undefined, LEARNED_QUARTERS_OFFERED)];
    for (const old of written) if (!offered.some((q) => same(q, old))) offered.push(old);
    offered.sort((a, b) => index(b) - index(a));

    return ok({
      quarter,
      quarters: offered.map((q) => ({ quarter: q, written: written.some((w) => same(w, q)) })),
      latest: entries[0] ?? null,
      history: entries,
      ignoredQuarter:
        rawQuarter !== null && rawQuarter !== undefined && rawQuarter !== '' && !usable,
    });
  }

  private async withAuthors(versions: readonly LearnedVersion[]): Promise<LearnedEntry[]> {
    const names = new Map<string, string>();
    for (const id of new Set(versions.map((v) => v.authorId))) {
      const user = await this.deps.users.findById(id);
      names.set(id, user?.name ?? user?.email ?? 'Persona desconocida');
    }
    return versions.map((version) => ({
      ...version,
      authorName: names.get(version.authorId) ?? 'Persona desconocida',
    }));
  }
}
