import type { SimWafValueTest } from "./sim-waf-field-match.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";

/**
 * Minimal structural WAFv2 SizeConstraintStatement.
 */
export interface SimWafSizeConstraintStatementInput {
  readonly ComparisonOperator?: string | undefined;
  readonly Size?: number | undefined;
}

const encoder = new TextEncoder();

const comparisons = new Map<string, (size: number, against: number) => boolean>(
  [
    ["EQ", (size, against): boolean => size === against],
    ["NE", (size, against): boolean => size !== against],
    ["LE", (size, against): boolean => size <= against],
    ["LT", (size, against): boolean => size < against],
    ["GE", (size, against): boolean => size >= against],
    ["GT", (size, against): boolean => size > against],
  ],
);

/**
 * Build the test a SizeConstraintStatement puts each string through.
 *
 * The size is in bytes rather than characters, and it is the size after the
 * rule's text transformations have run: a rule that decodes before it measures
 * is measuring the decoded value.
 */
export function simWafSizeTest(
  statement: SimWafSizeConstraintStatementInput,
  ruleName: string,
): SimWafValueTest {
  const compare = comparisons.get(statement.ComparisonOperator ?? "");
  const against = statement.Size;

  if (compare === undefined) {
    invalidSimWafRule(
      ruleName,
      `The comparison operator ${String(statement.ComparisonOperator)} is ` +
        `not valid`,
    );
  }

  if (against === undefined) {
    invalidSimWafRule(ruleName, "SizeConstraintStatement needs a Size");
  }

  return (value): boolean => compare(encoder.encode(value).length, against);
}
