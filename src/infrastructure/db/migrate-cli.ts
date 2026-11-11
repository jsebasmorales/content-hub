import { readCliEnv } from '../config/cli-env';
import { openDatabase } from './client';
import { seedAccessData } from './seed';

// Usage: pnpm db:migrate   (reads DATABASE_URL from .env)
const handle = await openDatabase(readCliEnv().DATABASE_URL);
try {
  await handle.migrate();
  await seedAccessData(handle.db);
  console.warn('Migrations applied and access data seeded.');
} finally {
  await handle.close();
}
