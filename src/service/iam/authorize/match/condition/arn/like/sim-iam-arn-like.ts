import { simIamArnComparison } from "../../sim-iam-string-comparison.js";
import { SimIamScalarStringConditionOperator } from "../../string/sim-iam-scalar-string-condition-operator.js";

/**
 * IAM `ArnLike` condition operator.
 *
 * This is `StringLike` over an ARN, with the wildcards confined to the
 * component they are written in. It is what `AddPermission` writes a
 * `SourceArn` under, so it is the operator an invoking service's grant is
 * evaluated with.
 */
export class SimIamArnLike extends SimIamScalarStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamArnComparison(actual, expected);
  }
}
