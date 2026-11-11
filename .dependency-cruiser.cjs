/**
 * Architecture rules (SDD §3). The build fails when any rule with severity "error" is broken.
 * Direction: presentation → application → domain. infrastructure implements application ports.
 */
const FRAMEWORKS = '^node_modules/(astro|drizzle-orm|@astrojs|pg|postgres|@electric-sql)';

module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'domain must not import from application, infrastructure or presentation.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|infrastructure|presentation)' },
    },
    {
      name: 'domain-no-framework',
      comment: 'domain has no Astro, database or HTTP dependencies.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: FRAMEWORKS },
    },
    {
      name: 'application-no-outer-layers',
      comment: 'application may only depend on domain and shared.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/(infrastructure|presentation)' },
    },
    {
      name: 'infrastructure-no-presentation',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/presentation' },
    },
    {
      name: 'presentation-only-via-container',
      comment: 'presentation reaches infrastructure only through the composition root.',
      severity: 'error',
      from: { path: '^src/presentation' },
      to: { path: '^src/infrastructure', pathNot: '^src/infrastructure/container\\.ts$' },
    },
    {
      name: 'shared-is-leaf',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { path: '^src/(domain|application|infrastructure|presentation)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'src-not-importing-tests',
      severity: 'error',
      from: { path: '^src' },
      to: { path: '^tests' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    includeOnly: '^(src|tests|node_modules/(astro|drizzle-orm|@astrojs|pg|postgres|@electric-sql))',
  },
};
