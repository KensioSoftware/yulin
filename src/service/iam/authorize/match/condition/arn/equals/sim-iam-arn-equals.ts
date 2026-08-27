import { simIamArnComparison } from "../../sim-iam-string-comparison.js";
import { SimIamScalarStringConditionOperator } from "../../string/sim-iam-scalar-string-condition-operator.js";

/**
 * IAM `ArnEquals` condition operator.
 *
 * AWS documents `ArnEquals` and `ArnLike` as behaving identically: both
 * compare the six components of an ARN separately, and both accept `*` and `?`
 * wildcards in any of them. So a policy written with either operator is
 * evaluated the same way here, rather than `ArnEquals` being the exact-string
 * comparison its name suggests.
 */
export class SimIamArnEquals extends SimIamScalarStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamArnComparison(actual, expected);
  }
}
