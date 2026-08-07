/**
 * An ESLint config that lints CloudFront Function files as JS2.
 */

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";

import { cloudFrontFunctionsJs2 } from "@kensio/yulin/eslint";

export default defineConfig(
  eslint.configs.recommended,

  // Applies only to **/*.cff.js, so it goes after the configs it relaxes.
  ...cloudFrontFunctionsJs2,
);
