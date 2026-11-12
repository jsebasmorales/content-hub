// Bundles the Netlify background function into netlify/functions/ (D-048).
//
// Usage:  pnpm build:functions   (also runs as the first step of `pnpm build`)
//
// Why a separate bundle step: Netlify's own function bundler does not know this project's path
// aliases (@domain/..., @infrastructure/...). esbuild reads them from tsconfig.json and resolves
// every import, so what Netlify receives is one plain file.
/* eslint-disable no-console -- CLI build script: printing is its purpose. */
import { mkdirSync, statSync } from 'node:fs';
import { build } from 'esbuild';

const OUT_DIR = 'netlify/functions';
// The embedded database is for local use only; production never loads it (see db/client.ts).
const EXTERNAL = [
  'pg-native',
  '@electric-sql/pglite',
  'drizzle-orm/pglite',
  'drizzle-orm/pglite/migrator',
];
// Dependencies written as CommonJS (pg) call require(); this gives them one in an ES module.
const REQUIRE_SHIM =
  "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);";

const FUNCTIONS = [
  { entry: 'src/infrastructure/netlify/sync-jira-background.ts', name: 'sync-jira-background' },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { entry, name } of FUNCTIONS) {
  const outfile = `${OUT_DIR}/${name}.mjs`;
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    tsconfig: 'tsconfig.json',
    external: EXTERNAL,
    banner: { js: REQUIRE_SHIM },
    legalComments: 'none',
    logLevel: 'warning',
  });
  const kilobytes = Math.round(statSync(outfile).size / 1024);
  console.log(`Built ${outfile} (${String(kilobytes)} KB)`);
}
