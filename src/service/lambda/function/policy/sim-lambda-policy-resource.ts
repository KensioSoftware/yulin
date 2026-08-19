import type { SimLambdaFunctionArn } from "../sim-lambda-function-configuration.js";
import type { SimLambdaFunctionPolicy } from "./sim-lambda-function-policy.js";

/**
 * Something a Lambda resource policy can be granted on: a function, one of its
 * published versions, or one of its aliases.
 *
 * Real Lambda holds a policy per qualified resource rather than one per
 * function, so a grant made on the alias `live` admits a call on `live` and
 * says nothing about the version behind it. Each of the three answers for its
 * own ARN and its own policy, which is all `AddPermission`, `GetPolicy` and
 * authorization need of them.
 */
export interface SimLambdaPolicyResource {
  readonly arn: SimLambdaFunctionArn;
  readonly resourcePolicy: SimLambdaFunctionPolicy;
}
