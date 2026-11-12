import { logEvent } from '@shared/log';
import { readFunctionEnv } from '../config/function-env';
import { HttpSyncLauncher } from './http-sync-launcher';

/**
 * Scheduled backup sync, DISABLED by default (D-035): `scripts/build-functions.mjs` does not bundle
 * it. To enable it, see "Activar el sync programado" in docs/runbooks/DESPLIEGUE.md.
 *
 * A scheduled function may run only briefly, so it does not sync: it asks the background function to.
 */
export const SCHEDULE = '*/30 * * * *';

export async function handler(): Promise<void> {
  const env = readFunctionEnv();
  // The site's own address is given by Netlify to every function.
  // eslint-disable-next-line no-restricted-properties
  const baseUrl = process.env['URL'];
  if (baseUrl === undefined) {
    logEvent('error', 'sync.scheduled_misconfigured', { problems: 'URL is not set' });
    return;
  }
  try {
    await new HttpSyncLauncher({ baseUrl, secret: env.secret }).launch('scheduled', 'incremental');
  } catch (error) {
    logEvent('error', 'sync.scheduled_failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}
