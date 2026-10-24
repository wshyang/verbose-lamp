import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The numeric half of AGENTS-function-design.md (ADR-010). Everything here is a rule written
 * down in AGENTS*.md; nothing here is taste.
 *
 * Carve-out, recorded in ADR-012: `max-lines-per-function` applies to `.ts` (logic) and not to
 * `.tsx` (markup). A component body is a declarative tree whose length tracks the surface, and
 * AGENTS-frontend.md §2 already bans computation inside the JSX return — the logic those rules
 * exist to bound lives in `lib/hooks/*.ts`, where the 50-line limit is enforced.
 */

const FUNCTION_DESIGN_RULES = {
  'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
  'max-depth': ['error', 3],
  'max-params': ['error', 3],
  complexity: ['error', 12],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.data/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'apps/web/public/**',
      // ADR-270 — the untracked reference samples for the tournament rebuild; not this project's code.
      'tournament_reference/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...FUNCTION_DESIGN_RULES,
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      'no-else-return': 'error',
      'object-shorthand': ['error', 'properties'],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']",
          message: 'Read configuration through apps/api/src/env.ts, never process.env directly.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },
  {
    // Logic files: the 50-line function limit from AGENTS-function-design.md §1.
    files: ['**/*.ts'],
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Test files describe scenarios: long `describe` bodies and fixture literals are the point.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts', '**/test-utils/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // env.ts is the one module allowed to read process.env; scripts run outside the app.
    // bootstrap.test.ts is the one test that proves env.ts's own parsing, so it has to be
    // able to hand it a bad value.
    files: [
      'apps/api/src/env.ts',
      'apps/api/src/tests/bootstrap.test.ts',
      'scripts/**/*.mjs',
      'apps/*/scripts/**/*.mjs',
      'apps/*/scripts/**/*.ts',
      '**/*.config.ts',
      'playwright.config.ts',
      // E2E runs outside the app process, like scripts: its knobs are its own.
      'e2e/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': 'off', 'max-lines-per-function': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/*/scripts/**/*.mjs', 'apps/*/scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', complexity: 'off' },
  },
);
