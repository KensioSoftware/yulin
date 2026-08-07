import { smartassPreferSpecificAssertions } from "@kensio/smartass/eslint";

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
 * The name the assertion advice from `@kensio/smartass` is reported under.
 */
export const preferSpecificAssertionsRuleName = "prefer-specific-assertions";

/**
 * Every selector `@kensio/smartass` asks for, read out of its shared config.
 *
 * Smartass ships its advice as a `no-restricted-syntax` block rather than as a
 * plugin, so there is nothing to load: the selectors have to be lifted out of
 * the config it publishes and rehoused in a rule here. Reading them rather than
 * copying them is what stops the two drifting.
 */
export function smartassSyntaxRestrictions(): readonly RepoSyntaxRestriction[] {
  return smartassPreferSpecificAssertions.flatMap((config) => {
    const entry = (config as { rules?: Record<string, unknown> }).rules?.[
      "no-restricted-syntax"
    ];

    return Array.isArray(entry)
      ? (entry.slice(1) as readonly RepoSyntaxRestriction[])
      : [];
  });
}

/**
 * Builds one rule from the restrictions that share a concern.
 *
 * A visitor is keyed by selector, so two restrictions matching the same syntax
 * would leave only the later message. The selectors are distinct today, and
 * `repo-lint-plugin.iso.test.ts` fails if one goes missing.
 */
function messageId(index: number): string {
  return `restriction${String(index)}`;
}

function restrictionRule(
  restrictions: readonly RepoSyntaxRestriction[],
): LintRule {
  return {
    meta: {
      type: "problem",
      schema: [],
      messages: Object.fromEntries(
        restrictions.map((restriction, index) => [
          messageId(index),
          restriction.message,
        ]),
      ),
    },
    create: (context: LintRuleContext): LintVisitor =>
      Object.fromEntries(
        restrictions.map((restriction, index) => [
          restriction.selector,
          (node: LintNode): void => {
            context.report({ node, messageId: messageId(index) });
          },
        ]),
      ),
  };
}

function buildRules(): Record<string, LintRule> {
  const own = Object.entries(repoSyntaxRestrictions).map(
    ([name, restriction]) => [name, restrictionRule([restriction])] as const,
  );

  return {
    ...Object.fromEntries(own),
    [preferSpecificAssertionsRuleName]: restrictionRule(
      smartassSyntaxRestrictions(),
    ),
  };
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
