import type {
  IssuePage,
  IssueSnapshot,
  JiraError,
  JiraGateway,
  SearchIssuesInput,
} from '@application/ports/jira';
import { err, ok, type Result } from '@shared/result';
import { mapIssue, type SlaFieldIds } from './issue-mapper';
import { JiraHttp, type JiraHttpConfig, type JiraHttpDeps } from './jira-http';
import {
  changelogPageSchema,
  keysResponseSchema,
  searchResponseSchema,
  type History,
  type RawIssue,
} from './jira-schemas';

const PAGE_SIZE = 100;
/** Safety stop: 100 pages of 100 tickets is ten times this project's size. */
const MAX_PAGES = 100;

export interface JiraGatewayConfig extends JiraHttpConfig {
  /** Validated by the environment rules: upper-case letters and digits only. */
  readonly projectKey: string;
  readonly slaFields: SlaFieldIds;
}

const invalid = (message: string): JiraError => ({ kind: 'invalid_response', message });

/** Builds the JQL. Dates go as epoch milliseconds, which do not depend on any time zone. */
export function buildJql(projectKey: string, updatedSince: Date | null): string {
  const project = `project = "${projectKey.replaceAll('"', '')}"`;
  const since = updatedSince ? ` AND updated >= ${String(updatedSince.getTime())}` : '';
  return `${project}${since} ORDER BY updated ASC`;
}

/** Read-only Jira over REST. It issues searches and history reads, never a write. */
export class HttpJiraGateway implements JiraGateway {
  private readonly http: JiraHttp;
  private readonly fields: readonly string[];

  constructor(
    private readonly config: JiraGatewayConfig,
    deps: JiraHttpDeps = {},
  ) {
    this.http = new JiraHttp(config, deps);
    this.fields = [
      'summary',
      'status',
      'issuetype',
      'priority',
      'assignee',
      'reporter',
      'created',
      'updated',
      'resolutiondate',
      'statuscategorychangedate',
      config.slaFields.firstResponse,
      config.slaFields.done,
    ];
  }

  async searchIssues(input: SearchIssuesInput): Promise<Result<IssuePage, JiraError>> {
    const response = await this.http.request('POST', '/rest/api/3/search/jql', {
      jql: buildJql(this.config.projectKey, input.updatedSince),
      maxResults: PAGE_SIZE,
      fields: this.fields,
      expand: 'changelog',
      ...(input.pageToken === null ? {} : { nextPageToken: input.pageToken }),
    });
    if (!response.ok) return response;
    const parsed = searchResponseSchema.safeParse(response.value);
    if (!parsed.success) return err(invalid('The search response has an unexpected shape'));

    const snapshots: IssueSnapshot[] = [];
    for (const raw of parsed.data.issues) {
      const histories = await this.fullHistory(raw);
      if (!histories.ok) return histories;
      const mapped = mapIssue(raw, histories.value, this.config.slaFields);
      if (!mapped.ok) return mapped;
      snapshots.push(mapped.value);
    }
    return ok({ issues: snapshots, nextPageToken: parsed.data.nextPageToken ?? null });
  }

  async listIssueKeys(): Promise<Result<readonly string[], JiraError>> {
    const keys: string[] = [];
    let pageToken: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await this.http.request('POST', '/rest/api/3/search/jql', {
        jql: buildJql(this.config.projectKey, null),
        maxResults: PAGE_SIZE,
        fields: ['key'],
        ...(pageToken === null ? {} : { nextPageToken: pageToken }),
      });
      if (!response.ok) return response;
      const parsed = keysResponseSchema.safeParse(response.value);
      if (!parsed.success) return err(invalid('The key list has an unexpected shape'));
      keys.push(...parsed.data.issues.map((issue) => issue.key));
      pageToken = parsed.data.nextPageToken ?? null;
      if (pageToken === null) return ok(keys);
    }
    return err(invalid('The project has more pages than the safety limit'));
  }

  /** The embedded history, completed from the history endpoint when Jira cut it short. */
  private async fullHistory(raw: RawIssue): Promise<Result<readonly History[], JiraError>> {
    const embedded = raw.changelog?.histories ?? [];
    const total = raw.changelog?.total ?? embedded.length;
    if (embedded.length >= total) return ok(embedded);
    return this.readAllHistory(raw.key);
  }

  private async readAllHistory(key: string): Promise<Result<readonly History[], JiraError>> {
    const histories: History[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await this.http.request(
        'GET',
        `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${String(histories.length)}&maxResults=${String(PAGE_SIZE)}`,
      );
      if (!response.ok) return response;
      const parsed = changelogPageSchema.safeParse(response.value);
      if (!parsed.success) return err(invalid(`The history of ${key} has an unexpected shape`));
      histories.push(...parsed.data.values);
      if (parsed.data.values.length === 0 || histories.length >= parsed.data.total) {
        return ok(histories);
      }
    }
    return err(invalid(`The history of ${key} has more pages than the safety limit`));
  }
}
