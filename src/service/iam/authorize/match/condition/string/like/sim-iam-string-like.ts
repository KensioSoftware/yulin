import { simIamStringLikeComparison } from "../../sim-iam-string-comparison.js";
import { SimIamScalarStringConditionOperator } from "../sim-iam-scalar-string-condition-operator.js";

/**
 * IAM `StringLike` condition operator.
 */
export class SimIamStringLike extends SimIamScalarStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamStringLikeComparison(actual, expected);
  }
}
