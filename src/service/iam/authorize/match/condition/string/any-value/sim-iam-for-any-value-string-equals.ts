import { simIamStringEqualsComparison } from "../../sim-iam-string-comparison.js";
import { SimIamForAnyValueStringConditionOperator } from "./sim-iam-for-any-value-string-condition-operator.js";

/**
 * IAM `ForAnyValue:StringEquals` condition operator.
 */
export class SimIamForAnyValueStringEquals extends SimIamForAnyValueStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamStringEqualsComparison(actual, expected);
  }
}
