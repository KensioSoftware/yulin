import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";

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

/**
 * Decides whether a caller may invoke a Function URL.
 *
 * The answer is a decision rather than a thrown error, because a refusal is an
 * ordinary HTTP outcome here: the endpoint answers 403 in the shape real Lambda
 * does, with nothing to propagate to a caller in process.
 */
export class SimLambdaUrlAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaUrlAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate `lambda:InvokeFunctionUrl` for a caller against a function ARN.
   */
  authorize(
    functionArn: string,
    caller: SimAwsCaller,
  ): SimIamAuthorizationDecision {
    return this.iam.authorize({
      action: simLambdaInvokeFunctionUrlAction,
      resource: functionArn,
      caller,
    });
  }
}
