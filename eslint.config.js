import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Import patterns forbidden per layer (SDD §3: presentation → application → domain). */
const FORBIDDEN_FROM_DOMAIN = [
  '@infrastructure/*',
  '@presentation/*',
  '@application/*',
  '**/infrastructure/**',
  '**/presentation/**',
  '**/application/**',
  'astro',
  'astro:*',
  'drizzle-orm*',
];
const FORBIDDEN_FROM_APPLICATION = [
  '@infrastructure/*',
  '@presentation/*',
  '**/infrastructure/**',
  '**/presentation/**',
  'astro',
  'astro:*',
  'drizzle-orm*',
];
const FORBIDDEN_FROM_SHARED = [
  '@domain/*',
  '@application/*',
  '@infrastructure/*',
  '@presentation/*',
];
const FORBIDDEN_FROM_PRESENTATION = ['@infrastructure/*', '!@infrastructure/container'];

/**
 * @param {string[]} patterns
 * @param {string} message
 */
const restrictImports = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      '.netlify/',
      'netlify/functions/',
      'node_modules/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'src/infrastructure/db/migrations/',
      'docs/reference/',
      // Screenshots and throwaway probes of the design work: never part of the product.
      '.design-captures/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.js', '*.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Required together with noPropertyAccessFromIndexSignature in tsconfig.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      // SDD §3 rule 5: environment access only inside infrastructure/config.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration only via infrastructure/config (SDD §3 rule 5).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.meta.name='import'][property.name='env']",
          message: 'Read configuration only via astro:env / infrastructure/config.',
        },
      ],
    },
  },
  {
    files: ['src/domain/**'],
    rules: restrictImports(
      FORBIDDEN_FROM_DOMAIN,
      'domain must not depend on other layers or frameworks (SDD §3 rule 2).',
    ),
  },
  {
    files: ['src/application/**'],
    rules: restrictImports(
      FORBIDDEN_FROM_APPLICATION,
      'application depends only on domain and its own ports.',
    ),
  },
  {
    files: ['src/shared/**'],
    rules: restrictImports(FORBIDDEN_FROM_SHARED, 'shared must not depend on any layer.'),
  },
  {
    files: ['src/presentation/**'],
    rules: restrictImports(
      FORBIDDEN_FROM_PRESENTATION,
      'presentation reaches infrastructure only through the composition root.',
    ),
  },
  {
    files: ['src/infrastructure/config/**'],
    rules: { 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    // Tool config files run outside the app; they may read the CI flag.
    files: ['*.config.ts', '*.config.js', '*.config.mjs'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // The one script the browser runs (D-081): it lives in the page, not in Node.
    files: ['public/js/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Developer tools run from a terminal: they print their results and read the shell's variables.
    files: ['scripts/capture-pages.mjs', 'scripts/check-design.mjs', 'scripts/recount-type.mjs'],
    rules: { 'no-console': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // The test harness picks its database from TEST_DATABASE_URL (a test-only switch, never
    // read by application code), so SDD §3 rule 5 does not apply to it.
    files: ['tests/support/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['tests/**', '**/*.test.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['**/*.astro'],
    rules: {
      'astro/no-set-html-directive': 'error',
      // Types inside .astro templates are verified by `astro check`; the ESLint parser cannot
      // resolve imports there and reports false positives.
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
