import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";
import { SimIamForAllValuesStringEquals } from "./string/all-values/sim-iam-for-all-values-string-equals.js";
import { SimIamForAllValuesStringLike } from "./string/all-values/sim-iam-for-all-values-string-like.js";
import { SimIamForAnyValueStringEquals } from "./string/any-value/sim-iam-for-any-value-string-equals.js";
import { SimIamForAnyValueStringLike } from "./string/any-value/sim-iam-for-any-value-string-like.js";
import { SimIamStringEquals } from "./string/equals/sim-iam-string-equals.js";
import { SimIamStringLike } from "./string/like/sim-iam-string-like.js";

type SimIamConditionOperatorFactory = () => SimIamConditionOperator;

/* eslint-disable @typescript-eslint/naming-convention */

const operatorFactories: Readonly<
  Record<string, SimIamConditionOperatorFactory>
> = {
  StringEquals: () => new SimIamStringEquals(),
  StringLike: () => new SimIamStringLike(),
  "ForAnyValue:StringEquals": () => new SimIamForAnyValueStringEquals(),
  "ForAnyValue:StringLike": () => new SimIamForAnyValueStringLike(),
  "ForAllValues:StringEquals": () => new SimIamForAllValuesStringEquals(),
  "ForAllValues:StringLike": () => new SimIamForAllValuesStringLike(),
};

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
    // eslint-disable-next-line security/detect-object-injection
    return operatorFactories[keyword]?.();
  }
}
