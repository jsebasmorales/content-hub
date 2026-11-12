import type { Quarter } from '../jira/quarter';

/** Longest text each box accepts. Long enough for a page of notes, short enough to stay readable. */
export const LEARNED_FIELD_MAX = 8000;

/** What the Leader writes about a quarter. Three free-text boxes. */
export interface LearnedContent {
  /** What the quarter taught: the interpretation that numbers alone do not give. */
  readonly conclusions: string;
  /** The focus ("foco del Q") and priorities for the next quarter. */
  readonly nextFocus: string;
  readonly notes: string;
}

/** One saved state of a quarter's text. Saving never overwrites: it adds a new version. */
export interface LearnedVersion extends LearnedContent {
  readonly id: string;
  readonly quarter: Quarter;
  readonly authorId: string;
  readonly createdAt: Date;
}

export type LearnedProblem = 'empty' | 'too-long';

/** Same text with the same line breaks on every device, and no stray spaces around it. */
export function normalizeContent(input: LearnedContent): LearnedContent {
  const clean = (value: string): string => value.replace(/\r\n?/g, '\n').trim();
  return {
    conclusions: clean(input.conclusions),
    nextFocus: clean(input.nextFocus),
    notes: clean(input.notes),
  };
}

/** Why a (normalized) text cannot be saved, or null when it can. */
export function contentProblem(content: LearnedContent): LearnedProblem | null {
  const boxes = [content.conclusions, content.nextFocus, content.notes];
  if (boxes.every((box) => box === '')) return 'empty';
  if (boxes.some((box) => box.length > LEARNED_FIELD_MAX)) return 'too-long';
  return null;
}

export function sameContent(a: LearnedContent, b: LearnedContent): boolean {
  return a.conclusions === b.conclusions && a.nextFocus === b.nextFocus && a.notes === b.notes;
}
