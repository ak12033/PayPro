import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  /**
   * `test.jsx` is the design-reference prototype the current UI was built
   * from, not application code — it lives outside `src/`, is imported by
   * nothing and never reaches a bundle. It is linted out rather than deleted
   * so the reference survives, but it should not hold the build to the same
   * standard as shipped code. Safe to delete once it is no longer being
   * referred to.
   */
  { ignores: ['dist', 'test.jsx'] },
  /**
   * The Firebase messaging service worker.
   *
   * It runs in a ServiceWorkerGlobalScope, not a window: `importScripts` and
   * the `firebase` global installed by the compat scripts it loads are both
   * legitimate there, but neither exists in `globals.browser`, so the file
   * reported four `no-undef` errors that could never be fixed in the file
   * itself. Scoping the correct globals to it is the fix; disabling the rule
   * inline would have hidden real typos in the same file.
   */
  {
    files: ['public/firebase-messaging-sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        importScripts: 'readonly',
        firebase: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      /**
       * `eslint-plugin-react` is not installed, so ESLint does not treat a JSX
       * reference as a use. That makes the render-a-component-from-a-prop
       * pattern (`({ icon: Icon }) => <Icon />`) report as an unused argument.
       *
       * `argsIgnorePattern` mirrors the existing `varsIgnorePattern`: a
       * capitalised binding is a component by convention, and the same
       * exemption should apply whether it arrived as a variable or as a prop.
       */
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' },
      ],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
]
