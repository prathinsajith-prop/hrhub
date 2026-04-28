import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['src/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      // Consistent with frontend — warn, don't block
      '@typescript-eslint/no-explicit-any': 'warn',
      // Catch variables declared but never used (common source of drift)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Backends always log — suppress console warnings
      'no-console': 'off',
      // Allow empty catch blocks used as intentional no-ops in Fastify hooks
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Type assertions are common when bridging Drizzle types
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
)
