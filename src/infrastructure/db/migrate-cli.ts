import { readCliEnv } from '../config/cli-env';
import { openDatabase } from './client';

// Usage: pnpm db:migrate   (reads DATABASE_URL from .env)
const handle = await openDatabase(readCliEnv().DATABASE_URL);
try {
  await handle.migrate();
  console.warn('Migrations applied.');
} finally {
  await handle.close();
}
