import type { Clock } from '@application/ports/services';
import type { SyncLauncher, SyncRunRepository } from '@application/ports/sync';
import { isRunInProgress, isStale, shouldTriggerLazySync } from '@domain/jira/sync-policy';
import { logEvent } from '@shared/log';

export type SyncRequestOutcome =
  | { readonly requested: true }
  | {
      readonly requested: false;
      readonly reason: 'fresh' | 'running' | 'recent_attempt' | 'launch_failed';
    };

/** What /estado shows for a launch that failed. Short and free of anything secret. */
export const LAUNCH_FAILED_TEXT = 'No se pudo lanzar la sincronización en segundo plano';

export interface RequestJiraSyncDeps {
  readonly runs: SyncRunRepository;
  readonly launcher: SyncLauncher;
  readonly clock: Clock;
}

/**
 * The two ways a person causes a sync (D-035). Neither waits for Jira: they decide, start a
 * background run and return. Permission and the one-per-minute limit are checked by the caller.
 */
export class RequestJiraSync {
  constructor(private readonly deps: RequestJiraSyncDeps) {}

  /** Opening the dashboard: refresh only if the data is stale and nobody tried recently. */
  async lazy(): Promise<SyncRequestOutcome> {
    const { runs, clock } = this.deps;
    const now = clock.now();
    const [success, latest, running] = await Promise.all([
      runs.latestSucceeded(),
      runs.latest(),
      runs.findRunning(),
    ]);
    const history = {
      lastSuccessAt: success?.finishedAt ?? null,
      lastAttemptAt: latest?.startedAt ?? null,
      running: running !== null && isRunInProgress(running, now),
    };
    if (!shouldTriggerLazySync(history, now)) {
      if (history.running) return { requested: false, reason: 'running' };
      return {
        requested: false,
        reason: isStale(history.lastSuccessAt, now) ? 'recent_attempt' : 'fresh',
      };
    }
    return this.start('lazy');
  }

  /** The "Resincronizar" button: always asks, unless a sync is already running. */
  async manual(): Promise<SyncRequestOutcome> {
    const { runs, clock } = this.deps;
    const running = await runs.findRunning();
    if (running !== null && isRunInProgress(running, clock.now())) {
      return { requested: false, reason: 'running' };
    }
    return this.start('manual');
  }

  /**
   * A launcher that cannot be reached must never break the page or the button: the person still
   * sees the last good data. The failure is written down as a failed run, which does two things:
   * the "one attempt every 5 minutes" rule then applies (otherwise every page view would wait for
   * the launcher's timeout again), and /estado shows the Leader that launching is what is failing.
   */
  private async start(kind: 'lazy' | 'manual'): Promise<SyncRequestOutcome> {
    try {
      await this.deps.launcher.launch(kind, 'incremental');
      return { requested: true };
    } catch {
      logEvent('warn', 'sync.launch_failed', { kind });
      await this.recordLaunchFailure(kind);
      return { requested: false, reason: 'launch_failed' };
    }
  }

  private async recordLaunchFailure(kind: 'lazy' | 'manual'): Promise<void> {
    const { runs, clock } = this.deps;
    try {
      const run = await runs.start(kind, clock.now());
      await runs.finish(
        run.id,
        { status: 'failed', items: 0, error: LAUNCH_FAILED_TEXT },
        clock.now(),
      );
    } catch {
      // Keeping a record is a courtesy: if the database blinks too, the page still renders.
      logEvent('warn', 'sync.launch_failure_not_recorded', { kind });
    }
  }
}
