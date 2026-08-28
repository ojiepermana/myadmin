import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/.angular/**',
      '**/.git/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/bun.lock',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },
  {
    files: ['apps/server/src/**/*.ts', 'packages/*/src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
);
