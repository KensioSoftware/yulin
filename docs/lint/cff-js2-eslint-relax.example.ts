/**
 * Allowing class syntax in CloudFront Function files.
 */

import { defineConfig } from "eslint/config";

import { cloudFrontFunctionsJs2 } from "@kensio/yulin/eslint";

export default defineConfig(...cloudFrontFunctionsJs2, {
  files: ["**/*.cff.js"],
  rules: {
    "cff-js2/no-class": "off",
  },
});
