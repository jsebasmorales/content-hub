import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const optionalString = nonEmpty.optional();
const urlString = z.url();

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
  JIRA_BASE_URL: urlString.optional(),
  JIRA_EMAIL: optionalString,
  JIRA_API_TOKEN: optionalString,
  JIRA_PROJECT_KEY: optionalString,
  JIRA_WEBHOOK_SECRET: optionalString,
  CROWDIN_TOKEN: optionalString,
  CROWDIN_PROJECT_IDS: optionalString,
  CROWDIN_WEBHOOK_SECRET: optionalString,
  BLOB_READ_WRITE_TOKEN: optionalString,
  INGEST_API_TOKEN: optionalString,
});

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

/** Cross-field rules (SDD §15, docs/DECISIONES.md D-004 and D-005). */
function crossFieldProblems(env: AppEnv, context: EnvContext): string[] {
  const problems: string[] = [];
  const leaderDomain = env.BOOTSTRAP_LEADER_EMAIL.split('@').at(-1)?.toLowerCase();
  if (leaderDomain !== env.ALLOWED_EMAIL_DOMAIN.toLowerCase()) {
    problems.push('BOOTSTRAP_LEADER_EMAIL: must belong to ALLOWED_EMAIL_DOMAIN');
  }
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

/** Validates raw values and returns a typed configuration, or throws `EnvError`. */
export function parseEnv(raw: Readonly<Record<string, unknown>>, context: EnvContext): AppEnv {
  // An empty value in a .env file (KEY=) means "not set".
  const normalized = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const parsed = envShape.safeParse(normalized);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const problems = crossFieldProblems(parsed.data, context);
  if (problems.length > 0) throw new EnvError(problems);
  return parsed.data;
}
