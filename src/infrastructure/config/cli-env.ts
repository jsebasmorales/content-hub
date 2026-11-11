import { z } from 'zod';

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
