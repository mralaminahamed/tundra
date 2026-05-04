import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import reactCompiler from 'eslint-plugin-react-compiler'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // TanStack Router uses `throw redirect(...)` and `throw notFound()` as control flow
      '@typescript-eslint/only-throw-error': 'off',
      // React Compiler rules — not using the compiler for transforms, but keep purity checks
      'react-compiler/react-compiler': 'warn',
      // react-hooks v7 bundles compiler rules; disable the ones that produce false positives
      // for idiomatic patterns like computing Date.now() once per render
      'react-hooks/purity': 'off',
    },
  },
)
