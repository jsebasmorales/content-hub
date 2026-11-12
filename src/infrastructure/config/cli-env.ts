import { z } from 'zod';
import { parseJiraEnv, type JiraEnv } from './env-rules';

const cliEnvShape = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (copy .env.example to .env)'),
});

/**
 * Configuration for command-line scripts (migrations, seeding). They run outside Astro,
 * so `astro:env` is unavailable; this is the only other place allowed to read `process.env`.
 */
export function readCliEnv(): z.output<typeof cliEnvShape> {
  return cliEnvShape.parse(process.env);
}

/** Jira settings for scripts such as `pnpm sync:jira`, validated by the same rules as the app. */
export function readJiraCliEnv(): JiraEnv {
  return parseJiraEnv(process.env);
}
