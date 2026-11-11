import type { AstroIntegration } from 'astro';
import { ROUTES } from './routes';

/**
 * Registers every route from the registry and the security middleware.
 * Astro only reads `src/pages`; this keeps pages and endpoints inside `presentation/`
 * as the SDD requires, and guarantees nothing is served that the registry does not list.
 */
export function contentHub(): AstroIntegration {
  return {
    name: 'content-hub',
    hooks: {
      'astro:config:setup': ({ injectRoute, addMiddleware }) => {
        for (const route of ROUTES) {
          injectRoute({ pattern: route.pattern, entrypoint: route.entrypoint });
        }
        addMiddleware({ entrypoint: './src/presentation/middleware.ts', order: 'pre' });
      },
    },
  };
}
