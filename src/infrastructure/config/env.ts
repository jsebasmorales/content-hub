import * as astroEnv from 'astro:env/server';
import { parseEnv, type AppEnv } from './env-rules';

/**
 * The only place that reads configuration (SDD §3 rule 5).
 * Evaluated when first imported (server start / cold start): invalid config throws and the
 * app does not serve requests (SDD §15).
 */
export const isProduction: boolean = import.meta.env.PROD;
export const env: AppEnv = parseEnv(astroEnv, { isProduction });
