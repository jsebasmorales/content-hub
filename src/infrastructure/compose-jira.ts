import type { IssueRepository, JiraGateway } from '@application/ports/jira';
import type { Clock } from '@application/ports/services';
import type { SyncLauncher, SyncLock, SyncRunRepository } from '@application/ports/sync';
import { GetExecutiveSummary } from '@application/use-cases/jira/get-executive-summary';
import { GetCapacity } from '@application/use-cases/jira/get-capacity';
import { GetQuarterlyReport } from '@application/use-cases/jira/get-quarterly-report';
import { GetSlaBreaches } from '@application/use-cases/jira/get-sla-breaches';
import { GetSlaReport } from '@application/use-cases/jira/get-sla-report';
import { GetDefinitionsData } from '@application/use-cases/jira/get-definitions-data';
import { GetSummary } from '@application/use-cases/jira/get-summary';
import { GetSyncStatus } from '@application/use-cases/jira/get-sync-status';
import { GetSystemStatus } from '@application/use-cases/jira/get-system-status';
import { ListTasks } from '@application/use-cases/jira/list-tasks';
import { RequestJiraSync } from '@application/use-cases/jira/request-jira-sync';
import { RunJiraSync } from '@application/use-cases/jira/run-jira-sync';
import { SystemClock } from './auth/token-service';
import { ticketUrl } from '@domain/jira/ticket';
import type { JiraEnv } from './config/env-rules';
import type { Database } from './db/client';
import { DbIssueRepository } from './db/repositories/issue-repository';
import { DbSyncLock } from './db/repositories/sync-lock';
import { DbSyncRunRepository } from './db/repositories/sync-run-repository';
import { HttpJiraGateway } from './jira/jira-gateway';

/** Every port the Jira use cases depend on. Real adapters and in-memory fakes both fit. */
export interface JiraPorts {
  readonly jira: JiraGateway;
  readonly issues: IssueRepository;
  readonly runs: SyncRunRepository;
  readonly lock: SyncLock;
  readonly launcher: SyncLauncher;
}

/** Wires the Jira ports to their use cases. No Astro code, so tests build the very same thing. */
export function wireJira(ports: JiraPorts, clock: Clock, options: { jiraBaseUrl?: string } = {}) {
  const { jira, issues, runs, lock, launcher } = ports;
  return {
    /** Link to a ticket in Jira, or null when none can be built (no base address, odd key). */
    ticketUrl: (key: string): string | null => ticketUrl(options.jiraBaseUrl, key),
    issues,
    runs,
    runSync: new RunJiraSync({ jira, issues, runs, lock, clock }),
    requestSync: new RequestJiraSync({ runs, launcher, clock }),
    syncStatus: new GetSyncStatus({ runs, clock }),
    executiveSummary: new GetExecutiveSummary({ issues, clock }),
    listTasks: new ListTasks({ issues }),
    slaReport: new GetSlaReport({ issues, clock }),
    slaBreaches: new GetSlaBreaches({ issues, clock }),
    capacity: new GetCapacity({ issues, clock }),
    quarterly: new GetQuarterlyReport({ issues, clock }),
    systemStatus: new GetSystemStatus({ runs, issues, clock }),
    summary: new GetSummary({ issues, clock }),
    definitions: new GetDefinitionsData({ runs, issues, clock }),
  };
}

export type JiraApp = ReturnType<typeof wireJira>;

export function createJiraGateway(env: JiraEnv): HttpJiraGateway {
  return new HttpJiraGateway({
    baseUrl: env.JIRA_BASE_URL,
    email: env.JIRA_EMAIL,
    apiToken: env.JIRA_API_TOKEN,
    projectKey: env.JIRA_PROJECT_KEY,
    slaFields: { firstResponse: env.JIRA_FIELD_SLA_RESPONSE, done: env.JIRA_FIELD_SLA_DONE },
  });
}

/**
 * Builds the launcher once the sync itself exists. The launcher may need the sync (the local
 * development launcher runs it in-process), so it receives a lazy accessor, not the object.
 */
export type LauncherFactory = (runSync: () => RunJiraSync) => SyncLauncher;

/** Production wiring: real Jira, real database. */
export function composeJira(
  db: Database,
  env: JiraEnv,
  makeLauncher: LauncherFactory,
  clock: Clock = new SystemClock(),
): JiraApp {
  const built: { app?: JiraApp } = {};
  const launcher = makeLauncher(() => {
    if (built.app === undefined) throw new Error('The Jira application is not built yet');
    return built.app.runSync;
  });
  const app = wireJira(
    {
      jira: createJiraGateway(env),
      issues: new DbIssueRepository(db),
      runs: new DbSyncRunRepository(db),
      lock: new DbSyncLock(db),
      launcher,
    },
    clock,
    { jiraBaseUrl: env.JIRA_BASE_URL },
  );
  built.app = app;
  return app;
}

/** For the command line and the background function: they run a sync directly, never launch one. */
export function composeJiraSync(db: Database, env: JiraEnv, clock: Clock = new SystemClock()) {
  const direct: LauncherFactory = () => ({
    launch: () => Promise.reject(new Error('This process runs the sync itself; it never launches')),
  });
  return composeJira(db, env, direct, clock).runSync;
}
