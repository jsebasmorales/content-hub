import { sql } from 'drizzle-orm';
import { wireJira, type JiraApp } from '@infrastructure/compose-jira';
import { openDatabase } from '@infrastructure/db/client';
import { DbIssueRepository } from '@infrastructure/db/repositories/issue-repository';
import { DbSyncLock } from '@infrastructure/db/repositories/sync-lock';
import { DbSyncRunRepository } from '@infrastructure/db/repositories/sync-run-repository';
import { FakeJiraGateway, InMemoryIssueRepository } from '@infrastructure/fakes/in-memory-jira';
import { FakeClock } from '@infrastructure/fakes/in-memory-services';
import {
  FakeSyncLauncher,
  InMemorySyncLock,
  InMemorySyncRunRepository,
} from '@infrastructure/fakes/in-memory-sync';
import { createScratchDatabase, type AppKind } from './test-app';

export interface SyncHarness {
  readonly app: JiraApp;
  readonly jira: FakeJiraGateway;
  readonly launcher: FakeSyncLauncher;
  readonly clock: FakeClock;
  /** Wipes tickets, runs and locks, so every test starts from nothing. */
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * The Jira use cases wired to either real Postgres adapters or in-memory fakes. Jira itself is
 * always the scripted fake: no test touches the network.
 */
export async function createSyncHarness(kind: AppKind, pageSize = 100): Promise<SyncHarness> {
  const jira = new FakeJiraGateway(pageSize);
  // Tests may replace `searchIssues` to script a failure; `resetJira` puts the original back.
  const originalSearch = jira.searchIssues.bind(jira);
  const resetJira = (): void => {
    clock.set(START);
    jira.reset();
    jira.searchIssues = originalSearch;
  };
  const launcher = new FakeSyncLauncher();
  const START = new Date('2026-11-11T10:00:00Z');
  const clock = new FakeClock(START);

  if (kind === 'in-memory fakes') {
    const build = () =>
      wireJira(
        {
          jira,
          launcher,
          issues: new InMemoryIssueRepository(),
          runs: new InMemorySyncRunRepository(),
          lock: new InMemorySyncLock(),
        },
        clock,
      );
    let app = build();
    return {
      get app() {
        return app;
      },
      jira,
      launcher,
      clock,
      reset: () => {
        app = build();
        resetJira();
        launcher.launches.length = 0;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    };
  }

  const scratch = await createScratchDatabase();
  const handle = await openDatabase(scratch.url);
  await handle.migrate();
  const app = wireJira(
    {
      jira,
      launcher,
      issues: new DbIssueRepository(handle.db),
      runs: new DbSyncRunRepository(handle.db),
      lock: new DbSyncLock(handle.db),
    },
    clock,
  );
  return {
    app,
    jira,
    launcher,
    clock,
    reset: async () => {
      await handle.db.execute(sql`truncate table jira_issue, sync_run, sync_lock cascade`);
      resetJira();
      launcher.launches.length = 0;
    },
    close: async () => {
      await handle.close();
      await scratch.drop();
    },
  };
}
