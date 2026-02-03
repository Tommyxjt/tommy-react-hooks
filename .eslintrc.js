module.exports = {
  extends: ['eslint-config-encode/typescript/react', 'prettier'],
  overrides: [
    {
      files: ['**/rollup.config.*', '**/*.config.*'],
      rules: {
        'import/no-unresolved': 'off',
        'no-nested-ternary': 'off',
      },
    },
  ],
};
