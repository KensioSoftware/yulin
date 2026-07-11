import { simIamWildcardMatch } from "../../../../sim-iam-wildcard.js";
import { SimIamScalarStringConditionOperator } from "../sim-iam-scalar-string-condition-operator.js";

/**
 * IAM `StringLike` condition operator.
 */
export class SimIamStringLike extends SimIamScalarStringConditionOperator {
  protected override valueMatches(actual: string, expected: string): boolean {
    return simIamWildcardMatch(expected, actual, {
      caseSensitive: true,
    });
  }
}
