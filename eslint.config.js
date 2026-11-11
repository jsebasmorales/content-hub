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
      'node_modules/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'src/infrastructure/db/migrations/',
      'docs/reference/',
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
    files: ['tests/**', '**/*.test.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['**/*.astro'],
    rules: { 'astro/no-set-html-directive': 'error' },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
