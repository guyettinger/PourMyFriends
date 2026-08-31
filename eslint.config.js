const expoConfig = require('eslint-config-expo/flat')
const eslintConfigPrettier = require('eslint-config-prettier/flat')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['dist/*', '.expo/*', '.claude/*', 'ios/*', 'android/*'],
  },
  ...expoConfig,
  eslintConfigPrettier,
  {
    rules: {
      'no-empty-pattern': 0,
      '@typescript-eslint/no-empty-object-type': 0,
    },
  },
]
