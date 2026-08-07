import type {
  LintNode,
  LintPlugin,
  LintRule,
  LintRuleContext,
  LintVisitor,
} from "./lint-plugin.type.js";

/**
 * This repository's own lint restrictions, as a plugin Oxlint can load.
 *
 * Two constraints shape this file, and both are worth knowing before editing
 * it.
 *
 * It is one file rather than the three the CloudFront Functions plugin next
 * door is split across. Oxlint imports a JS plugin through Node, and `.ts` gets
 * there on Node's own type stripping rather than a loader — `tsx` breaks
 * `eslint-plugin-no-secrets` when it is in the path, and `jiti` hands Oxlint a
 * module wrapper instead of the plugin. Type stripping does not rewrite a
 * `./x.js` specifier to `./x.ts`, so a relative *value* import here would not
 * resolve at lint time. Type-only imports are erased before Node sees them,
 * which is why the ones above are fine.
 *
 * The restrictions are named rules rather than a `no-restricted-syntax` block.
 * Oxlint has no equivalent of that rule, but the shape is the better one
 * regardless: a report says which restriction fired instead of quoting a
 * selector, one can be switched off without restating the others, and two
 * configs setting it cannot silently replace each other. That last one is not
 * hypothetical — under ESLint, `@kensio/smartass` setting `no-restricted-syntax`
 * turned this repository's own restrictions off for 265 commits.
 *
 * Only this repository's own restrictions live here. The assertion advice from
 * `@kensio/smartass` used to as well, lifted out of the `no-restricted-syntax`
 * block in the config it published because there was nothing else to load.
 * Since 1.37.0 it publishes a real Oxlint plugin, so `.oxlintrc.json` loads
 * `smartass/prefer-specific-assertions` from the package instead.
 */

/**
 * One thing this repository will not have written in it.
 */
export interface RepoSyntaxRestriction {
  readonly selector: string;
  readonly message: string;
}

/**
 * The name Oxlint reports these rules under.
 */
export const repoLintPluginName = "yulin";

/**
 * The restrictions this repository sets on itself.
 */
export const repoSyntaxRestrictions = {
  "assert-defined-guard": {
    selector:
      "IfStatement[test.type='BinaryExpression'][test.operator='===']:matches([test.left.type='Identifier'][test.left.name='undefined'], [test.right.type='Identifier'][test.right.name='undefined']):has(ThrowStatement[argument.type='NewExpression'][argument.callee.name='Error'])",
    message:
      "Use `assertDefined(value, description)` instead of throwing `Error` from an `undefined` guard.",
  },
  "assert-not-null-guard": {
    selector:
      "IfStatement[test.type='BinaryExpression'][test.operator='===']:matches([test.left.type='Literal'][test.left.value=null], [test.right.type='Literal'][test.right.value=null]):has(ThrowStatement[argument.type='NewExpression'][argument.callee.name='Error'])",
    message:
      "Use `assertNotNull(value, description)` instead of throwing `Error` from a `null` guard.",
  },
  "no-reused-props": {
    selector:
      "MemberExpression[object.type='ThisExpression'][property.type='Identifier'][property.name='props']",
    message:
      "Do not reuse `this.props`. Destructure constructor props into class members instead.",
  },
} satisfies Readonly<Record<string, RepoSyntaxRestriction>>;

/**
 * The one message id every rule here reports under.
 *
 * Each restriction is its own rule, so a rule never has a second message to
 * tell apart from this one.
 */
const messageId = "restriction";

/**
 * Builds the rule that reports one restriction.
 */
function restrictionRule(restriction: RepoSyntaxRestriction): LintRule {
  return {
    meta: {
      type: "problem",
      schema: [],
      messages: { [messageId]: restriction.message },
    },
    create: (context: LintRuleContext): LintVisitor => ({
      [restriction.selector]: (node: LintNode): void => {
        context.report({ node, messageId });
      },
    }),
  };
}

function buildRules(): Record<string, LintRule> {
  return Object.fromEntries(
    Object.entries(repoSyntaxRestrictions).map(([name, restriction]) => [
      name,
      restrictionRule(restriction),
    ]),
  );
}

/**
 * The plugin `.oxlintrc.json` names as `yulin`.
 *
 * It is not published. `dist/` carries it because everything under `src/`
 * does, but nothing in `exports` points at it: these are house rules for
 * yulin, not advice for anyone installing yulin.
 */
export const repoLintPlugin: LintPlugin = {
  meta: { name: repoLintPluginName },
  rules: buildRules(),
};

export default repoLintPlugin;
