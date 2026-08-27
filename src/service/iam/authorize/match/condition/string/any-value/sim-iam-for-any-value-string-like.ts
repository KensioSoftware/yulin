import { simIamStringLikeComparison } from "../../sim-iam-string-comparison.js";
import { SimIamForAnyValueStringConditionOperator } from "./sim-iam-for-any-value-string-condition-operator.js";

/**
 * IAM `ForAnyValue:StringLike` condition operator.
 */
export class SimIamForAnyValueStringLike extends SimIamForAnyValueStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamStringLikeComparison(actual, expected);
  }
}
