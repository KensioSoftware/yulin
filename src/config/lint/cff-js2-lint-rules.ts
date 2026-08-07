import { cffJs2LintPlugin, cffJs2PluginName } from "./cff-js2-lint-plugin.js";

/**
 * One rule setting, in the form both linters read it.
 */
export type LintRuleSetting =
  | "off"
  | "error"
  | readonly ["error", Readonly<Record<string, string>>];

/**
 * Rules a general JavaScript config turns on that JS2 cannot satisfy.
 *
 * Only advice the runtime makes impossible is relaxed. `const`, `let` and
 * template literals are all supported in JS2, so the rules asking for them
 * stay on: switching them off would tell a reader that `var` and string
 * concatenation are required here, which is its own kind of wrong answer.
 *
 * Shorthand object properties are ES 6 literal syntax the runtime's feature
 * list does not name, so that one is genuinely unavailable.
 */
const relaxedRules: Readonly<Record<string, LintRuleSetting>> = {
  "object-shorthand": "off",
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
