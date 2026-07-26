import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaResourcePolicies } from "../../command/authorize/sim-lambda-resource-policies.js";
import { simLambdaFunctionUrlAuthTypeConditionKey } from "../../function/policy/sim-lambda-permission.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";

/**
 * The IAM action a Function URL invocation is authorized against.
 *
 * This is deliberately not `lambda:InvokeFunction`, which is what the Invoke
 * API maps to. Real AWS separates the two so a policy can grant the HTTP
 * endpoint without granting the SDK operation, and a test asserting on that
 * distinction should see it hold here.
 */
export const simLambdaInvokeFunctionUrlAction = "lambda:InvokeFunctionUrl";

interface SimLambdaUrlAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimLambdaUrlAuthorizationInput {
  readonly simFunction: SimLambdaFunction;
  readonly functionUrl: SimLambdaFunctionUrl;
  readonly caller: SimAwsCaller;
}

/**
 * Decides whether a caller may invoke a Function URL.
 *
 * The answer is a decision rather than a thrown error, because a refusal is an
 * ordinary HTTP outcome here: the endpoint answers 403 in the shape real Lambda
 * does, with nothing to propagate to a caller in process.
 *
 * Both sides of Lambda authorization are evaluated: the caller's identity
 * policies, and the function's own resource policy, which is the only thing
 * that can allow a principal from another Account.
 */
export class SimLambdaUrlAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaUrlAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate `lambda:InvokeFunctionUrl` for a caller against a Function URL.
   *
   * The URL's auth type is supplied as `lambda:FunctionUrlAuthType`, which is
   * what a grant conditions on in practice: a permission granted for `AWS_IAM`
   * should not also open a URL later switched to `NONE`.
   */
  authorize(
    input: SimLambdaUrlAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.iam.authorize({
      action: simLambdaInvokeFunctionUrlAction,
      resource: input.simFunction.arn,
      caller: input.caller,
      resourcePolicies: simLambdaResourcePolicies(input.simFunction),
      conditionContext: {
        [simLambdaFunctionUrlAuthTypeConditionKey]: input.functionUrl.authType,
      },
    });
  }
}
