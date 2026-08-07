import {
  cffJs2SyntaxRestrictions,
  cffJs2UnavailableGlobalRuleName,
} from "./cff-js2-restriction.js";
import { cffJs2UnavailableGlobalRule } from "./cff-js2-unavailable-global.rule.js";
import type {
  LintNode,
  LintPlugin,
  LintRule,
  LintRuleContext,
  LintVisitor,
} from "./lint-plugin.type.js";

/**
 * The name both linters report these rules under.
 */
export const cffJs2PluginName = "cff-js2";

function syntaxRule(selector: string, message: string): LintRule {
  return {
    meta: { type: "problem", schema: [], messages: { unsupported: message } },
    create: (context: LintRuleContext): LintVisitor => ({
      [selector]: (node: LintNode): void => {
        context.report({ node, messageId: "unsupported" });
      },
    }),
  };
}

function buildRules(): Record<string, LintRule> {
  return {
    [cffJs2UnavailableGlobalRuleName]: cffJs2UnavailableGlobalRule(),
    ...Object.fromEntries(
      Object.entries(cffJs2SyntaxRestrictions).map(([name, restriction]) => [
        name,
        syntaxRule(restriction.selector, restriction.message),
      ]),
    ),
  };
}

/**
 * A lint plugin holding what CloudFront Functions JS2 refuses to run.
 *
 * The same object loads into ESLint as a plugin and into Oxlint as a JS
 * plugin, because both walk the tree with the same selector syntax and hand a
 * rule the same context. Publishing it as rules rather than as a
 * `no-restricted-syntax` block is what makes that possible, and it also lets a
 * consumer switch off one restriction without restating the other ten.
 */
export const cffJs2LintPlugin: LintPlugin = {
  meta: { name: cffJs2PluginName },
  rules: buildRules(),
};
