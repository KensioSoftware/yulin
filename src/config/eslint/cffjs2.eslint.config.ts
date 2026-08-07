import { type ESLint } from "eslint";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import {
  cffJs2LintPlugin,
  cffJs2LintRules,
  cffJs2PluginName,
} from "../lint/index.js";

// ESLint's `Plugin` describes a rule context far wider than these rules read:
// it is generic over the syntax tree, so a rule typed against the handful of
// node properties it actually touches cannot satisfy it. This file is the
// adapter that wires a linter-agnostic plugin into ESLint, so it is where that
// difference belongs.
const eslintPlugin = cffJs2LintPlugin as unknown as ESLint.Plugin;

export default defineConfig({
  // ── CloudFront Functions JS2
  files: ["**/*.cff.js"],
  extends: [tseslint.configs.disableTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: false,
    },
  },
  plugins: {
    // The restrictions live in a plugin rather than in `no-restricted-syntax`
    // so that Oxlint can load the same rules, and so that switching one off
    // does not mean restating the rest. See `../lint/cff-js2-lint-plugin.ts`.
    [cffJs2PluginName]: eslintPlugin,
  },
  rules: {
    ...cffJs2LintRules(),

    // ── ESLint-only, because typescript-eslint's own copies of these rules
    //    take over from the built-in ones in a TypeScript-aware config.
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { varsIgnorePattern: "^handler$" },
    ],
  },
});
