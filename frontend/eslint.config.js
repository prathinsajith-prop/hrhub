import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `any` is pervasive in this codebase — warn, don't block builds
      '@typescript-eslint/no-explicit-any': 'warn',
      // Non-component exports alongside components are common in this project
      'react-refresh/only-export-components': 'warn',
      // TanStack Table returns unstable refs by design — suppress incompatible-library
      'react-hooks/incompatible-library': 'warn',
      // React Compiler strict rules — warn only (patterns are valid in standard React)
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
])
