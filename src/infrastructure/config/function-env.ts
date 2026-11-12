import { z } from 'zod';
import { EnvError, parseJiraEnv, type JiraEnv } from './env-rules';

const shape = z.object({
  DATABASE_URL: z.string().min(1, 'is required'),
  SYNC_TRIGGER_SECRET: z.string().min(32, 'must be at least 32 characters'),
});

export interface FunctionEnv {
  readonly databaseUrl: string;
  readonly secret: string;
  readonly jira: JiraEnv;
}

/**
 * Configuration of the background sync function. It runs outside Astro, so `astro:env` is not
 * available; like the command-line scripts it reads the process environment, here and nowhere
 * else (SDD §3 rule 5). Errors name the variable, never its value.
 */
export function readFunctionEnv(raw: Readonly<Record<string, unknown>> = process.env): FunctionEnv {
  const parsed = shape.safeParse(raw);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return {
    databaseUrl: parsed.data.DATABASE_URL,
    secret: parsed.data.SYNC_TRIGGER_SECRET,
    jira: parseJiraEnv(raw),
  };
}
