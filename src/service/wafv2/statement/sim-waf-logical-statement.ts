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
    const matchers = compileAll(statement.AndStatement.Statements, scope);

    return (request): boolean => matchers.every((matches) => matches(request));
  }

  if (statement.OrStatement !== undefined) {
    const matchers = compileAll(statement.OrStatement.Statements, scope);

    return (request): boolean => matchers.some((matches) => matches(request));
  }

  if (statement.NotStatement !== undefined) {
    const matches = compileSimWafStatement(
      statement.NotStatement.Statement,
      scope,
    );

    return (request): boolean => !matches(request);
  }

  invalidSimWafRule(scope.ruleName, "The statement names no statement kind");
}

/**
 * Compile the statements a logical statement joins, refusing an empty list.
 *
 * Real WAF requires at least two, and an `AndStatement` with none would
 * otherwise match every request while looking like it narrowed one.
 */
function compileAll(
  statements: readonly SimWafStatementInput[] | undefined,
  scope: SimWafStatementScope,
): readonly SimWafMatcher[] {
  if (statements === undefined || statements.length === 0) {
    invalidSimWafRule(
      scope.ruleName,
      "An AndStatement or OrStatement needs statements to join",
    );
  }

  return statements.map((statement) =>
    compileSimWafStatement(statement, scope),
  );
}
