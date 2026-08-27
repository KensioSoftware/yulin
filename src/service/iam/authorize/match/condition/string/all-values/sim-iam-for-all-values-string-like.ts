import { simIamStringLikeComparison } from "../../sim-iam-string-comparison.js";
import { SimIamForAllValuesStringConditionOperator } from "./sim-iam-for-all-values-string-condition-operator.js";

/**
 * IAM `ForAllValues:StringLike` condition operator.
 */
export class SimIamForAllValuesStringLike extends SimIamForAllValuesStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamStringLikeComparison(actual, expected);
  }
}
