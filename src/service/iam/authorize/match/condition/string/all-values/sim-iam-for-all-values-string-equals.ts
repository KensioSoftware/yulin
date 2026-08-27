import { simIamStringEqualsComparison } from "../../sim-iam-string-comparison.js";
import { SimIamForAllValuesStringConditionOperator } from "./sim-iam-for-all-values-string-condition-operator.js";

/**
 * IAM `ForAllValues:StringEquals` condition operator.
 */
export class SimIamForAllValuesStringEquals extends SimIamForAllValuesStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamStringEqualsComparison(actual, expected);
  }
}
