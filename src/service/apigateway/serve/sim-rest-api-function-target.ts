import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionTarget } from "../../lambda/function/version/sim-lambda-function-target.js";

/**
 * A function a REST API invokes, and what decides whether it may.
 *
 * What the API invokes is what any service delivering to a function ARN
 * invokes, so the resource named and the version that runs come from Lambda's
 * own target. All this adds is the IAM the decision is made in.
 */
export interface SimRestApiFunctionTarget extends SimLambdaFunctionTarget {
  /**
   * IAM of the Account that owns the function, which is what the API's invoke
   * permission is evaluated against. It need not be the API's Account.
   */
  readonly iam: SimIamInterServiceAuthZ;
}
