const expoConfig = require('eslint-config-expo/flat')
const { defineConfig } = require('eslint/config')

module.exports = defineConfig([
  expoConfig,
  {
    ignorePatterns: ['/dist/*', '/node_modules/*', '/.expo/*', '/ios/*', '/android/*'],
    rules: {
      'no-empty-pattern': 0,
      '@typescript-eslint/no-empty-object-type': 0,
    },
  },
])
