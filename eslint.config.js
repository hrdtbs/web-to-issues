import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['public/**', 'dist/**', 'node_modules/**'],
  },
  {
    files: ['src/widget/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  }
);
