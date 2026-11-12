import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const optionalString = nonEmpty.optional();
const urlString = z.url();

/** https://<site>.atlassian.net with no path: the only Jira origin the app may call (SDD §11.2). */
const jiraBaseUrl = urlString.refine((value) => {
  // Zod runs refinements even when the URL check failed, so guard the parse.
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    url.hostname.endsWith('.atlassian.net') &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === ''
  );
}, 'must be https://<site>.atlassian.net with no path');

/** Jira project keys are upper-case letters/digits, for example JSMCO. */
const jiraProjectKey = nonEmpty.regex(/^[A-Z][A-Z0-9_]{1,9}$/, 'must be an upper-case project key');

/**
 * Custom field ids differ per tenant, so they are configuration, never code (SDD §6.3).
 * Defaults are the ids found in this tenant by `pnpm probe:jira` (docs/jira-mapping.md).
 */
const jiraFieldId = (fallback: string) =>
  nonEmpty.regex(/^customfield_\d+$/, 'must look like customfield_12345').default(fallback);

/**
 * Shape of the environment the app needs. Mirrors the `env.schema` in astro.config.mjs
 * and adds cross-field rules that Astro's per-variable schema cannot express.
 */
const envShape = z.object({
  DATABASE_URL: nonEmpty.refine(
    (value) => /^(postgres(ql)?:\/\/|pglite:)/.test(value),
    'must start with postgres://, postgresql:// or pglite:',
  ),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ALLOWED_EMAIL_DOMAIN: nonEmpty.regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'must be a bare domain'),
  BOOTSTRAP_LEADER_EMAIL: z.email(),
  PUBLIC_APP_URL: urlString,
  AUTH_PROVIDER: z.enum(['local', 'atlassian']),
  ATLASSIAN_CLIENT_ID: optionalString,
  ATLASSIAN_CLIENT_SECRET: optionalString,
  ATLASSIAN_REDIRECT_URI: urlString.optional(),
  // Required since Phase 1 (docs/DECISIONES.md D-005).
  JIRA_BASE_URL: jiraBaseUrl,
  JIRA_EMAIL: z.email(),
  JIRA_API_TOKEN: nonEmpty,
  JIRA_PROJECT_KEY: jiraProjectKey,
  JIRA_FIELD_SLA_RESPONSE: jiraFieldId('customfield_10062'),
  JIRA_FIELD_SLA_DONE: jiraFieldId('customfield_10152'),
  /**
   * Shared only by the app and the background sync function. The function answers 404 to anyone
   * who does not present it (D-048). Separate from every other secret.
   */
  SYNC_TRIGGER_SECRET: z.string().min(32, 'must be at least 32 characters'),
  CROWDIN_TOKEN: optionalString,
  CROWDIN_PROJECT_IDS: optionalString,
  CROWDIN_WEBHOOK_SECRET: optionalString,
  BLOB_READ_WRITE_TOKEN: optionalString,
  INGEST_API_TOKEN: optionalString,
});

/** The Jira settings alone, for command-line scripts that run outside Astro. */
export const jiraEnvShape = envShape.pick({
  JIRA_BASE_URL: true,
  JIRA_EMAIL: true,
  JIRA_API_TOKEN: true,
  JIRA_PROJECT_KEY: true,
  JIRA_FIELD_SLA_RESPONSE: true,
  JIRA_FIELD_SLA_DONE: true,
});

export type JiraEnv = z.output<typeof jiraEnvShape>;

export type EnvInput = z.input<typeof envShape>;
export type AppEnv = z.output<typeof envShape>;

export interface EnvContext {
  /** True when running a production build/server. */
  readonly isProduction: boolean;
}

/** Raised when configuration is missing or invalid. Messages never contain secret values. */
export class EnvError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'EnvError';
  }
}

/**
 * In production the database must be a real Postgres reached over TLS: the embedded database
 * would lose data on serverless, and an unencrypted link would expose credentials (SDD §11.2).
 */
function productionDatabaseProblems(url: string): string[] {
  if (url.startsWith('pglite:'))
    return ['DATABASE_URL: the embedded database is forbidden in production'];
  const parsed = URL.canParse(url) ? new URL(url) : null;
  if (!parsed) return ['DATABASE_URL: not a valid connection string'];
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  const sslmode = parsed.searchParams.get('sslmode');
  const encrypted = sslmode !== null && ['require', 'verify-ca', 'verify-full'].includes(sslmode);
  return isLocalHost || encrypted
    ? []
    : ['DATABASE_URL: must include sslmode=require in production'];
}

/** Cross-field rules (SDD §15, docs/DECISIONES.md D-004 and D-005). */
function crossFieldProblems(env: AppEnv, context: EnvContext): string[] {
  const problems: string[] = [];
  const leaderDomain = env.BOOTSTRAP_LEADER_EMAIL.split('@').at(-1)?.toLowerCase();
  if (leaderDomain !== env.ALLOWED_EMAIL_DOMAIN.toLowerCase()) {
    problems.push('BOOTSTRAP_LEADER_EMAIL: must belong to ALLOWED_EMAIL_DOMAIN');
  }
  if (context.isProduction) problems.push(...productionDatabaseProblems(env.DATABASE_URL));
  if (env.AUTH_PROVIDER === 'local' && context.isProduction) {
    problems.push('AUTH_PROVIDER: "local" is forbidden in production');
  }
  if (env.AUTH_PROVIDER === 'atlassian') {
    const missing = (
      ['ATLASSIAN_CLIENT_ID', 'ATLASSIAN_CLIENT_SECRET', 'ATLASSIAN_REDIRECT_URI'] as const
    ).filter((key) => env[key] === undefined);
    for (const key of missing) problems.push(`${key}: required when AUTH_PROVIDER=atlassian`);
  }
  return problems;
}

/** An empty value in a .env file (KEY=) means "not set". */
const withoutEmpty = (raw: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));

/** Validates only the Jira settings. Errors name the variable, never its value. */
export function parseJiraEnv(raw: Readonly<Record<string, unknown>>): JiraEnv {
  const parsed = jiraEnvShape.safeParse(withoutEmpty(raw));
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return parsed.data;
}

/** Validates raw values and returns a typed configuration, or throws `EnvError`. */
export function parseEnv(raw: Readonly<Record<string, unknown>>, context: EnvContext): AppEnv {
  const parsed = envShape.safeParse(withoutEmpty(raw));
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const problems = crossFieldProblems(parsed.data, context);
  if (problems.length > 0) throw new EnvError(problems);
  return parsed.data;
}
