import type { SimIamConditionValue } from "../../../../policy/sim-iam-policy.js";
import type { SimIamVariableMode } from "../../variable/sim-iam-policy-variables.js";

/**
 * One value from a condition, on either side of a comparison.
 *
 * A request value or a policy value can be a list. A comparison is always
 * between one value from each side, and the operator decides which pairs to
 * compare.
 */
export type SimIamScalarConditionValue = Exclude<
  SimIamConditionValue,
  readonly string[]
>;

/**
 * Compares one request value with one policy value.
 *
 * The answer is undefined when either value is not of the kind the comparison
 * reads, such as a word given to a numeric operator. The operator then fails
 * the whole condition. A negated operator would otherwise turn a value it
 * cannot read into a match.
 */
export type SimIamValueComparison = (
  actual: SimIamScalarConditionValue,
  expected: SimIamScalarConditionValue,
) => boolean | undefined;

/**
 * The comparison behind one operator keyword, and whether the keyword negates
 * it.
 *
 * `StringNotEquals` is the `StringEquals` comparison with `negated` set. A
 * negated operator needs the request value to differ from every policy value,
 * where a positive one needs it to equal any of them.
 */
export interface SimIamComparisonKeyword {
  readonly comparison: SimIamValueComparison;
  readonly negated: boolean;

  /**
   * How a policy value is read once its policy variables are replaced, or
   * undefined for a keyword that takes none.
   *
   * AWS replaces variables under the String and ARN operators only. A
   * `${...}` under any other operator is literal text.
   */
  readonly substitution?: SimIamVariableMode | undefined;
}

/**
 * Read a condition value as the list of values it holds.
 */
export function simIamScalarValues(
  value: SimIamConditionValue,
): readonly SimIamScalarConditionValue[] {
  return typeof value === "object" ? value : [value];
}
