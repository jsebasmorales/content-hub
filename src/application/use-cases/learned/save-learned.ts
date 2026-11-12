import { quarterOf, type Quarter } from '@domain/jira/quarter';
import {
  contentProblem,
  normalizeContent,
  sameContent,
  type LearnedContent,
  type LearnedProblem,
} from '@domain/learned/learned';
import { err, ok, type Result } from '@shared/result';
import type { LearnedRepository } from '../../ports/learned';
import type { AuditLog, Clock } from '../../ports/services';
import type { Principal } from '../resolve-session';

export type SaveLearnedError = 'forbidden' | 'invalid-quarter' | LearnedProblem;
export type SaveLearnedOutcome = 'saved' | 'unchanged';

export interface SaveLearnedInput {
  /** Null when the address named no real quarter. */
  readonly quarter: Quarter | null;
  readonly content: LearnedContent;
  readonly ip: string | null;
}

const quarterIndex = (quarter: Quarter): number => quarter.year * 4 + quarter.quarter;

/**
 * Saves the Leader's text for a quarter as a new version. The permission is checked here as well as
 * by the route, so the rule holds wherever this is called from (SDD §10.3).
 */
export class SaveLearned {
  constructor(
    private readonly deps: {
      readonly learned: LearnedRepository;
      readonly audit: AuditLog;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    actor: Principal,
    input: SaveLearnedInput,
  ): Promise<Result<SaveLearnedOutcome, SaveLearnedError>> {
    const { permissions } = actor;
    if (!permissions.has('section.learn') || !permissions.has('action.learnedit')) {
      return err('forbidden');
    }
    const now = this.deps.clock.now();
    // A quarter that has not started has nothing to conclude yet.
    if (input.quarter === null || quarterIndex(input.quarter) > quarterIndex(quarterOf(now))) {
      return err('invalid-quarter');
    }
    const content = normalizeContent(input.content);
    const problem = contentProblem(content);
    if (problem !== null) return err(problem);

    const previous = await this.deps.learned.latest(input.quarter);
    // Pressing "Guardar" twice, or without changes, must not pile up identical versions.
    if (previous !== null && sameContent(previous, content)) return ok('unchanged');

    const version = await this.deps.learned.add({
      quarter: input.quarter,
      content,
      authorId: actor.user.id,
      createdAt: now,
    });
    await this.deps.audit.record({
      actorId: actor.user.id,
      action: 'learned.saved',
      targetType: 'learned_entry',
      targetId: version.id,
      // Sizes, not the text itself: the text is kept in its own table, with its authorship.
      after: {
        quarter: `${String(input.quarter.year)}-T${String(input.quarter.quarter)}`,
        characters: content.conclusions.length + content.nextFocus.length + content.notes.length,
      },
      ip: input.ip,
    });
    return ok('saved');
  }
}
