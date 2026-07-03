const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    // Build output, native project, and Node-based tooling config files
    // (CommonJS, not part of the app's TypeScript source graph).
    ignores: [
      'node_modules/*',
      'android/*',
      'metro.config.js',
      'babel.config.js',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `catch (e: any)` is idiomatic in the audio/permission error handling.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
