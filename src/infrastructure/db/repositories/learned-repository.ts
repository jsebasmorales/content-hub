import { and, desc, eq } from 'drizzle-orm';
import type { LearnedRepository, NewLearnedVersion } from '@application/ports/learned';
import type { Quarter } from '@domain/jira/quarter';
import type { LearnedVersion } from '@domain/learned/learned';
import type { Database } from '../client';
import { learnedEntry } from '../schema';

function toVersion(row: typeof learnedEntry.$inferSelect): LearnedVersion {
  const quarter = row.quarterNumber;
  if (quarter !== 1 && quarter !== 2 && quarter !== 3 && quarter !== 4) {
    throw new Error(`learned_entry ${row.id} has an impossible quarter`);
  }
  return {
    id: row.id,
    quarter: { year: row.quarterYear, quarter },
    conclusions: row.conclusions,
    nextFocus: row.nextFocus,
    notes: row.notes,
    authorId: row.authorId,
    createdAt: row.createdAt,
  };
}

/** Newest first. Ids are UUID v7, so they break ties between two saves in the same millisecond. */
const newestFirst = [desc(learnedEntry.createdAt), desc(learnedEntry.id)];

const ofQuarter = (quarter: Quarter) =>
  and(eq(learnedEntry.quarterYear, quarter.year), eq(learnedEntry.quarterNumber, quarter.quarter));

export class DbLearnedRepository implements LearnedRepository {
  constructor(private readonly db: Database) {}

  async add(input: NewLearnedVersion): Promise<LearnedVersion> {
    const [row] = await this.db
      .insert(learnedEntry)
      .values({
        quarterYear: input.quarter.year,
        quarterNumber: input.quarter.quarter,
        conclusions: input.content.conclusions,
        nextFocus: input.content.nextFocus,
        notes: input.content.notes,
        authorId: input.authorId,
        createdAt: input.createdAt,
      })
      .returning();
    if (!row) throw new Error('learned_entry insert returned no row');
    return toVersion(row);
  }

  async latest(quarter: Quarter): Promise<LearnedVersion | null> {
    const [row] = await this.db
      .select()
      .from(learnedEntry)
      .where(ofQuarter(quarter))
      .orderBy(...newestFirst)
      .limit(1);
    return row ? toVersion(row) : null;
  }

  async history(quarter: Quarter): Promise<LearnedVersion[]> {
    const rows = await this.db
      .select()
      .from(learnedEntry)
      .where(ofQuarter(quarter))
      .orderBy(...newestFirst);
    return rows.map(toVersion);
  }

  async quartersWithEntries(): Promise<Quarter[]> {
    const rows = await this.db
      .selectDistinct({ year: learnedEntry.quarterYear, quarter: learnedEntry.quarterNumber })
      .from(learnedEntry)
      .orderBy(desc(learnedEntry.quarterYear), desc(learnedEntry.quarterNumber));
    return rows.flatMap(({ year, quarter }) =>
      quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4 ? [{ year, quarter }] : [],
    );
  }
}
