import type { SyncKind, SyncLauncher, SyncMode } from '@application/ports/sync';
import type { RunJiraSync } from '@application/use-cases/jira/run-jira-sync';

/**
 * Local development only: there is no Netlify function under `astro dev`, so the sync runs inside
 * the dev server instead, still without making the caller wait. Never used in production.
 */
export class InlineSyncLauncher implements SyncLauncher {
  constructor(private readonly runner: () => RunJiraSync) {}

  launch(kind: SyncKind, mode: SyncMode): Promise<void> {
    // Failures are recorded by the use case itself (the run is marked failed); nothing to await.
    void this.runner()
      .execute({ kind, mode })
      .catch(() => undefined);
    return Promise.resolve();
  }
}
