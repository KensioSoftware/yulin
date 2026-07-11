import { SimIamScalarStringConditionOperator } from "../sim-iam-scalar-string-condition-operator.js";

/**
 * IAM `StringEquals` condition operator.
 */
export class SimIamStringEquals extends SimIamScalarStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return actual === expected;
  }
}
