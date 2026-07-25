import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";
import { SimIamForAllValuesStringEquals } from "./string/all-values/sim-iam-for-all-values-string-equals.js";
import { SimIamForAllValuesStringLike } from "./string/all-values/sim-iam-for-all-values-string-like.js";
import { SimIamForAnyValueStringEquals } from "./string/any-value/sim-iam-for-any-value-string-equals.js";
import { SimIamForAnyValueStringLike } from "./string/any-value/sim-iam-for-any-value-string-like.js";
import { SimIamStringEquals } from "./string/equals/sim-iam-string-equals.js";
import { SimIamStringLike } from "./string/like/sim-iam-string-like.js";
import { SimIamNumericLessThanEquals } from "./numeric/less-than-equals/sim-iam-number-lte.js";

type SimIamConditionOperatorFactory = () => SimIamConditionOperator;

const operatorFactories = new Map<string, SimIamConditionOperatorFactory>([
  [
    "NumericLessThanEquals",
    (): SimIamConditionOperator => new SimIamNumericLessThanEquals(),
  ],
  ["StringEquals", (): SimIamConditionOperator => new SimIamStringEquals()],
  ["StringLike", (): SimIamConditionOperator => new SimIamStringLike()],
  [
    "ForAnyValue:StringEquals",
    (): SimIamConditionOperator => new SimIamForAnyValueStringEquals(),
  ],
  [
    "ForAnyValue:StringLike",
    (): SimIamConditionOperator => new SimIamForAnyValueStringLike(),
  ],
  [
    "ForAllValues:StringEquals",
    (): SimIamConditionOperator => new SimIamForAllValuesStringEquals(),
  ],
  [
    "ForAllValues:StringLike",
    (): SimIamConditionOperator => new SimIamForAllValuesStringLike(),
  ],
]);

/**
 * Parses IAM condition operator keywords into their behavior objects.
 *
 * Unsupported operators return undefined so condition evaluation fails closed
 * without throwing.
 */
export class SimIamConditionOperatorParser {
  /**
   * Parse a keyword into a condition operator, if supported.
   */
  parse(keyword: string): SimIamConditionOperator | undefined {
    return operatorFactories.get(keyword)?.();
  }
}
