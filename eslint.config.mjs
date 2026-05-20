// Flat ESLint config — scoped to route files for the `no-route-geometry` rule.
// Biome remains the project's primary linter/formatter; ESLint exists only to
// host custom AST rules biome doesn't support.

import tsParser from "@typescript-eslint/parser";
import aeHqPlugin from "eslint-plugin-ae-hq";

export default [
  {
    files: ["apps/platform-app/src/routes/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "ae-hq": aeHqPlugin,
    },
    rules: {
      "ae-hq/no-route-geometry": "error",
    },
  },
];
