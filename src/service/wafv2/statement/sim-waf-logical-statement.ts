import {
  compileSimWafStatement,
  type SimWafStatementScope,
} from "./sim-waf-statement.js";
import type { SimWafMatcher } from "./sim-waf-field-match.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * Build the matcher for a statement that joins or negates other statements.
 *
 * These are the last kinds tried, because a statement that is none of them and
 * none of the field statements either names no kind at all.
 */
export function compileSimWafLogicalStatement(
  statement: SimWafStatementInput,
  scope: SimWafStatementScope,
): SimWafMatcher {
  if (statement.AndStatement !== undefined) {
    const matchers = compileAll(
      "AndStatement",
      statement.AndStatement.Statements,
      scope,
    );

    return (request): boolean => matchers.every((matches) => matches(request));
  }

  if (statement.OrStatement !== undefined) {
    const matchers = compileAll(
      "OrStatement",
      statement.OrStatement.Statements,
      scope,
    );

    return (request): boolean => matchers.some((matches) => matches(request));
  }

  if (statement.NotStatement !== undefined) {
    const negated = statement.NotStatement.Statement;

    // Named here rather than left to `compileSimWafStatement`, which would
    // report the rule as having no statement at all and send the reader to the
    // wrong place in a rule holding several.
    if (negated === undefined) {
      invalidSimWafRule(
        scope.ruleName,
        "A NotStatement needs the one statement it negates",
      );
    }

    const matches = compileSimWafStatement(negated, scope);

    return (request): boolean => !matches(request);
  }

  invalidSimWafRule(scope.ruleName, "The statement names no statement kind");
}

/**
 * Compile the statements a logical statement joins, refusing fewer than two.
 *
 * Real WAF holds this minimum hard enough to refuse the whole web ACL over it,
 * answering `OR_STATEMENT` and a threshold setting. A rule joining one
 * statement evaluates as that statement on its own, and an `AndStatement` with
 * an empty list would match every request while looking like it narrowed one.
 */
function compileAll(
  kind: "AndStatement" | "OrStatement",
  statements: readonly SimWafStatementInput[] | undefined,
  scope: SimWafStatementScope,
): readonly SimWafMatcher[] {
  const joined = statements ?? [];

  if (joined.length < 2) {
    invalidSimWafRule(
      scope.ruleName,
      `An ${kind} needs at least two statements to join, and this one has ` +
        `${joined.length}`,
    );
  }

  return joined.map((statement) => compileSimWafStatement(statement, scope));
}
