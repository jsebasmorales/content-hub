import { readCliEnv, readJiraCliEnv } from '../config/cli-env';
import { composeJiraSync } from '../compose-jira';
import { openDatabase } from '../db/client';

// Usage:
//   pnpm sync:jira                 incremental sync (since the last successful run)
//   pnpm sync:jira --full          read the whole project and remove tickets deleted in Jira
//   pnpm sync:jira --dry-run       read Jira and report, without writing anything
// Reads DATABASE_URL and the JIRA_* settings from .env.
const args = new Set(process.argv.slice(2));
const mode = args.has('--full') ? 'full' : 'incremental';
const dryRun = args.has('--dry-run');

const handle = await openDatabase(readCliEnv().DATABASE_URL);
try {
  const result = await composeJiraSync(handle.db, readJiraCliEnv()).execute({
    kind: 'manual',
    mode,
    dryRun,
  });
  const label = `${mode}${dryRun ? ' (dry run)' : ''}`;
  if (result.status === 'succeeded') {
    console.warn(
      `Jira sync ${label} succeeded: ${String(result.items)} tickets read, ${String(result.deleted)} ${dryRun ? 'would be ' : ''}removed.`,
    );
  } else if (result.status === 'busy') {
    console.warn('Another sync is already running. Nothing was done.');
  } else {
    console.error(
      `Jira sync ${label} failed after ${String(result.items)} tickets: ${result.error}`,
    );
    process.exitCode = 1;
  }
} finally {
  await handle.close();
}
