import { cffJs2LintPlugin, cffJs2PluginName } from "./cff-js2-lint-plugin.js";

/**
 * One rule setting, in the form both linters read it.
 */
export type LintRuleSetting =
  "off" | "error" | readonly ["error", Readonly<Record<string, string>>];

/**
 * Rules a general JavaScript config turns on that JS2 has to be let off.
 *
 * A CloudFront Function is written against a runtime with no `const`, no
 * shorthand properties and no template literals, so the modern-JavaScript
 * advice a repository applies everywhere else is advice to write code that
 * will not run. Turning these off is not a lowering of standards; the
 * restrictions below are stricter than what they replace.
 */
const relaxedRules: Readonly<Record<string, LintRuleSetting>> = {
  "no-var": "off",
  "prefer-const": "off",
  "object-shorthand": "off",
  "prefer-template": "off",
};

/**
 * Restrictions both linters already ship, so the plugin does not repeat them.
 */
const builtInRules: Readonly<Record<string, LintRuleSetting>> = {
  "no-eval": "error",
  "no-new-func": "error",
  "no-implied-eval": "error",
  // The handler is the entry point CloudFront calls rather than anything this
  // file uses, so it is not unused merely because nothing here reads it.
  "no-unused-vars": ["error", { varsIgnorePattern: "^handler$" }],
};

/**
 * Every rule in the plugin, turned on, under the name the plugin is loaded as.
 *
 * Deriving this from the plugin keeps a rule from being added without either
 * published config picking it up.
 */
export function cffJs2LintPluginRules(): Record<string, "error"> {
  return Object.fromEntries(
    Object.keys(cffJs2LintPlugin.rules).map((name) => [
      `${cffJs2PluginName}/${name}`,
      "error",
    ]),
  );
}

/**
 * Every rule a CloudFront Functions JS2 file should be linted with, in the
 * form ESLint and Oxlint both accept.
 *
 * Both published configs derive their rules from here, so a restriction cannot
 * be added for one linter and forgotten for the other.
 */
export function cffJs2LintRules(): Record<string, LintRuleSetting> {
  return {
    ...relaxedRules,
    ...builtInRules,
    ...cffJs2LintPluginRules(),
  };
}
