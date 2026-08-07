/**
 * The plugin entry point Oxlint loads.
 *
 * Oxlint reads a JS plugin from a module's default export, where ESLint takes
 * the plugin object from wherever a config puts it, so this file exists only
 * to present the same plugin the way Oxlint expects to find it.
 */
export { cffJs2LintPlugin as default } from "./cff-js2-lint-plugin.js";
