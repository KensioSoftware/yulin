import { cffJs2UnavailableGlobals } from "./cff-js2-restriction.js";
import type {
  LintNode,
  LintRule,
  LintRuleContext,
  LintVisitor,
} from "./lint-plugin.type.js";

/**
 * Scope is only complete once the whole file has been walked, so the globals a
 * file reaches for are counted on the way out of it rather than on the way in.
 */
const programExitSelector = "Program:exit";

const reasons = new Map<string, string>(
  Object.entries(cffJs2UnavailableGlobals),
);

/**
 * Reports a name the CloudFront Functions runtime does not provide.
 *
 * Names are resolved through scope rather than matched as text, so a local
 * variable called `fetch` and a property called `event.fetch` are both left
 * alone: what is reported is a reference that would reach a global.
 */
export function cffJs2UnavailableGlobalRule(): LintRule {
  return {
    meta: {
      type: "problem",
      schema: [],
      messages: { unsupported: "{{why}}" },
    },
    create: (context: LintRuleContext): LintVisitor => ({
      [programExitSelector]: (node: LintNode): void => {
        const scope = context.sourceCode.getScope(node);

        for (const reference of [
          ...scope.through,
          ...scope.variables.flatMap((variable) => variable.references),
        ]) {
          const why = reasons.get(reference.identifier.name);

          if (why !== undefined) {
            context.report({
              node: reference.identifier,
              messageId: "unsupported",
              data: { why },
            });
          }
        }
      },
    }),
  };
}
