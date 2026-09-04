import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

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
  // Angular component classes. Until this was added, 7.7k lines of template
  // and every Angular lifecycle and selector convention went unchecked by the
  // linter (spec 0057 AC-14).
  {
    files: ['apps/web/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  // Angular templates, both external files and inline ones extracted by the
  // processor above.
  {
    files: ['apps/web/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
