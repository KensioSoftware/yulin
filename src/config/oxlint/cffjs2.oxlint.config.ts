import {
  cffJs2LintRules,
  cffJs2PluginName,
  type LintRuleSetting,
} from "../lint/index.js";

/**
 * An Oxlint config fragment, in the shape `.oxlintrc.json` is written in.
 */
export interface OxlintConfig {
  readonly jsPlugins: readonly {
    readonly name: string;
    readonly specifier: string;
  }[];
  readonly overrides: readonly {
    readonly files: readonly string[];
    readonly rules: Readonly<Record<string, LintRuleSetting>>;
  }[];
}

/**
 * Where the built plugin sits, relative to the published config that names it.
 *
 * Oxlint resolves a plugin specifier against the config file's own location,
 * and the config is written to the package root, so this path goes down into
 * `dist/` rather than across the source tree.
 */
const pluginSpecifier = "./dist/config/lint/cff-js2-oxlint-plugin.js";

/**
 * Oxlint's half of the CloudFront Functions JS2 lint setup.
 *
 * It is an override rather than a top-level rule block because a consumer
 * extends this into the config that lints their whole repository, and JS2's
 * restrictions would be wrong applied anywhere but a `.cff.js` file: a project
 * told not to use arrow functions everywhere would be unusable.
 *
 * The rules are the same ones the ESLint config uses, from the same source.
 */
export const cloudFrontFunctionsJs2Oxlint: OxlintConfig = {
  jsPlugins: [{ name: cffJs2PluginName, specifier: pluginSpecifier }],
  overrides: [
    {
      files: ["**/*.cff.js"],
      rules: cffJs2LintRules(),
    },
  ],
};
